import { Router } from "express";
import { db } from "@workspace/db";
import { advancePaymentsTable, overtimeTable, payrollAdjustmentsTable, payrollTable } from "@workspace/db/schema/payroll";
import { employeesTable } from "@workspace/db/schema/employees";
import { attendanceTable } from "@workspace/db/schema/attendance";
import { leavesTable } from "@workspace/db/schema/leaves";
import { settingsTable } from "@workspace/db/schema/settings";
import { desc, eq, ilike, count, sql, and, gte, lte, or } from "@workspace/db/drizzle";
import { requireAuth, requirePermission } from "../middlewares/auth.js";
import { createAuditLog } from "../lib/audit.js";
import { createPayslipPdfFilename, generatePayslipPdf } from "../lib/pdf.js";
import JSZip from "jszip";

const router = Router();

const fmtPayroll = (p: any, empName?: string) => ({
  ...p,
  employeeName: empName || "Unknown",
  basicSalary: Number(p.basicSalary),
  hra: Number(p.hra || 0),
  allowances: Number(p.allowances || 0),
  deductions: Number(p.deductions || 0),
  overtimeHours: Number(p.overtimeHours || 0),
  overtimeAmount: Number(p.overtimeAmount || 0),
  advanceDeduction: Number(p.advanceDeduction || 0),
  bonusAmount: Number(p.bonusAmount || 0),
  otherPayments: Number(p.otherPayments || 0),
  pf: Number(p.pf || 0),
  esic: Number(p.esic || 0),
  netSalary: Number(p.netSalary),
});

const isEmployeeSelfOnly = (role: string) => {
  return role.toLowerCase().trim() === "employee";
};

const getPayrollFilter = (req: any) => {
  if (isEmployeeSelfOnly(req.user.role)) {
    return eq(employeesTable.email, req.user.email);
  }
  return undefined;
};

