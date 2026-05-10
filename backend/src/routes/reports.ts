import { Router } from "express";
import { db, employeesTable, attendanceTable, payrollTable, expensesTable, revenueTable, invoicesTable, purchaseOrdersTable, inventoryTable, leavesTable, projectsTable, customersTable, vendorsTable, overtimeTable, advancePaymentsTable } from "@workspace/db";
import { desc, count, sql, eq, gte, lte, and, ilike, or } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

router.get("/reports/summary", requireAuth, async (req, res) => {
  try {
    const [empStats] = await db.select({ total: count(), active: sql<number>`count(*) filter (where status = 'active')` }).from(employeesTable);
    const [payStats] = await db.select({ totalPaid: sql<number>`sum(net_salary) filter (where status = 'paid')`, pending: sql<number>`sum(net_salary) filter (where status = 'pending')` }).from(payrollTable);
    const [expStats] = await db.select({ total: sql<number>`sum(amount)`, pending: sql<number>`sum(amount) filter (where status = 'pending')` }).from(expensesTable);
    const [revStats] = await db.select({ total: sql<number>`sum(amount)` }).from(revenueTable);
    const [invStats] = await db.select({ total: count(), value: sql<number>`sum(quantity * cost_price)` }).from(inventoryTable);
    const [projStats] = await db.select({ total: count(), active: sql<number>`count(*) filter (where status = 'active')` }).from(projectsTable);
    
    res.json({
      employees: { total: Number(empStats.total), active: Number(empStats.active) },
      payroll: { totalPaid: Number(payStats.totalPaid) || 0, pending: Number(payStats.pending) || 0 },
      expenses: { total: Number(expStats.total) || 0, pending: Number(expStats.pending) || 0 },
      revenue: { total: Number(revStats.total) || 0 },
      inventory: { total: Number(invStats.total), value: Number(invStats.value) || 0 },
      projects: { total: Number(projStats.total), active: Number(projStats.active) },
    });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/reports/employees", requireAuth, async (req, res) => {
  try {
    const byDept = await db.select({ department: employeesTable.department, count: count(), avgSalary: sql<number>`avg(salary::numeric)` }).from(employeesTable).groupBy(employeesTable.department);
    const byStatus = await db.select({ status: employeesTable.status, count: count() }).from(employeesTable).groupBy(employeesTable.status);
    const employees = await db.select().from(employeesTable).orderBy(desc(employeesTable.createdAt), desc(employeesTable.id));
    res.json({ byDepartment: byDept.map(d => ({ ...d, count: Number(d.count), avgSalary: Number(d.avgSalary) || 0 })), byStatus: byStatus.map(s => ({ ...s, count: Number(s.count) })), data: employees.map(e => ({ ...e, salary: Number(e.salary) })) });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/reports/payroll", requireAuth, async (req, res) => {
  try {
    const month = req.query.month as string;
    const byMonth = await db.select({ month: payrollTable.month, total: sql<number>`sum(net_salary)`, count: count() }).from(payrollTable).groupBy(payrollTable.month).orderBy(payrollTable.month);
    const data = await db.select({ pay: payrollTable, emp: { firstName: employeesTable.firstName, lastName: employeesTable.lastName, department: employeesTable.department } })
      .from(payrollTable).leftJoin(employeesTable, eq(payrollTable.employeeId, employeesTable.id)).orderBy(desc(payrollTable.createdAt), desc(payrollTable.id));
    res.json({ byMonth: byMonth.map(m => ({ month: m.month, total: Number(m.total) || 0, count: Number(m.count) })), data: data.map(r => ({ ...r.pay, employeeName: r.emp ? `${r.emp.firstName} ${r.emp.lastName}` : "Unknown", department: r.emp?.department, basicSalary: Number(r.pay.basicSalary), netSalary: Number(r.pay.netSalary) })) });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/reports/attendance", requireAuth, async (req, res) => {
  try {
    const month = req.query.month as string || new Date().toISOString().slice(0, 7);
    const byStatus = await db.select({ status: attendanceTable.status, count: count() }).from(attendanceTable).groupBy(attendanceTable.status);
    const byEmployee = await db.select({
      employeeId: attendanceTable.employeeId,
      present: sql<number>`count(*) filter (where ${attendanceTable.status} = 'present')`,
      absent: sql<number>`count(*) filter (where ${attendanceTable.status} = 'absent')`,
      firstName: employeesTable.firstName,
      lastName: employeesTable.lastName,
    })
      .from(attendanceTable).leftJoin(employeesTable, eq(attendanceTable.employeeId, employeesTable.id)).groupBy(attendanceTable.employeeId, employeesTable.firstName, employeesTable.lastName);
    res.json({ byStatus: byStatus.map(s => ({ status: s.status, count: Number(s.count) })), byEmployee: byEmployee.map(e => ({ employeeId: e.employeeId, employeeName: `${e.firstName || ""} ${e.lastName || ""}`.trim(), present: Number(e.present), absent: Number(e.absent) })) });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/reports/expenses", requireAuth, async (req, res) => {
  try {
    const byCategory = await db.select({ category: expensesTable.category, total: sql<number>`sum(amount)`, count: count() }).from(expensesTable).groupBy(expensesTable.category);
    const byMonth = await db.select({ month: sql<string>`to_char(date::date, 'YYYY-MM')`, total: sql<number>`sum(amount)` }).from(expensesTable).groupBy(sql`to_char(date::date, 'YYYY-MM')`).orderBy(sql`to_char(date::date, 'YYYY-MM')`);
    const data = await db.select().from(expensesTable).orderBy(expensesTable.date, expensesTable.id);
    res.json({ byCategory: byCategory.map(c => ({ category: c.category, total: Number(c.total), count: Number(c.count) })), byMonth: byMonth.map(m => ({ month: m.month, total: Number(m.total) })), data: data.map(e => ({ ...e, amount: Number(e.amount) })) });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/reports/revenue", requireAuth, async (req, res) => {
  try {
    const bySource = await db.select({ source: revenueTable.source, total: sql<number>`sum(amount)`, count: count() }).from(revenueTable).groupBy(revenueTable.source);
    const byMonth = await db.select({ month: sql<string>`to_char(date::date, 'YYYY-MM')`, total: sql<number>`sum(amount)` }).from(revenueTable).groupBy(sql`to_char(date::date, 'YYYY-MM')`).orderBy(sql`to_char(date::date, 'YYYY-MM')`);
    const data = await db.select().from(revenueTable).orderBy(revenueTable.date, revenueTable.id);
    res.json({ bySource: bySource.map(s => ({ source: s.source, total: Number(s.total), count: Number(s.count) })), byMonth: byMonth.map(m => ({ month: m.month, total: Number(m.total) })), data: data.map(r => ({ ...r, amount: Number(r.amount) })) });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/reports/inventory", requireAuth, async (req, res) => {
  try {
    const byCategory = await db.select({ category: inventoryTable.category, count: count(), value: sql<number>`sum(quantity::numeric * cost_price::numeric)` }).from(inventoryTable).groupBy(inventoryTable.category);
    const lowStock = await db.select().from(inventoryTable).where(sql`quantity::numeric <= reorder_level::numeric`);
    const data = await db.select().from(inventoryTable).orderBy(inventoryTable.name, inventoryTable.id);
    res.json({ byCategory: byCategory.map(c => ({ category: c.category, count: Number(c.count), value: Number(c.value) || 0 })), lowStock: lowStock.map(i => ({ ...i, quantity: Number(i.quantity), reorderLevel: Number(i.reorderLevel), costPrice: Number(i.costPrice), sellingPrice: Number(i.sellingPrice) })), data: data.map(i => ({ ...i, quantity: Number(i.quantity), reorderLevel: Number(i.reorderLevel), costPrice: Number(i.costPrice), sellingPrice: Number(i.sellingPrice) })) });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/reports/projects", requireAuth, async (req, res) => {
  try {
    const byStatus = await db.select({ status: projectsTable.status, count: count(), budget: sql<number>`sum(budget::numeric)`, spent: sql<number>`sum(spent::numeric)` }).from(projectsTable).groupBy(projectsTable.status);
    const data = await db.select().from(projectsTable).orderBy(desc(projectsTable.createdAt), desc(projectsTable.id));
    res.json({ byStatus: byStatus.map(s => ({ status: s.status, count: Number(s.count), budget: Number(s.budget) || 0, spent: Number(s.spent) || 0 })), data: data.map(p => ({ ...p, budget: p.budget ? Number(p.budget) : 0, spent: Number(p.spent) })) });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/reports/invoices", requireAuth, async (req, res) => {
  try {
    const byStatus = await db.select({ status: invoicesTable.status, count: count(), total: sql<number>`sum(total_amount)` }).from(invoicesTable).groupBy(invoicesTable.status);
    const data = await db.select({ inv: invoicesTable, cust: { name: customersTable.name } }).from(invoicesTable).leftJoin(customersTable, eq(invoicesTable.customerId, customersTable.id)).orderBy(desc(invoicesTable.createdAt), desc(invoicesTable.id));
    res.json({ byStatus: byStatus.map(s => ({ status: s.status, count: Number(s.count), total: Number(s.total) || 0 })), data: data.map(r => ({ ...r.inv, customerName: r.cust?.name || "Unknown", totalAmount: Number(r.inv.totalAmount), paidAmount: Number(r.inv.paidAmount) })) });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/reports/overtime", requireAuth, async (req, res) => {
  try {
    const employeeId = req.query.employeeId ? Number(req.query.employeeId) : null;
    const projectId = req.query.projectId ? Number(req.query.projectId) : null;
    const fromDate = req.query.fromDate as string;
    const toDate = req.query.toDate as string;
    const search = String(req.query.search || "");
    const conditions: any[] = [];
    if (employeeId) conditions.push(eq(overtimeTable.employeeId, employeeId));
    if (projectId) conditions.push(eq(overtimeTable.projectId, projectId));
    if (fromDate) conditions.push(gte(overtimeTable.workDate, fromDate));
    if (toDate) conditions.push(lte(overtimeTable.workDate, toDate));
    if (search) conditions.push(or(ilike(sql<string>`concat(${employeesTable.firstName}, ' ', ${employeesTable.lastName})`, `%${search}%`), ilike(projectsTable.name, `%${search}%`)));
    const whereClause = conditions.length ? and(...conditions) : undefined;
    const byProject = await db.select({ projectId: overtimeTable.projectId, projectName: projectsTable.name, hours: sql<number>`sum(${overtimeTable.hours}::numeric)`, amount: sql<number>`sum(${overtimeTable.amount}::numeric)` })
      .from(overtimeTable).leftJoin(projectsTable, eq(overtimeTable.projectId, projectsTable.id)).where(whereClause).groupBy(overtimeTable.projectId, projectsTable.name);
    const byEmployee = await db.select({ employeeId: overtimeTable.employeeId, firstName: employeesTable.firstName, lastName: employeesTable.lastName, hours: sql<number>`sum(${overtimeTable.hours}::numeric)`, amount: sql<number>`sum(${overtimeTable.amount}::numeric)` })
      .from(overtimeTable).leftJoin(employeesTable, eq(overtimeTable.employeeId, employeesTable.id)).where(whereClause).groupBy(overtimeTable.employeeId, employeesTable.firstName, employeesTable.lastName);
    const data = await db.select({ ot: overtimeTable, emp: { firstName: employeesTable.firstName, lastName: employeesTable.lastName, employeeId: employeesTable.employeeId }, project: { name: projectsTable.name } })
      .from(overtimeTable).leftJoin(employeesTable, eq(overtimeTable.employeeId, employeesTable.id)).leftJoin(projectsTable, eq(overtimeTable.projectId, projectsTable.id)).where(whereClause).orderBy(desc(overtimeTable.workDate), desc(overtimeTable.id));
    res.json({
      byProject: byProject.map(row => ({ projectId: row.projectId, projectName: row.projectName || "No project", hours: Number(row.hours || 0), amount: Number(row.amount || 0) })),
      byEmployee: byEmployee.map(row => ({ employeeId: row.employeeId, employeeName: `${row.firstName || ""} ${row.lastName || ""}`.trim(), hours: Number(row.hours || 0), amount: Number(row.amount || 0) })),
      data: data.map(row => ({ ...row.ot, employeeName: row.emp ? `${row.emp.firstName} ${row.emp.lastName}` : "Unknown", employeeCode: row.emp?.employeeId, projectName: row.project?.name || "No project", hours: Number(row.ot.hours), amount: Number(row.ot.amount), hourlyRate: Number(row.ot.hourlyRate) })),
    });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/reports/advance-payments", requireAuth, async (req, res) => {
  try {
    const employeeId = req.query.employeeId ? Number(req.query.employeeId) : null;
    const month = req.query.month as string;
    const conditions: any[] = [];
    if (employeeId) conditions.push(eq(advancePaymentsTable.employeeId, employeeId));
    if (month) conditions.push(eq(advancePaymentsTable.deductionMonth, month));
    const whereClause = conditions.length ? and(...conditions) : undefined;
    const byEmployee = await db.select({ employeeId: advancePaymentsTable.employeeId, firstName: employeesTable.firstName, lastName: employeesTable.lastName, amount: sql<number>`sum(${advancePaymentsTable.amount}::numeric)`, count: count() })
      .from(advancePaymentsTable).leftJoin(employeesTable, eq(advancePaymentsTable.employeeId, employeesTable.id)).where(whereClause).groupBy(advancePaymentsTable.employeeId, employeesTable.firstName, employeesTable.lastName);
    const data = await db.select({ adv: advancePaymentsTable, emp: { firstName: employeesTable.firstName, lastName: employeesTable.lastName, employeeId: employeesTable.employeeId } })
      .from(advancePaymentsTable).leftJoin(employeesTable, eq(advancePaymentsTable.employeeId, employeesTable.id)).where(whereClause).orderBy(desc(advancePaymentsTable.paymentDate), desc(advancePaymentsTable.id));
    res.json({
      byEmployee: byEmployee.map(row => ({ employeeId: row.employeeId, employeeName: `${row.firstName || ""} ${row.lastName || ""}`.trim(), amount: Number(row.amount || 0), count: Number(row.count) })),
      data: data.map(row => ({ ...row.adv, employeeName: row.emp ? `${row.emp.firstName} ${row.emp.lastName}` : "Unknown", employeeCode: row.emp?.employeeId, amount: Number(row.adv.amount) })),
    });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

export default router;
