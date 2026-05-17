import { Router } from "express";
import { db, attendanceTable, attendanceCategoriesTable, employeesTable } from "@workspace/db";
import { eq, and, count, sql, gte, lte } from "@workspace/db/drizzle";
import { requireAuth } from "../middlewares/auth.js";
import { createAuditLog } from "../lib/audit.js";

const router = Router();

router.get("/attendance/summary", requireAuth, async (req, res) => {
  try {
    const month = req.query.month as string || new Date().toISOString().slice(0, 7);
    const [year, mon] = month.split("-").map(Number);
    const daysInMonth = new Date(year, mon, 0).getDate();
    const startDate = `${month}-01`;
    const endDate = `${month}-${String(daysInMonth).padStart(2, "0")}`;
    const totalWorkingDays = Array.from({ length: daysInMonth }, (_, index) => new Date(year, mon - 1, index + 1).getDay())
      .filter((dow) => dow !== 0)
      .length;

    const [summary] = await db.select({
      present: sql<number>`count(*) filter (where date >= ${startDate} and date <= ${endDate} and status = 'present')`,
      absent: sql<number>`count(*) filter (where date >= ${startDate} and date <= ${endDate} and status = 'absent')`,
      late: sql<number>`count(*) filter (where date >= ${startDate} and date <= ${endDate} and status = 'late')`,
      halfDay: sql<number>`count(*) filter (where date >= ${startDate} and date <= ${endDate} and status = 'half_day')`,
      sickLeave: sql<number>`count(*) filter (where date >= ${startDate} and date <= ${endDate} and status = 'sick_leave')`,
      paidLeave: sql<number>`count(*) filter (where date >= ${startDate} and date <= ${endDate} and status = 'paid_leave')`,
      unpaidLeave: sql<number>`count(*) filter (where date >= ${startDate} and date <= ${endDate} and status = 'unpaid_leave')`,
      total: count()
    }).from(attendanceTable);
    res.json({
      present: Number(summary.present),
      absent: Number(summary.absent),
      late: Number(summary.late),
      halfDay: Number(summary.halfDay),
      sickLeave: Number(summary.sickLeave),
      paidLeave: Number(summary.paidLeave),
      unpaidLeave: Number(summary.unpaidLeave),
      totalWorkingDays,
    });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/attendance", requireAuth, async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 100;
    const offset = (page - 1) * limit;
    const month = req.query.month as string;
    const employeeId = req.query.employeeId ? Number(req.query.employeeId) : undefined;
    
    let baseQuery = db.select({ att: attendanceTable, emp: { firstName: employeesTable.firstName, lastName: employeesTable.lastName, employeeId: employeesTable.employeeId, department: employeesTable.department } })
      .from(attendanceTable).leftJoin(employeesTable, eq(attendanceTable.employeeId, employeesTable.id));
    
    const [{ total }] = await db.select({ total: count() }).from(attendanceTable);
    const records = await db.select({ att: attendanceTable, emp: { firstName: employeesTable.firstName, lastName: employeesTable.lastName, employeeId: employeesTable.employeeId, department: employeesTable.department } })
      .from(attendanceTable).leftJoin(employeesTable, eq(attendanceTable.employeeId, employeesTable.id))
      .limit(limit).offset(offset).orderBy(attendanceTable.date, attendanceTable.id);
    res.json({ data: records.map(r => ({ ...r.att, employeeName: r.emp ? `${r.emp.firstName} ${r.emp.lastName}` : "Unknown", employeeCode: r.emp?.employeeId, department: r.emp?.department, hoursWorked: r.att.hoursWorked ? Number(r.att.hoursWorked) : null })), pagination: { page, limit, total: Number(total), totalPages: Math.ceil(Number(total) / limit) } });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

// Get attendance for a specific month in grid format
router.get("/attendance/monthly", requireAuth, async (req, res) => {
  try {
    const month = req.query.month as string || new Date().toISOString().slice(0, 7);
    const employees = await db.select().from(employeesTable).where(eq(employeesTable.status, "active"));
    const startDate = `${month}-01`;
    const [year, mon] = month.split("-").map(Number);
    const lastDay = new Date(year, mon, 0).getDate();
    const endDate = `${month}-${String(lastDay).padStart(2, "0")}`;

    const attendance = await db.select().from(attendanceTable)
      .where(and(gte(attendanceTable.date, startDate), lte(attendanceTable.date, endDate)));

    const attendanceByEmployee = new Map<number, Record<string, string>>();
    attendance.forEach((record) => {
      const map = attendanceByEmployee.get(record.employeeId) || {};
      map[record.date] = record.status;
      attendanceByEmployee.set(record.employeeId, map);
    });

    const grid = employees.map(emp => {
      const empAttendance: Record<string, string> = {};
      const employeeAttendance = attendanceByEmployee.get(emp.id) || {};
      for (let d = 1; d <= lastDay; d++) {
        const dateStr = `${month}-${String(d).padStart(2, "0")}`;
        empAttendance[dateStr] = employeeAttendance[dateStr] || "";
      }
      return { employee: { id: emp.id, name: `${emp.firstName} ${emp.lastName}`, employeeId: emp.employeeId, department: emp.department }, attendance: empAttendance };
    });

    res.json({ month, daysInMonth: lastDay, grid });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

// Bulk attendance marking
router.post("/attendance/bulk", requireAuth, async (req, res) => {
  try {
    const { records } = req.body; // Array of { employeeId, date, status, notes }
    const results = [];
    for (const record of records) {
      const existing = await db.select().from(attendanceTable)
        .where(and(eq(attendanceTable.employeeId, record.employeeId), eq(attendanceTable.date, record.date))).limit(1);
      
      if (existing.length) {
        const [updated] = await db.update(attendanceTable).set({ status: record.status, notes: record.notes, markedBy: req.user!.name, updatedAt: new Date() })
          .where(eq(attendanceTable.id, existing[0].id)).returning();
        results.push(updated);
        await createAuditLog({ module: "attendance", action: "update", recordId: updated.id, userId: req.user!.id, userName: req.user!.name, description: `Updated attendance for employee #${updated.employeeId} on ${updated.date}`, oldValues: existing[0] as any, newValues: record });
      } else {
        const [created] = await db.insert(attendanceTable).values({ employeeId: record.employeeId, date: record.date, status: record.status, notes: record.notes, markedBy: req.user!.name }).returning();
        results.push(created);
        await createAuditLog({ module: "attendance", action: "create", recordId: created.id, userId: req.user!.id, userName: req.user!.name, description: `Created attendance for employee #${created.employeeId} on ${created.date}`, newValues: record });
      }
    }
    await createAuditLog({ module: "attendance", action: "bulk_mark", userId: req.user!.id, userName: req.user!.name, description: `Bulk marked attendance for ${records.length} records`, newValues: { count: records.length } });
    res.json({ success: true, count: results.length });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/attendance", requireAuth, async (req, res) => {
  try {
    const body = req.body;
    const existing = await db.select().from(attendanceTable)
      .where(and(eq(attendanceTable.employeeId, body.employeeId), eq(attendanceTable.date, body.date))).limit(1);
    
    let att;
    if (existing.length) {
      [att] = await db.update(attendanceTable).set({ ...body, hoursWorked: body.hoursWorked ? String(body.hoursWorked) : null, markedBy: req.user!.name, updatedAt: new Date() }).where(eq(attendanceTable.id, existing[0].id)).returning();
    } else {
      [att] = await db.insert(attendanceTable).values({ ...body, hoursWorked: body.hoursWorked ? String(body.hoursWorked) : null, markedBy: req.user!.name }).returning();
    }
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, att.employeeId)).limit(1);
    await createAuditLog({ module: "attendance", action: existing.length ? "update" : "create", recordId: att.id, userId: req.user!.id, userName: req.user!.name, description: `Marked attendance for ${emp?.firstName} ${emp?.lastName} on ${att.date}: ${att.status}`, oldValues: existing[0] as any, newValues: body });
    res.status(201).json({ ...att, employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown", hoursWorked: att.hoursWorked ? Number(att.hoursWorked) : null });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.put("/attendance/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [old] = await db.select().from(attendanceTable).where(eq(attendanceTable.id, id)).limit(1);
    if (!old) { res.status(404).json({ error: "Not found" }); return; }
    const [att] = await db.update(attendanceTable).set({ ...req.body, markedBy: req.user!.name, updatedAt: new Date() }).where(eq(attendanceTable.id, id)).returning();
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, att.employeeId)).limit(1);
    await createAuditLog({ module: "attendance", action: "update", recordId: id, userId: req.user!.id, userName: req.user!.name, description: `Updated attendance for ${emp?.firstName} ${emp?.lastName} on ${att.date}`, oldValues: old as any, newValues: req.body });
    res.json({ ...att, employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown", hoursWorked: att.hoursWorked ? Number(att.hoursWorked) : null });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

// Attendance categories
router.get("/attendance-categories", requireAuth, async (req, res) => {
  try {
    const cats = await db.select().from(attendanceCategoriesTable).orderBy(attendanceCategoriesTable.name);
    res.json({ data: cats });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/attendance-categories", requireAuth, async (req, res) => {
  try {
    const [cat] = await db.insert(attendanceCategoriesTable).values(req.body).returning();
    await createAuditLog({ module: "attendance_categories", action: "create", recordId: cat.id, userId: req.user!.id, userName: req.user!.name, description: `Created attendance category ${cat.name}`, newValues: req.body });
    res.status(201).json(cat);
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.put("/attendance-categories/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [old] = await db.select().from(attendanceCategoriesTable).where(eq(attendanceCategoriesTable.id, id)).limit(1);
    if (!old) { res.status(404).json({ error: "Not found" }); return; }
    const [cat] = await db.update(attendanceCategoriesTable).set(req.body).where(eq(attendanceCategoriesTable.id, id)).returning();
    await createAuditLog({ module: "attendance_categories", action: "update", recordId: id, userId: req.user!.id, userName: req.user!.name, description: `Updated attendance category ${cat.name}`, oldValues: old as any, newValues: req.body });
    res.json(cat);
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.delete("/attendance-categories/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [cat] = await db.select().from(attendanceCategoriesTable).where(eq(attendanceCategoriesTable.id, id)).limit(1);
    if (!cat) { res.status(404).json({ error: "Not found" }); return; }
    await db.delete(attendanceCategoriesTable).where(eq(attendanceCategoriesTable.id, id));
    await createAuditLog({ module: "attendance_categories", action: "delete", recordId: id, userId: req.user!.id, userName: req.user!.name, description: `Deleted attendance category ${cat.name}`, oldValues: cat as any });
    res.status(204).send();
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

export default router;
