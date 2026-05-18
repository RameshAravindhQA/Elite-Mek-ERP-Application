import { Router } from "express";
import { db, attendanceTable, attendanceCategoriesTable, employeesTable, leavesTable } from "@workspace/db";
import { eq, and, count, gte, lte } from "@workspace/db/drizzle";
import { requireAuth } from "../middlewares/auth.js";
import { createAuditLog } from "../lib/audit.js";

const router = Router();

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

const getDefaultAttendanceStatus = (dow: number) => (dow === 0 ? "week_off" : "present");

async function buildEffectiveAttendance(month: string) {
  const days = getMonthDays(month);
  const startDate = `${month}-01`;
  const endDate = `${month}-${String(days.length).padStart(2, "0")}`;

  const employees = await db.select().from(employeesTable).where(eq(employeesTable.status, "active"));
  const attendance = await db.select().from(attendanceTable)
    .where(and(gte(attendanceTable.date, startDate), lte(attendanceTable.date, endDate)));
  const approvedLeaves = await db.select().from(leavesTable).where(and(
    eq(leavesTable.status, "approved"),
    lte(leavesTable.startDate, endDate),
    gte(leavesTable.endDate, startDate),
  ));

  const attendanceByEmployee = new Map<number, Record<string, string>>();
  attendance.forEach((record) => {
    const map = attendanceByEmployee.get(record.employeeId) || {};
    map[record.date] = record.status;
    attendanceByEmployee.set(record.employeeId, map);
  });

  const leaveByEmployee = new Map<number, Record<string, string>>();
  approvedLeaves.forEach((leave) => {
    const map = leaveByEmployee.get(leave.employeeId) || {};
    getDatesBetween(leave.startDate, leave.endDate)
      .filter((date) => date >= startDate && date <= endDate)
      .forEach((date) => {
        map[date] = normalizeLeaveStatus(leave.leaveType);
      });
    leaveByEmployee.set(leave.employeeId, map);
  });

  const grid = employees.map(emp => {
    const empAttendance: Record<string, string> = {};
    const employeeAttendance = attendanceByEmployee.get(emp.id) || {};
    const employeeLeaves = leaveByEmployee.get(emp.id) || {};
    days.forEach(({ dateStr, dow }) => {
      empAttendance[dateStr] = employeeAttendance[dateStr] || employeeLeaves[dateStr] || getDefaultAttendanceStatus(dow);
    });
    return { employee: { id: emp.id, name: `${emp.firstName} ${emp.lastName}`, employeeId: emp.employeeId, department: emp.department }, attendance: empAttendance };
  });

  return { days, grid };
}

router.get("/attendance/summary", requireAuth, async (req, res) => {
  try {
    const month = req.query.month as string || new Date().toISOString().slice(0, 7);
    const { days, grid } = await buildEffectiveAttendance(month);
    const statuses = grid.flatMap((row) => Object.values(row.attendance));
    const totalWorkingDays = days.filter((day) => day.dow !== 0).length;
    res.json({
      present: statuses.filter(status => status === "present").length,
      absent: statuses.filter(status => status === "absent").length,
      late: statuses.filter(status => status === "late").length,
      halfDay: statuses.filter(status => status === "half_day").length,
      sickLeave: statuses.filter(status => status === "sick_leave").length,
      paidLeave: statuses.filter(status => status === "paid_leave").length,
      unpaidLeave: statuses.filter(status => status === "unpaid_leave").length,
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
    const { days, grid } = await buildEffectiveAttendance(month);

    res.json({ month, daysInMonth: days.length, grid });
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
