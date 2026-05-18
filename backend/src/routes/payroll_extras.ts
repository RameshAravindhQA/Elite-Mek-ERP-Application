import { Router } from "express";
import { db } from "@workspace/db";
import { advancePaymentsTable, overtimeTable, payrollAdjustmentsTable } from "@workspace/db/schema/payroll";
import { employeesTable } from "@workspace/db/schema/employees";
import { projectsTable } from "@workspace/db/schema/projects";
import { and, count, desc, eq, gte, ilike, lte, or, sql } from "@workspace/db/drizzle";
import { requireAuth, requirePermission } from "../middlewares/auth.js";
import { createAuditLog } from "../lib/audit.js";

const router = Router();

function monthRange(month?: string) {
  const normalized = month && /^\d{4}-\d{2}$/.test(month) ? month : undefined;
  if (!normalized) return null;
  const [year, mon] = normalized.split("-").map(Number);
  const lastDay = new Date(year, mon, 0).getDate();
  return { start: `${normalized}-01`, end: `${normalized}-${String(lastDay).padStart(2, "0")}` };
}

const employeeNameSql = sql<string>`concat(${employeesTable.firstName}, ' ', ${employeesTable.lastName})`;

const fmtOvertime = (row: any) => ({
  ...row.ot,
  hours: Number(row.ot.hours || 0),
  basicSalary: Number(row.ot.basicSalary || 0),
  hourlyRate: Number(row.ot.hourlyRate || 0),
  amount: Number(row.ot.amount || 0),
  employeeName: row.emp ? `${row.emp.firstName} ${row.emp.lastName}` : "Unknown",
  employeeCode: row.emp?.employeeId || null,
  projectName: row.project?.name || null,
});