const getOverlapDays = (leaveStart: string | Date, leaveEnd: string | Date, periodStart: string, periodEnd: string) => {
  const start = new Date(leaveStart);
  const end = new Date(leaveEnd);
  const periodFrom = new Date(periodStart);
  const periodTo = new Date(periodEnd);
  const overlapStart = start > periodFrom ? start : periodFrom;
  const overlapEnd = end < periodTo ? end : periodTo;
  if (overlapEnd < overlapStart) return 0;
  return Math.ceil((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
};

const normalizeLeaveStatus = (leaveType: string) => {
  const type = (leaveType || "").toLowerCase();
  if (type.includes("sick")) return "sick_leave";
  if (type.includes("half")) return "half_day";
  if (type.includes("unpaid")) return "unpaid_leave";
  if (type.includes("week") || type.includes("off")) return "week_off";
  if (type.includes("holiday")) return "holiday";
  return "paid_leave";
};

const getDatesBetween = (startDate: string | Date, endDate: string | Date) => {
  const toDate = (value: string | Date) => {
    if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
    return new Date(year, month - 1, day);
  };
  const toDateString = (value: Date) =>
    `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;

  const start = toDate(startDate);
  const end = toDate(endDate);
  const dates: string[] = [];
  for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
    dates.push(toDateString(dt));
  }
  return dates;
};

const getMonthDays = (month: string) => {
  const [year, mon] = month.split("-").map(Number);
  const lastDay = new Date(year, mon, 0).getDate();
  return Array.from({ length: lastDay }, (_, index) => {
    const day = index + 1;
    const date = new Date(year, mon - 1, day);
    return {
      day,
      dateStr: `${month}-${String(day).padStart(2, "0")}`,
      dow: date.getDay(),
    };
  });
};

const WHATSAPP_RECIPIENT_NUMBER = "919600579204";
const WHATSAPP_RECIPIENT_DISPLAY = "+91 96005 79204";

const buildWhatsAppMessage = (pay: any, emp: any, settings: any, hostUrl: string) => {
  const template = settings?.payslipMessageTemplate ||
    "Hello {{employeeName}}, your payslip for {{month}} is ready. Net salary: {{netSalary}}. Download your payslip here: {{payslipUrl}}";
  const netSalary = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(pay.netSalary || 0));
  return template
    .replace(/\{\{employeeName\}\}/g, `${emp.firstName} ${emp.lastName}`)
    .replace(/\{\{month\}\}/g, pay.month)
    .replace(/\{\{netSalary\}\}/g, netSalary)
    .replace(/\{\{workingDays\}\}/g, String(pay.workingDays || ""))
    .replace(/\{\{presentDays\}\}/g, String(pay.presentDays || ""))
    .replace(/\{\{absentDays\}\}/g, String(pay.absentDays || ""))
    .replace(/\{\{payslipUrl\}\}/g, `${hostUrl}/api/payroll/${pay.id}/payslip`);
};

router.get("/payroll/stats", requireAuth, requirePermission("payroll", "view"), async (req: any, res: any) => {
  try {
    const filter = getPayrollFilter(req);
    const query = db.select({
      totalPaid: sql<number>`sum(net_salary) filter (where status = 'paid')`,
      totalPending: sql<number>`sum(net_salary) filter (where status = 'pending')`,
      thisMonth: sql<number>`sum(net_salary) filter (where month = to_char(now(), 'YYYY-MM'))`,
    }).from(payrollTable);
    const [stats] = filter
      ? await query.leftJoin(employeesTable, eq(payrollTable.employeeId, employeesTable.id)).where(filter)
      : await query;
    res.json({ totalPaid: Number(stats.totalPaid) || 0, totalPending: Number(stats.totalPending) || 0, thisMonth: Number(stats.thisMonth) || 0 });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/payroll", requireAuth, requirePermission("payroll", "view"), async (req: any, res: any) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const search = req.query.search as string;
    const status = req.query.status as string;
    const month = req.query.month as string;
    const offset = (page - 1) * limit;

    let conditions: any[] = [];
    if (search) {
      conditions.push(or(
        ilike(employeesTable.firstName, `%${search}%`),
        ilike(employeesTable.lastName, `%${search}%`),
        ilike(employeesTable.email, `%${search}%`)
      ));
    }
    if (status) conditions.push(eq(payrollTable.status, status));
    if (month) conditions.push(eq(payrollTable.month, month));

    const filter = getPayrollFilter(req);
    let whereClause: any = filter;
    if (conditions.length > 0) {
      whereClause = filter ? and(...conditions, filter) : and(...conditions);
    }

    const [{ total }] = await db.select({ total: count() })
      .from(payrollTable)
      .leftJoin(employeesTable, eq(payrollTable.employeeId, employeesTable.id))
      .where(whereClause);
    const records = await db.select({ pay: payrollTable, emp: { firstName: employeesTable.firstName, lastName: employeesTable.lastName, salary: employeesTable.salary, department: employeesTable.department, designation: employeesTable.designation, imageUrl: employeesTable.imageUrl } })
      .from(payrollTable).leftJoin(employeesTable, eq(payrollTable.employeeId, employeesTable.id))
      .where(whereClause).limit(limit).offset(offset).orderBy(desc(payrollTable.createdAt), desc(payrollTable.id));
    res.json({ data: records.map(r => fmtPayroll(r.pay, r.emp ? `${r.emp.firstName} ${r.emp.lastName}` : undefined)), pagination: { page, limit, total: Number(total), totalPages: Math.ceil(Number(total) / limit) } });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

// Generate payroll based on attendance and salary formula
router.post("/payroll/generate", requireAuth, requirePermission("payroll", "create"), async (req: any, res: any) => {
  try {
    const { employeeId, month, excusedAbsences = [], excuseNotes, markPaid = false } = req.body;
    const shouldMarkPaid = Boolean(markPaid);
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, Number(employeeId))).limit(1);
    if (!emp) { res.status(404).json({ error: "Employee not found" }); return; }
    if (emp.status !== "active") { res.status(400).json({ error: "Payroll can only be generated for active employees" }); return; }

    // Get attendance for the month
    const startDate = `${month}-01`;
    const [year, mon] = month.split("-").map(Number);
    const lastDay = new Date(year, mon, 0).getDate();
    const endDate = `${month}-${String(lastDay).padStart(2, "0")}`;
    
    const attendance = await db.select().from(attendanceTable)
      .where(and(eq(attendanceTable.employeeId, Number(employeeId)), gte(attendanceTable.date, startDate), lte(attendanceTable.date, endDate)));
    const approvedLeaves = await db.select().from(leavesTable)
      .where(and(eq(leavesTable.employeeId, Number(employeeId)), eq(leavesTable.status, "approved"), lte(leavesTable.startDate, endDate), gte(leavesTable.endDate, startDate)));
    const overtime = await db.select().from(overtimeTable)
      .where(and(eq(overtimeTable.employeeId, Number(employeeId)), gte(overtimeTable.workDate, startDate), lte(overtimeTable.workDate, endDate)));
    const advances = await db.select().from(advancePaymentsTable)
      .where(and(eq(advancePaymentsTable.employeeId, Number(employeeId)), eq(advancePaymentsTable.deductionMonth, month)));
    const adjustments = await db.select().from(payrollAdjustmentsTable)
      .where(and(eq(payrollAdjustmentsTable.employeeId, Number(employeeId)), eq(payrollAdjustmentsTable.month, month)));
    
    const monthDays = getMonthDays(month);
    const totalWorkingDays = monthDays.filter(day => day.dow !== 0).length;
    const attendanceMap = new Map(attendance.map(record => [record.date, record.status]));
    const leaveMap = new Map<string, string>();
    approvedLeaves.forEach((leave) => {
      getDatesBetween(leave.startDate, leave.endDate)
        .filter((date) => date >= startDate && date <= endDate)
        .forEach((date) => leaveMap.set(date, normalizeLeaveStatus(leave.leaveType)));
    });

    const effectiveStatuses = monthDays
      .filter(day => day.dow !== 0)
      .map(({ dateStr }) => attendanceMap.get(dateStr) || leaveMap.get(dateStr) || "present");
    const presentCount = effectiveStatuses.filter(status => ["present", "late", "paid_leave", "sick_leave", "holiday"].includes(status)).length;
    const halfDayCount = effectiveStatuses.filter(status => status === "half_day").length;
    const unpaidLeaveCount = effectiveStatuses.filter(status => status === "unpaid_leave").length;
    const absentCount = effectiveStatuses.filter(status => status === "absent").length;
    const excusedCount = Array.isArray(excusedAbsences) ? excusedAbsences.length : 0;
    const effectiveDays = presentCount + excusedCount + (halfDayCount * 0.5);
    
    const grossSalary = Number(emp.salary);
    const basicPct = Number(emp.basicPercent || 60) / 100;
    const hraPct = Number(emp.hraPercent || 20) / 100;
    const allowancePct = Number(emp.allowancesPercent || 20) / 100;
    
    const dailyRate = grossSalary / totalWorkingDays;
    const actualBasic = grossSalary * basicPct * (effectiveDays / totalWorkingDays);
    const actualHra = grossSalary * hraPct * (effectiveDays / totalWorkingDays);
    const actualAllowance = grossSalary * allowancePct * (effectiveDays / totalWorkingDays);
    
    let pf = 0, esic = 0;
    if (emp.pfEnabled) pf = Math.min(actualBasic * 0.12, 1800);
    if (emp.esicEnabled) esic = (actualBasic + actualHra) * 0.0075;
    
    const overtimeHours = overtime.reduce((sum, record) => sum + Number(record.hours || 0), 0);
    const overtimeAmount = overtime.reduce((sum, record) => sum + Number(record.amount || 0), 0);
    const advanceDeduction = advances.reduce((sum, record) => sum + Number(record.amount || 0), 0);
    const bonusAmount = adjustments.filter(item => item.type === "bonus").reduce((sum, record) => sum + Number(record.amount || 0), 0);
    const otherPayments = adjustments.filter(item => item.type !== "bonus" && item.type !== "deduction").reduce((sum, record) => sum + Number(record.amount || 0), 0);
    const otherDeductions = adjustments.filter(item => item.type === "deduction").reduce((sum, record) => sum + Number(record.amount || 0), 0);
    const deductions = pf + esic + advanceDeduction + otherDeductions;
    const adjustmentSummary = [
      ...overtime.map(record => ({ type: "overtime", label: record.projectId ? `Overtime project #${record.projectId}` : "Overtime", date: record.workDate, hours: Number(record.hours), amount: Number(record.amount) })),
      ...advances.map(record => ({ type: "advance", label: "Advance payment", date: record.paymentDate, amount: -Number(record.amount), referenceNo: record.referenceNo })),
      ...adjustments.map(record => ({ type: record.type, label: record.label, amount: record.type === "deduction" ? -Number(record.amount) : Number(record.amount), notes: record.notes })),
    ];
    const netSalary = actualBasic + actualHra + actualAllowance + overtimeAmount + bonusAmount + otherPayments - deductions;
    
    // Check if payroll already exists for this month
    const existing = await db.select().from(payrollTable)
      .where(and(eq(payrollTable.employeeId, Number(employeeId)), eq(payrollTable.month, month))).limit(1);
    
    const roundedPresentDays = Math.round(effectiveDays);
    const roundedAbsentDays = Math.round(Math.max(0, absentCount + unpaidLeaveCount - excusedCount + (halfDayCount * 0.5)));

    let pay;
    if (existing.length) {
      [pay] = await db.update(payrollTable).set({
        basicSalary: String(Math.round(actualBasic)),
        hra: String(Math.round(actualHra)),
        allowances: String(Math.round(actualAllowance)),
        deductions: String(Math.round(deductions)),
        overtimeHours: String(overtimeHours),
        overtimeAmount: String(Math.round(overtimeAmount)),
        advanceDeduction: String(Math.round(advanceDeduction)),
        bonusAmount: String(Math.round(bonusAmount)),
        otherPayments: String(Math.round(otherPayments)),
        adjustmentSummary,
        pf: String(Math.round(pf)),
        esic: String(Math.round(esic)),
        netSalary: String(Math.round(netSalary)),
        presentDays: roundedPresentDays,
        absentDays: roundedAbsentDays,
        totalWorkingDays,
        formula: emp.salaryFormula || "basic",
        excusedAbsences: excusedAbsences,
        excuseNotes: excuseNotes || null,
        status: shouldMarkPaid ? "paid" : existing[0].status || "pending",
        paidAt: shouldMarkPaid ? new Date() : existing[0].paidAt,
        updatedAt: new Date(),
      }).where(eq(payrollTable.id, existing[0].id)).returning();
    } else {
      [pay] = await db.insert(payrollTable).values({
        employeeId: Number(employeeId),
        month,
        basicSalary: String(Math.round(actualBasic)),
        hra: String(Math.round(actualHra)),
        allowances: String(Math.round(actualAllowance)),
        deductions: String(Math.round(deductions)),
        overtimeHours: String(overtimeHours),
        overtimeAmount: String(Math.round(overtimeAmount)),
        advanceDeduction: String(Math.round(advanceDeduction)),
        bonusAmount: String(Math.round(bonusAmount)),
        otherPayments: String(Math.round(otherPayments)),
        adjustmentSummary,
        pf: String(Math.round(pf)),
        esic: String(Math.round(esic)),
        netSalary: String(Math.round(netSalary)),
        presentDays: roundedPresentDays,
        absentDays: roundedAbsentDays,
        totalWorkingDays,
        formula: emp.salaryFormula || "basic",
        excusedAbsences: excusedAbsences,
        excuseNotes: excuseNotes || null,
        status: shouldMarkPaid ? "paid" : "pending",
        paidAt: shouldMarkPaid ? new Date() : null,
      }).returning();
    }
    
    await createAuditLog({ module: "payroll", action: "generate", recordId: pay.id, userId: req.user!.id, userName: req.user!.name, description: `Generated payroll for ${emp.firstName} ${emp.lastName} (${month})`, newValues: { employeeId, month, netSalary: Math.round(netSalary), overtimeAmount, advanceDeduction, bonusAmount, otherPayments, excusedAbsences } });
    res.status(201).json(fmtPayroll(pay, `${emp.firstName} ${emp.lastName}`));
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/payroll", requireAuth, requirePermission("payroll", "create"), async (req: any, res: any) => {
  try {
    const body = req.body;
    const net = (Number(body.basicSalary) + Number(body.hra || 0) + Number(body.allowances || 0)) - Number(body.deductions || 0) - Number(body.pf || 0) - Number(body.esic || 0);
    const [pay] = await db.insert(payrollTable).values({
      ...body,
      basicSalary: String(body.basicSalary),
      hra: String(body.hra || 0),
      allowances: String(body.allowances || 0),
      deductions: String(body.deductions || 0),
      pf: String(body.pf || 0),
      esic: String(body.esic || 0),
      netSalary: String(body.netSalary || net)
    }).returning();
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, pay.employeeId)).limit(1);
    await createAuditLog({ module: "payroll", action: "create", recordId: pay.id, userId: req.user!.id, userName: req.user!.name, description: `Created payroll for ${emp?.firstName} ${emp?.lastName}`, newValues: body });
    res.status(201).json(fmtPayroll(pay, emp ? `${emp.firstName} ${emp.lastName}` : undefined));
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/payroll/:id", requireAuth, requirePermission("payroll", "view"), async (req: any, res: any) => {
  try {
    const records = await db.select({ pay: payrollTable, emp: { firstName: employeesTable.firstName, lastName: employeesTable.lastName, email: employeesTable.email, salary: employeesTable.salary, department: employeesTable.department, designation: employeesTable.designation, imageUrl: employeesTable.imageUrl } })
      .from(payrollTable).leftJoin(employeesTable, eq(payrollTable.employeeId, employeesTable.id))
      .where(eq(payrollTable.id, Number(req.params.id))).limit(1);
    if (!records.length) { res.status(404).json({ error: "Not found" }); return; }
    const r = records[0];
    if (isEmployeeSelfOnly(req.user!.role) && r.emp?.email !== req.user!.email) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    res.json(fmtPayroll(r.pay, r.emp ? `${r.emp.firstName} ${r.emp.lastName}` : undefined));
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/payroll/:id/payslip", requireAuth, requirePermission("payroll", "view"), async (req: any, res: any) => {
    try {
      const records = await db.select({ pay: payrollTable, emp: employeesTable })
        .from(payrollTable)
        .leftJoin(employeesTable, eq(payrollTable.employeeId, employeesTable.id))
        .where(eq(payrollTable.id, Number(req.params.id)))
        .limit(1);

      if (!records.length || !records[0].emp) { res.status(404).json({ error: "Not found" }); return; }
      const { pay, emp } = records[0];
      if (isEmployeeSelfOnly(req.user!.role) && emp.email !== req.user!.email) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      const month = pay.month;
      const [year, mon] = month.split("-").map(Number);
      const lastDay = new Date(year, mon, 0).getDate();
      const startDate = `${month}-01`;
      const endDate = `${month}-${String(lastDay).padStart(2, "0")}`;
      const leaves = await db.select({
        id: leavesTable.id,
        leaveType: leavesTable.leaveType,
        startDate: leavesTable.startDate,
        endDate: leavesTable.endDate,
        days: leavesTable.days,
        reason: leavesTable.reason,
        status: leavesTable.status,
      }).from(leavesTable).where(and(
        eq(leavesTable.employeeId, emp.id),
        lte(leavesTable.startDate, endDate),
        gte(leavesTable.endDate, startDate),
      )).orderBy(leavesTable.startDate);

      const leaveSummary = leaves.reduce((summary, leave) => {
        const overlapDays = getOverlapDays(leave.startDate, leave.endDate, startDate, endDate);
        const days = Number(leave.days || 0);
        const relevantDays = Math.min(overlapDays, days);
        summary.totalLeaves += relevantDays;
        if (leave.status === "approved") summary.approvedLeaves += relevantDays;
        if (leave.status === "pending") summary.pendingLeaves += relevantDays;
        summary.leaveRecords.push({
          leaveType: leave.leaveType,
          startDate: leave.startDate,
          endDate: leave.endDate,
          days: relevantDays,
          status: leave.status,
          reason: leave.reason,
        });
        return summary;
      }, {
        totalLeaves: 0,
        approvedLeaves: 0,
        pendingLeaves: 0,
        leaveRecords: [] as Array<any>,
      });

      const [settings] = await db.select().from(settingsTable).limit(1);
      const pdf = await generatePayslipPdf(pay, emp, leaveSummary, settings || {});
      const filename = createPayslipPdfFilename(pay, emp);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", String(pdf.length));
      res.send(pdf);
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/payroll/batch/download-zip", requireAuth, requirePermission("payroll", "view"), async (req: any, res: any) => {
  try {
    const payrollIds = Array.isArray(req.body.payrollIds)
      ? req.body.payrollIds.map((id: any) => Number(id)).filter((id: number) => Number.isFinite(id))
      : [];

    if (!payrollIds.length) {
      res.status(400).json({ error: "No payroll IDs provided." });
      return;
    }

    const conditions = payrollIds.map((id: number) => eq(payrollTable.id, id));
    if (!conditions.length) {
      res.status(400).json({ error: "Invalid payroll IDs." });
      return;
    }

    const filter = getPayrollFilter(req);
    const whereClause = filter ? and(or(...conditions), filter) : or(...conditions);

    const records = await db.select({ pay: payrollTable, emp: employeesTable })
      .from(payrollTable)
      .leftJoin(employeesTable, eq(payrollTable.employeeId, employeesTable.id))
      .where(whereClause)
      .orderBy(desc(payrollTable.createdAt), desc(payrollTable.id));

    if (!records.length) {
      res.status(404).json({ error: "No payroll records found for download." });
      return;
    }

    const [settings] = await db.select().from(settingsTable).limit(1);
    const zip = new JSZip();

    const sanitizeFileName = (value: string) =>
      String(value || "payslip")
        .replace(/[^a-z0-9._-]+/gi, "-")
        .replace(/-+/g, "-")
        .replace(/(^-|-$)/g, "");

    for (const record of records) {
      const { pay, emp } = record;
      if (!emp) continue;
      if (isEmployeeSelfOnly(req.user!.role) && emp.email !== req.user!.email) continue;

      const month = pay.month;
      const [year, mon] = String(month).split("-").map(Number);
      const lastDay = new Date(year, mon, 0).getDate();
      const startDate = `${month}-01`;
      const endDate = `${month}-${String(lastDay).padStart(2, "0")}`;

      const leaves = await db.select({
        id: leavesTable.id,
        leaveType: leavesTable.leaveType,
        startDate: leavesTable.startDate,
        endDate: leavesTable.endDate,
        days: leavesTable.days,
        reason: leavesTable.reason,
        status: leavesTable.status,
      }).from(leavesTable).where(and(
        eq(leavesTable.employeeId, emp.id),
        lte(leavesTable.startDate, endDate),
        gte(leavesTable.endDate, startDate),
      )).orderBy(leavesTable.startDate);

      const leaveSummary = leaves.reduce((summary, leave) => {
        const overlapDays = getOverlapDays(leave.startDate, leave.endDate, startDate, endDate);
        const days = Number(leave.days || 0);
        const relevantDays = Math.min(overlapDays, days);
        summary.totalLeaves += relevantDays;
        if (leave.status === "approved") summary.approvedLeaves += relevantDays;
        if (leave.status === "pending") summary.pendingLeaves += relevantDays;
        summary.leaveRecords.push({
          leaveType: leave.leaveType,
          startDate: leave.startDate,
          endDate: leave.endDate,
          days: relevantDays,
          status: leave.status,
          reason: leave.reason,
        });
        return summary;
      }, {
        totalLeaves: 0,
        approvedLeaves: 0,
        pendingLeaves: 0,
        leaveRecords: [] as Array<any>,
      });

      const pdfBuffer = await generatePayslipPdf(pay, emp, leaveSummary, settings || {});
      const filename = sanitizeFileName(`payslip-${emp.firstName || emp.id}-${emp.lastName || ""}-${month}.pdf`);
      zip.file(filename || `payslip-${pay.id}-${month}.pdf`, pdfBuffer);
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="payslips-${Date.now()}.zip"`);
    res.setHeader("Content-Length", String(zipBuffer.length));
    res.setHeader("x-payslip-count", String(records.length));
    res.send(zipBuffer);
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/payroll/:id/send-whatsapp", requireAuth, requirePermission("payroll", "view"), async (req: any, res: any) => {
  try {
    const payrollId = Number(req.params.id);
    if (isNaN(payrollId)) {
      res.status(400).json({ error: "Invalid payroll ID" });
      return;
    }

    const records = await db.select({ pay: payrollTable, emp: employeesTable })
      .from(payrollTable)
      .leftJoin(employeesTable, eq(payrollTable.employeeId, employeesTable.id))
      .where(eq(payrollTable.id, payrollId))
      .limit(1);

    if (!records.length) {
      res.status(404).json({ error: "Payroll record not found" });
      return;
    }

    const record = records[0];
    if (!record.emp) {
      res.status(404).json({ error: "Employee not found for this payroll" });
      return;
    }

    const { pay, emp } = record;
    if (isEmployeeSelfOnly(req.user!.role) && emp.email !== req.user!.email) {
      res.status(403).json({ error: "You can only send your own payslip" });
      return;
    }

    const [settings] = await db.select().from(settingsTable).limit(1);
    if (!settings?.openwaApiUrl || !settings?.openwaApiKey || !settings?.openwaSessionId) {
      res.status(400).json({ error: "OpenWA integration not configured. Please set up OpenWA API URL, API Key, and Session ID in settings." });
      return;
    }

    // Generate PDF
    const month = pay.month;
    const [year, mon] = month.split("-").map(Number);
    const lastDay = new Date(year, mon, 0).getDate();
    const startDate = `${month}-01`;
    const endDate = `${month}-${String(lastDay).padStart(2, "0")}`;
    const leaves = await db.select({
      id: leavesTable.id,
      leaveType: leavesTable.leaveType,
      startDate: leavesTable.startDate,
      endDate: leavesTable.endDate,
      days: leavesTable.days,
      reason: leavesTable.reason,
      status: leavesTable.status,
    }).from(leavesTable).where(and(
      eq(leavesTable.employeeId, emp.id),
      lte(leavesTable.startDate, endDate),
      gte(leavesTable.endDate, startDate),
    )).orderBy(leavesTable.startDate);

    const leaveSummary = leaves.reduce((summary, leave) => {
      const overlapDays = getOverlapDays(leave.startDate, leave.endDate, startDate, endDate);
      const days = Number(leave.days || 0);
      const relevantDays = Math.min(overlapDays, days);
      summary.totalLeaves += relevantDays;
      if (leave.status === "approved") summary.approvedLeaves += relevantDays;
      if (leave.status === "pending") summary.pendingLeaves += relevantDays;
      summary.leaveRecords.push({
        leaveType: leave.leaveType,
        startDate: leave.startDate,
        endDate: leave.endDate,
        days: relevantDays,
        status: leave.status,
        reason: leave.reason,
      });
      return summary;
    }, {
      totalLeaves: 0,
      approvedLeaves: 0,
      pendingLeaves: 0,
      leaveRecords: [] as Array<any>,
    });

    const pdfBuffer = await generatePayslipPdf(pay, emp, leaveSummary, settings || {});
    const filename = createPayslipPdfFilename(pay, emp);

    // Build message
    const template = settings?.payslipMessageTemplate ||
      "Hello {{employeeName}}, your payslip for {{month}} is ready. Net salary: {{netSalary}}. Please find the attached PDF payslip.";
    const netSalary = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(pay.netSalary || 0));
    const message = template
      .replace(/\{\{employeeName\}\}/g, `${emp.firstName} ${emp.lastName}`)
      .replace(/\{\{month\}\}/g, pay.month)
      .replace(/\{\{netSalary\}\}/g, netSalary)
      .replace(/\{\{workingDays\}\}/g, String(pay.totalWorkingDays || ""))
      .replace(/\{\{presentDays\}\}/g, String(pay.presentDays || ""))
      .replace(/\{\{absentDays\}\}/g, String(pay.absentDays || ""))
      .replace(/\{\{payslipUrl\}\}/g, "Attached PDF");

    // Convert PDF buffer to base64
    const pdfBase64 = pdfBuffer.toString('base64');

    // Send document via OpenWA API
    const openwaUrl = `${settings.openwaApiUrl}/sessions/${settings.openwaSessionId}/messages/send-document`;
    const recipientNumber = settings.payslipWhatsappSenderPhone || WHATSAPP_RECIPIENT_NUMBER;

    try {
      const response = await fetch(openwaUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': settings.openwaApiKey,
        },
        body: JSON.stringify({
          chatId: `${recipientNumber}@c.us`,
          caption: message,
          filename: filename,
          document: `data:application/pdf;base64,${pdfBase64}`,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
        throw new Error(errorData.error || `OpenWA API error: ${response.status}`);
      }

      const result = await response.json() as { id?: string | number };

      // Log the action
      await createAuditLog({
        module: "payroll",
        action: "send_whatsapp",
        recordId: pay.id,
        userId: req.user!.id,
        userName: req.user!.name,
        description: `Sent payslip via OpenWA to ${recipientNumber} for employee ${emp.firstName} ${emp.lastName} (${pay.month})`,
      });

      res.json({
        success: true,
        message: "Payslip sent successfully via WhatsApp",
        recipient: recipientNumber,
        messageId: result?.id || null
      });
    } catch (apiError: any) {
      req.log.error({ apiError, openwaUrl });
      res.status(500).json({ error: apiError?.message || "Failed to send WhatsApp message via OpenWA API. Please try again." });
    }

  } catch (err: any) {
    req.log.error({ err });
    res.status(500).json({ error: err?.message || "Failed to send WhatsApp message. Please try again." });
  }
});

router.put("/payroll/:id", requireAuth, requirePermission("payroll", "edit"), async (req: any, res: any) => {
  try {
    const id = Number(req.params.id);
    const [existingPayroll] = await db.select().from(payrollTable).where(eq(payrollTable.id, id)).limit(1);
    if (!existingPayroll) { res.status(404).json({ error: "Not found" }); return; }
    if (isEmployeeSelfOnly(req.user!.role)) {
      const [empCheck] = await db.select().from(employeesTable).where(eq(employeesTable.id, existingPayroll.employeeId)).limit(1);
      if (!empCheck || empCheck.email !== req.user!.email) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }
    const body = req.body;
    const updates: any = { ...body, updatedAt: new Date() };
    if (body.basicSalary !== undefined) updates.basicSalary = String(body.basicSalary);
    if (body.hra !== undefined) updates.hra = String(body.hra);
    if (body.allowances !== undefined) updates.allowances = String(body.allowances);
    if (body.deductions !== undefined) updates.deductions = String(body.deductions);
    if (body.pf !== undefined) updates.pf = String(body.pf);
    if (body.esic !== undefined) updates.esic = String(body.esic);
    if (body.netSalary !== undefined) updates.netSalary = String(body.netSalary);
    if (body.status === "paid") updates.paidAt = new Date();
    const [pay] = await db.update(payrollTable).set(updates).where(eq(payrollTable.id, id)).returning();
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, pay.employeeId)).limit(1);
    await createAuditLog({ module: "payroll", action: "update", recordId: id, userId: req.user!.id, userName: req.user!.name, description: `Updated payroll status to ${body.status || "updated"}`, newValues: body });
    res.json(fmtPayroll(pay, emp ? `${emp.firstName} ${emp.lastName}` : undefined));
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

// Batch send WhatsApp payslips
router.post("/payroll/batch/send-whatsapp", requireAuth, requirePermission("payroll", "view"), async (req: any, res: any) => {
  try {
    const { payrollIds } = req.body;
    if (!Array.isArray(payrollIds) || payrollIds.length === 0) {
      res.status(400).json({ error: "Please provide an array of payroll IDs" });
      return;
    }
    const [settings] = await db.select().from(settingsTable).limit(1);
    if (!settings?.openwaApiUrl || !settings?.openwaApiKey || !settings?.openwaSessionId) {
      res.status(400).json({ error: "OpenWA integration not configured" });
      return;
    }
    const results: any[] = [];
    const errors: any[] = [];
    for (const payrollId of payrollIds) {
      try {
        const records = await db.select({ pay: payrollTable, emp: employeesTable })
          .from(payrollTable)
          .leftJoin(employeesTable, eq(payrollTable.employeeId, employeesTable.id))
          .where(eq(payrollTable.id, payrollId))
          .limit(1);
        if (!records.length) {
          errors.push({ payrollId, error: "Payroll record not found" });
          continue;
        }
        const { pay, emp } = records[0];
        if (!emp) {
          errors.push({ payrollId, error: "Employee not found" });
          continue;
        }
        const pdfBuffer = await generatePayslipPdf(pay, emp, { totalLeaves: 0, approvedLeaves: 0, pendingLeaves: 0, leaveRecords: [] }, settings || {});
        const filename = createPayslipPdfFilename(pay, emp);
        const template = settings?.payslipMessageTemplate || "Hello {{employeeName}}, your payslip for {{month}} is ready.";
        const netSalary = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(pay.netSalary || 0));
        const message = template.replace(/\{\{employeeName\}\}/g, `${emp.firstName} ${emp.lastName}`).replace(/\{\{month\}\}/g, pay.month).replace(/\{\{netSalary\}\}/g, netSalary);
        const pdfBase64 = pdfBuffer.toString('base64');
        const openwaUrl = `${settings.openwaApiUrl}/sessions/${settings.openwaSessionId}/messages/send-document`;
        const recipientNumber = settings.payslipWhatsappSenderPhone || WHATSAPP_RECIPIENT_NUMBER;
        const response = await fetch(openwaUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': settings.openwaApiKey },
          body: JSON.stringify({ chatId: `${recipientNumber}@c.us`, caption: message, filename, document: `data:application/pdf;base64,${pdfBase64}` }),
        });
        if (!response.ok) throw new Error(`OpenWA API error: ${response.status}`);
        await createAuditLog({
          module: "payroll",
          action: "batch_send_whatsapp",
          recordId: pay.id,
          userId: req.user!.id,
          userName: req.user!.name,
          description: `Sent to ${emp.firstName} ${emp.lastName}`,
        });
        results.push({ payrollId, success: true, employeeName: `${emp.firstName} ${emp.lastName}` });
      } catch (error: any) {
        errors.push({ payrollId, error: error?.message || "Failed to send" });
      }
    }
    res.json({ message: "Batch send completed", successful: results.length, failed: errors.length, results, errors: errors.length > 0 ? errors : undefined });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Failed to process batch send" }); }
});

export default router;
