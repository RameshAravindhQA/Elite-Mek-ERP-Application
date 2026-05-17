import { Router } from "express";
import { db, employeesTable, salaryHikesTable } from "@workspace/db";
import { desc, eq, ilike, count, sql, or, and } from "@workspace/db/drizzle";
import { requireAuth } from "../middlewares/auth.js";
import { createAuditLog } from "../lib/audit.js";

const router = Router();

router.get("/employees/stats", requireAuth, async (req, res) => {
  try {
    const [totals] = await db.select({ total: count(), active: sql<number>`count(*) filter (where status = 'active')`, inactive: sql<number>`count(*) filter (where status = 'inactive')` }).from(employeesTable);
    const byDept = await db.select({ department: employeesTable.department, count: count() }).from(employeesTable).groupBy(employeesTable.department);
    res.json({ total: Number(totals.total), active: Number(totals.active), inactive: Number(totals.inactive), byDepartment: byDept.map(d => ({ department: d.department, count: Number(d.count) })) });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/employees", requireAuth, async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const search = req.query.search as string;
    const department = req.query.department as string;
    const status = req.query.status as string;
    const offset = (page - 1) * limit;

    let conditions: any[] = [];
    if (search) conditions.push(or(ilike(employeesTable.firstName, `%${search}%`), ilike(employeesTable.lastName, `%${search}%`), ilike(employeesTable.email, `%${search}%`)));
    if (department) conditions.push(eq(employeesTable.department, department));
    if (status) conditions.push(eq(employeesTable.status, status));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [{ total }] = await db.select({ total: count() }).from(employeesTable).where(whereClause);
    const employees = await db.select().from(employeesTable).where(whereClause).limit(limit).offset(offset).orderBy(desc(employeesTable.createdAt), desc(employeesTable.id));
    res.json({ data: employees.map(formatEmployee), pagination: { page, limit, total: Number(total), totalPages: Math.ceil(Number(total) / limit) } });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/employees", requireAuth, async (req, res) => {
  try {
    const body = req.body;
    const salary = Number(body.salary);
    if (!Number.isFinite(salary) || salary <= 0) {
      res.status(400).json({
        error: "Validation failed",
        details: [{ field: "salary", path: "salary", message: "Salary must be greater than zero", type: "invalid_number" }],
      });
      return;
    }

    const duplicateConditions = [];
    if (body.employeeId) duplicateConditions.push(eq(employeesTable.employeeId, body.employeeId));
    if (body.email) duplicateConditions.push(eq(employeesTable.email, body.email));
    if (duplicateConditions.length) {
      const [existing] = await db.select({ id: employeesTable.id, employeeId: employeesTable.employeeId, email: employeesTable.email })
        .from(employeesTable)
        .where(or(...duplicateConditions))
        .limit(1);
      if (existing) {
        const field = existing.email === body.email ? "email" : "employeeId";
        const label = field === "email" ? "Email" : "Employee ID";
        res.status(400).json({
          error: "Validation failed",
          details: [{ field, path: field, message: `${label} already exists`, type: "unique_violation" }],
        });
        return;
      }
    }

    const [emp] = await db.insert(employeesTable).values({ ...body, salary: String(salary) }).returning();
    await createAuditLog({ module: "employees", action: "create", recordId: emp.id, userId: req.user!.id, userName: req.user!.name, description: `Created employee ${emp.firstName} ${emp.lastName}`, newValues: body });
    res.status(201).json(formatEmployee(emp));
  } catch (err: any) {
    req.log.error({ err });
    // Handle unique constraint violations
    if (err.code === "23505") {
      const field = err.detail?.includes("employee_id") ? "employeeId" : err.detail?.includes("email") ? "email" : "unknown";
      const label = field === "employeeId" ? "Employee ID" : field === "email" ? "Email" : "Value";
      res.status(400).json({ 
        error: "Validation failed", 
        details: [{ 
          field, 
          path: field,
          message: `${label} already exists`, 
          type: "unique_violation"
        }] 
      });
    } else if (err.code === "22P02" || err.code === "42703") {
      res.status(400).json({ 
        error: "Validation failed", 
        details: [{ 
          field: "data", 
          path: "data",
          message: "Invalid data format", 
          type: "invalid_type"
        }] 
      });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

router.get("/employees/:id", requireAuth, async (req, res) => {
  try {
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, Number(req.params.id))).limit(1);
    if (!emp) { res.status(404).json({ error: "Not found" }); return; }
    res.json(formatEmployee(emp));
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/employees/:id/salary-hikes", requireAuth, async (req, res) => {
  try {
    const employeeId = Number(req.params.id);
    const records = await db.select().from(salaryHikesTable)
      .where(eq(salaryHikesTable.employeeId, employeeId))
      .orderBy(desc(salaryHikesTable.effectiveDate), desc(salaryHikesTable.id));
    res.json({ data: records.map(formatSalaryHike) });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/employees/:id/salary-hikes", requireAuth, async (req, res) => {
  try {
    const employeeId = Number(req.params.id);
    const [employee] = await db.select().from(employeesTable).where(eq(employeesTable.id, employeeId)).limit(1);
    if (!employee) { res.status(404).json({ error: "Employee not found" }); return; }

    const previousSalary = Number(employee.salary || 0);
    const newSalary = Number(req.body.newSalary || 0);
    if (!Number.isFinite(newSalary) || newSalary <= 0) {
      res.status(400).json({ error: "New salary must be greater than zero" });
      return;
    }

    const hikeAmount = newSalary - previousSalary;
    const hikePercent = previousSalary > 0 ? (hikeAmount / previousSalary) * 100 : 0;
    const effectiveDate = req.body.effectiveDate || new Date().toISOString().slice(0, 10);

    const [record] = await db.insert(salaryHikesTable).values({
      employeeId,
      previousSalary: String(previousSalary),
      newSalary: String(newSalary),
      hikeAmount: String(hikeAmount),
      hikePercent: String(Math.round(hikePercent * 100) / 100),
      effectiveDate,
      reason: req.body.reason || null,
      approvedBy: req.body.approvedBy || req.user!.name,
    }).returning();

    const [updatedEmployee] = await db.update(employeesTable)
      .set({ salary: String(newSalary), updatedAt: new Date() })
      .where(eq(employeesTable.id, employeeId))
      .returning();

    await createAuditLog({
      module: "employees",
      action: "salary_hike",
      recordId: employeeId,
      userId: req.user!.id,
      userName: req.user!.name,
      description: `Recorded salary hike for ${employee.firstName} ${employee.lastName}`,
      oldValues: { salary: previousSalary },
      newValues: { salary: newSalary, hikeAmount, hikePercent, effectiveDate },
    });

    res.status(201).json({ hike: formatSalaryHike(record), employee: formatEmployee(updatedEmployee) });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.put("/employees/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [old] = await db.select().from(employeesTable).where(eq(employeesTable.id, id)).limit(1);
    const body = req.body;
    const [emp] = await db.update(employeesTable).set({ ...body, salary: body.salary ? String(body.salary) : undefined, updatedAt: new Date() }).where(eq(employeesTable.id, id)).returning();
    await createAuditLog({ module: "employees", action: "update", recordId: id, userId: req.user!.id, userName: req.user!.name, description: `Updated employee ${emp.firstName} ${emp.lastName}`, oldValues: old as any, newValues: body });
    res.json(formatEmployee(emp));
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.delete("/employees/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, id)).limit(1);
    await db.delete(employeesTable).where(eq(employeesTable.id, id));
    await createAuditLog({ module: "employees", action: "delete", recordId: id, userId: req.user!.id, userName: req.user!.name, description: `Deleted employee ${emp?.firstName} ${emp?.lastName}`, oldValues: emp as any });
    res.status(204).send();
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

function formatEmployee(emp: any) {
  return { ...emp, salary: Number(emp.salary) };
}

function formatSalaryHike(record: any) {
  return {
    ...record,
    previousSalary: Number(record.previousSalary),
    newSalary: Number(record.newSalary),
    hikeAmount: Number(record.hikeAmount),
    hikePercent: Number(record.hikePercent),
  };
}

export default router;
