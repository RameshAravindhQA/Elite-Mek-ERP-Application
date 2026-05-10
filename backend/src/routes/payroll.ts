import { Router } from "express";
import { db, payrollTable, employeesTable, attendanceTable, leavesTable, settingsTable, overtimeTable, advancePaymentsTable, payrollAdjustmentsTable } from "@workspace/db";
import { desc, eq, ilike, count, sql, and, gte, lte, or } from "drizzle-orm";
import { requireAuth, requirePermission } from "../middlewares/auth.js";
import { createAuditLog } from "../lib/audit.js";
import { createPayslipPdfFilename, generatePayslipPdf } from "../lib/pdf.js";

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

router.get("/payroll/stats", requireAuth, requirePermission("payroll", "view"), async (req, res) => {
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

router.get("/payroll", requireAuth, requirePermission("payroll", "view"), async (req, res) => {
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
router.post("/payroll/generate", requireAuth, requirePermission("payroll", "create"), async (req, res) => {
  try {
    const { employeeId, month, excusedAbsences = [], excuseNotes, markPaid = false } = req.body;
    const shouldMarkPaid = Boolean(markPaid);
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, Number(employeeId))).limit(1);
    if (!emp) { res.status(404).json({ error: "Employee not found" }); return; }

    // Get attendance for the month
    const startDate = `${month}-01`;
    const [year, mon] = month.split("-").map(Number);
    const lastDay = new Date(year, mon, 0).getDate();
    const endDate = `${month}-${String(lastDay).padStart(2, "0")}`;
    
    const attendance = await db.select().from(attendanceTable)
      .where(and(eq(attendanceTable.employeeId, Number(employeeId)), gte(attendanceTable.date, startDate), lte(attendanceTable.date, endDate)));
    const overtime = await db.select().from(overtimeTable)
      .where(and(eq(overtimeTable.employeeId, Number(employeeId)), gte(overtimeTable.workDate, startDate), lte(overtimeTable.workDate, endDate)));
    const advances = await db.select().from(advancePaymentsTable)
      .where(and(eq(advancePaymentsTable.employeeId, Number(employeeId)), eq(advancePaymentsTable.deductionMonth, month)));
    const adjustments = await db.select().from(payrollAdjustmentsTable)
      .where(and(eq(payrollAdjustmentsTable.employeeId, Number(employeeId)), eq(payrollAdjustmentsTable.month, month)));
    
    const totalWorkingDays = 26;
    const presentCount = attendance.filter(a => ["present", "late", "half_day"].includes(a.status)).length;
    const halfDayCount = attendance.filter(a => a.status === "half_day").length;
    const absentDays = totalWorkingDays - presentCount + (excusedAbsences?.length || 0);
    const effectiveDays = presentCount + (excusedAbsences?.length || 0) - (halfDayCount * 0.5);
    
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
    const roundedAbsentDays = Math.round(Math.max(0, totalWorkingDays - effectiveDays));

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

router.post("/payroll", requireAuth, requirePermission("payroll", "create"), async (req, res) => {
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

router.get("/payroll/:id", requireAuth, requirePermission("payroll", "view"), async (req, res) => {
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

router.get("/payroll/:id/payslip", requireAuth, requirePermission("payroll", "view"), async (req, res) => {
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

router.post("/payroll/:id/send-whatsapp", requireAuth, requirePermission("payroll", "view"), async (req, res) => {
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
      .replace(/\{\{workingDays\}\}/g, String(pay.workingDays || ""))
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
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `OpenWA API error: ${response.status}`);
      }

      const result = await response.json();

      // Log the action
      await createAuditLog(req.user!.id, "payroll", "send_whatsapp", `Sent payslip via OpenWA to ${recipientNumber} for employee ${emp.firstName} ${emp.lastName} (${pay.month})`);

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

router.put("/payroll/:id", requireAuth, requirePermission("payroll", "edit"), async (req, res) => {
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

export default router;