router.get("/overtime", requireAuth, requirePermission("payroll", "view"), async (req: any, res: any) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const search = String(req.query.search || "").trim();
    const month = String(req.query.month || "");
    const fromDate = String(req.query.fromDate || "");
    const toDate = String(req.query.toDate || "");
    const employeeId = req.query.employeeId ? Number(req.query.employeeId) : null;
    const projectId = req.query.projectId ? Number(req.query.projectId) : null;

    const conditions: any[] = [];
    if (search) conditions.push(or(ilike(employeeNameSql, `%${search}%`), ilike(projectsTable.name, `%${search}%`), ilike(overtimeTable.notes, `%${search}%`)));
    if (employeeId) conditions.push(eq(overtimeTable.employeeId, employeeId));
    if (projectId) conditions.push(eq(overtimeTable.projectId, projectId));
    const range = monthRange(month);
    if (range) {
      conditions.push(gte(overtimeTable.workDate, range.start), lte(overtimeTable.workDate, range.end));
    } else {
      if (fromDate) conditions.push(gte(overtimeTable.workDate, fromDate));
      if (toDate) conditions.push(lte(overtimeTable.workDate, toDate));
    }
    const whereClause = conditions.length ? and(...conditions) : undefined;

    const [{ total }] = await db.select({ total: count() }).from(overtimeTable)
      .leftJoin(employeesTable, eq(overtimeTable.employeeId, employeesTable.id))
      .leftJoin(projectsTable, eq(overtimeTable.projectId, projectsTable.id))
      .where(whereClause);
    const records = await db.select({
      ot: overtimeTable,
      emp: { firstName: employeesTable.firstName, lastName: employeesTable.lastName, employeeId: employeesTable.employeeId },
      project: { name: projectsTable.name },
    }).from(overtimeTable)
      .leftJoin(employeesTable, eq(overtimeTable.employeeId, employeesTable.id))
      .leftJoin(projectsTable, eq(overtimeTable.projectId, projectsTable.id))
      .where(whereClause)
      .orderBy(desc(overtimeTable.workDate), desc(overtimeTable.id))
      .limit(limit).offset(offset);

    res.json({ data: records.map(fmtOvertime), pagination: { page, limit, total: Number(total), totalPages: Math.ceil(Number(total) / limit) } });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/overtime", requireAuth, requirePermission("payroll", "create"), async (req: any, res: any) => {
  try {
    const employeeId = Number(req.body.employeeId);
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, employeeId)).limit(1);
    if (!emp) { res.status(404).json({ error: "Employee not found" }); return; }
    const hours = Number(req.body.hours || 0);
    const basicSalary = Number(req.body.basicSalary || emp.salary || 0);
    const hourlyRate = Number(req.body.hourlyRate || (basicSalary / 8));
    const amount = Number(req.body.amount || (hourlyRate * hours));
    const [ot] = await db.insert(overtimeTable).values({
      employeeId,
      projectId: req.body.projectId ? Number(req.body.projectId) : null,
      workDate: req.body.workDate,
      hours: String(hours),
      basicSalary: String(basicSalary),
      hourlyRate: String(hourlyRate),
      amount: String(amount),
      proofUrl: req.body.proofUrl || null,
      notes: req.body.notes || null,
      status: req.body.status || "approved",
    }).returning();
    await createAuditLog({ module: "overtime", action: "create", recordId: ot.id, userId: req.user!.id, userName: req.user!.name, description: `Created overtime for ${emp.firstName} ${emp.lastName}`, newValues: req.body });
    res.status(201).json({ ...ot, hours, basicSalary, hourlyRate, amount, employeeName: `${emp.firstName} ${emp.lastName}` });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.put("/overtime/:id", requireAuth, requirePermission("payroll", "edit"), async (req: any, res: any) => {
  try {
    const id = Number(req.params.id);
    const [old] = await db.select().from(overtimeTable).where(eq(overtimeTable.id, id)).limit(1);
    if (!old) { res.status(404).json({ error: "Not found" }); return; }
    const hours = req.body.hours !== undefined ? Number(req.body.hours) : Number(old.hours);
    const basicSalary = req.body.basicSalary !== undefined ? Number(req.body.basicSalary) : Number(old.basicSalary);
    const hourlyRate = req.body.hourlyRate !== undefined ? Number(req.body.hourlyRate) : (basicSalary / 8);
    const amount = req.body.amount !== undefined ? Number(req.body.amount) : (hourlyRate * hours);
    const [ot] = await db.update(overtimeTable).set({
      ...req.body,
      projectId: req.body.projectId ? Number(req.body.projectId) : null,
      hours: String(hours),
      basicSalary: String(basicSalary),
      hourlyRate: String(hourlyRate),
      amount: String(amount),
      updatedAt: new Date(),
    }).where(eq(overtimeTable.id, id)).returning();
    await createAuditLog({ module: "overtime", action: "update", recordId: id, userId: req.user!.id, userName: req.user!.name, description: `Updated overtime record #${id}`, oldValues: old as any, newValues: req.body });
    res.json({ ...ot, hours: Number(ot.hours), basicSalary: Number(ot.basicSalary), hourlyRate: Number(ot.hourlyRate), amount: Number(ot.amount) });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.delete("/overtime/:id", requireAuth, requirePermission("payroll", "delete"), async (req: any, res: any) => {
  try {
    const id = Number(req.params.id);
    const [old] = await db.select().from(overtimeTable).where(eq(overtimeTable.id, id)).limit(1);
    await db.delete(overtimeTable).where(eq(overtimeTable.id, id));
    await createAuditLog({ module: "overtime", action: "delete", recordId: id, userId: req.user!.id, userName: req.user!.name, description: `Deleted overtime record #${id}`, oldValues: old as any });
    res.status(204).send();
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

const fmtAdvance = (row: any) => ({
  ...row.adv,
  amount: Number(row.adv.amount || 0),
  employeeName: row.emp ? `${row.emp.firstName} ${row.emp.lastName}` : "Unknown",
  employeeCode: row.emp?.employeeId || null,
});

router.get("/advance-payments", requireAuth, requirePermission("payroll", "view"), async (req: any, res: any) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const search = String(req.query.search || "").trim();
    const month = String(req.query.month || "");
    const employeeId = req.query.employeeId ? Number(req.query.employeeId) : null;
    const conditions: any[] = [];
    if (search) conditions.push(or(ilike(employeeNameSql, `%${search}%`), ilike(advancePaymentsTable.referenceNo, `%${search}%`), ilike(advancePaymentsTable.notes, `%${search}%`)));
    if (employeeId) conditions.push(eq(advancePaymentsTable.employeeId, employeeId));
    if (month) conditions.push(eq(advancePaymentsTable.deductionMonth, month));
    const whereClause = conditions.length ? and(...conditions) : undefined;
    const [{ total }] = await db.select({ total: count() }).from(advancePaymentsTable).leftJoin(employeesTable, eq(advancePaymentsTable.employeeId, employeesTable.id)).where(whereClause);
    const records = await db.select({ adv: advancePaymentsTable, emp: { firstName: employeesTable.firstName, lastName: employeesTable.lastName, employeeId: employeesTable.employeeId } })
      .from(advancePaymentsTable).leftJoin(employeesTable, eq(advancePaymentsTable.employeeId, employeesTable.id))
      .where(whereClause).orderBy(desc(advancePaymentsTable.paymentDate), desc(advancePaymentsTable.id)).limit(limit).offset(offset);
    res.json({ data: records.map(fmtAdvance), pagination: { page, limit, total: Number(total), totalPages: Math.ceil(Number(total) / limit) } });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/advance-payments", requireAuth, requirePermission("payroll", "create"), async (req: any, res: any) => {
  try {
    const [adv] = await db.insert(advancePaymentsTable).values({
      employeeId: Number(req.body.employeeId),
      paymentDate: req.body.paymentDate,
      amount: String(Number(req.body.amount || 0)),
      deductionMonth: req.body.deductionMonth,
      status: req.body.status || "pending",
      paymentMode: req.body.paymentMode || null,
      referenceNo: req.body.referenceNo || null,
      notes: req.body.notes || null,
    }).returning();
    await createAuditLog({ module: "advance_payments", action: "create", recordId: adv.id, userId: req.user!.id, userName: req.user!.name, description: `Created advance payment #${adv.id}`, newValues: req.body });
    res.status(201).json({ ...adv, amount: Number(adv.amount) });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.put("/advance-payments/:id", requireAuth, requirePermission("payroll", "edit"), async (req: any, res: any) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid advance payment id" }); return; }
    const [old] = await db.select().from(advancePaymentsTable).where(eq(advancePaymentsTable.id, id)).limit(1);
    if (!old) { res.status(404).json({ error: "Not found" }); return; }
    const updates: any = { ...req.body, updatedAt: new Date() };
    if (req.body.employeeId !== undefined) updates.employeeId = Number(req.body.employeeId);
    if (req.body.amount !== undefined) updates.amount = String(Number(req.body.amount));
    const [adv] = await db.update(advancePaymentsTable).set(updates).where(eq(advancePaymentsTable.id, id)).returning();
    await createAuditLog({ module: "advance_payments", action: "update", recordId: id, userId: req.user!.id, userName: req.user!.name, description: `Updated advance payment #${id}`, oldValues: old as any, newValues: req.body });
    res.json({ ...adv, amount: Number(adv.amount) });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.delete("/advance-payments/:id", requireAuth, requirePermission("payroll", "delete"), async (req: any, res: any) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid advance payment id" }); return; }
    const [old] = await db.select().from(advancePaymentsTable).where(eq(advancePaymentsTable.id, id)).limit(1);
    if (!old) { res.status(404).json({ error: "Not found" }); return; }
    await db.delete(advancePaymentsTable).where(eq(advancePaymentsTable.id, id));
    await createAuditLog({ module: "advance_payments", action: "delete", recordId: id, userId: req.user!.id, userName: req.user!.name, description: `Deleted advance payment #${id}`, oldValues: old as any });
    res.status(204).send();
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/payroll-adjustments", requireAuth, requirePermission("payroll", "view"), async (req: any, res: any) => {
  try {
    const month = String(req.query.month || "");
    const employeeId = req.query.employeeId ? Number(req.query.employeeId) : null;
    const conditions: any[] = [];
    if (month) conditions.push(eq(payrollAdjustmentsTable.month, month));
    if (employeeId) conditions.push(eq(payrollAdjustmentsTable.employeeId, employeeId));
    const rows = await db.select().from(payrollAdjustmentsTable).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(payrollAdjustmentsTable.createdAt));
    res.json({ data: rows.map(row => ({ ...row, amount: Number(row.amount || 0) })) });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/payroll-adjustments", requireAuth, requirePermission("payroll", "create"), async (req: any, res: any) => {
  try {
    const employeeIds = Array.isArray(req.body.employeeIds) ? req.body.employeeIds.map(Number).filter(Boolean) : [Number(req.body.employeeId)].filter(Boolean);
    const rows = [];
    for (const employeeId of employeeIds) {
      const [row] = await db.insert(payrollAdjustmentsTable).values({
        employeeId,
        month: req.body.month,
        type: req.body.type || "bonus",
        label: req.body.label || (req.body.type === "deduction" ? "Other deduction" : "Bonus"),
        amount: String(Number(req.body.amount || 0)),
        notes: req.body.notes || null,
      }).returning();
      rows.push({ ...row, amount: Number(row.amount) });
    }
    await createAuditLog({ module: "payroll_adjustments", action: "create", userId: req.user!.id, userName: req.user!.name, description: `Created payroll adjustment for ${rows.length} employee(s)`, newValues: req.body });
    res.status(201).json({ data: rows });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

export default router;
