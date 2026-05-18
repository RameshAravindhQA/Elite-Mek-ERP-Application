import { Router } from "express";
import { db } from "@workspace/db";
import { leavesTable } from "@workspace/db/schema/leaves";
import { employeesTable } from "@workspace/db/schema/employees";
import { attendanceTable } from "@workspace/db/schema/attendance";
import { desc, eq, count, and, inArray, gte, lte, ilike, or } from "@workspace/db/drizzle";
import { requireAuth, requirePermission } from "../middlewares/auth.js";
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

const getDatesBetween = (startDate: string, endDate: string) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const dates: string[] = [];
  for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
    dates.push(dt.toISOString().slice(0, 10));
  }
  return dates;
};

const dateFieldToString = (value: string | Date) => (
  typeof value === "string" ? value : value.toISOString().slice(0, 10)
);

const isEmployeeSelfOnly = (role: string) => {
  const normalized = role.toLowerCase().trim();
  return normalized === "employee";
};

const joinLeaves = async (page: number, limit: number, emailFilter?: string, search?: string, status?: string) => {
  const offset = (page - 1) * limit;
  let conditions: any[] = [];
  if (emailFilter) conditions.push(eq(employeesTable.email, emailFilter));
  if (status) conditions.push(eq(leavesTable.status, status));
  if (search) conditions.push(or(ilike(employeesTable.firstName, `%${search}%`), ilike(employeesTable.lastName, `%${search}%`)));
  
  const whereClause = conditions.length > 0 ? conditions.reduce((a, b) => and(a, b)) : undefined;

  const [{ total }] = await db.select({ total: count() })
    .from(leavesTable)
    .leftJoin(employeesTable, eq(leavesTable.employeeId, employeesTable.id))
    .where(whereClause);
  const records = await db.select({ leave: leavesTable, emp: { firstName: employeesTable.firstName, lastName: employeesTable.lastName } })
    .from(leavesTable).leftJoin(employeesTable, eq(leavesTable.employeeId, employeesTable.id))
    .where(whereClause)
    .limit(limit).offset(offset).orderBy(desc(leavesTable.createdAt), desc(leavesTable.id));
  return { data: records.map(r => ({ ...r.leave, employeeName: r.emp ? `${r.emp.firstName} ${r.emp.lastName}` : "Unknown", days: Number(r.leave.days) })), total: Number(total) };
};

router.get("/leaves", requireAuth, requirePermission("leaves", "view"), async (req: any, res: any) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const search = req.query.search as string;
    const status = req.query.status as string;
    const emailFilter = isEmployeeSelfOnly(req.user!.role) ? req.user!.email : undefined;
    const { data, total } = await joinLeaves(page, limit, emailFilter, search, status);
    res.json({ data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/leaves", requireAuth, requirePermission("leaves", "create"), async (req: any, res: any) => {
  try {
    const body = req.body;
    const start = new Date(body.startDate);
    const end = new Date(body.endDate);
    const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    const [leave] = await db.insert(leavesTable).values({ ...body, days: String(days) }).returning();
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, leave.employeeId)).limit(1);
    await createAuditLog({ module: "leaves", action: "create", recordId: leave.id, userId: req.user!.id, userName: req.user!.name, description: `Created leave request for ${emp ? `${emp.firstName} ${emp.lastName}` : `employee #${leave.employeeId}`}`, newValues: body });
    res.status(201).json({ ...leave, employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown", days: Number(leave.days) });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/leaves/sync-approved", requireAuth, requirePermission("leaves", "edit"), async (req: any, res: any) => {
  try {
    const month = req.query.month as string | undefined;
    let approvedLeaves = await db.select().from(leavesTable).where(eq(leavesTable.status, "approved"));

    if (month) {
      const [year, mon] = month.split("-").map(Number);
      const daysInMonth = new Date(year, mon, 0).getDate();
      const startDate = `${month}-01`;
      const endDate = `${month}-${String(daysInMonth).padStart(2, "0")}`;
      approvedLeaves = await db.select().from(leavesTable).where(and(
        eq(leavesTable.status, "approved"),
        lte(leavesTable.startDate, endDate),
        gte(leavesTable.endDate, startDate),
      ));
    }

    const dateRanges = approvedLeaves.flatMap((leave) => getDatesBetween(
      dateFieldToString(leave.startDate),
      dateFieldToString(leave.endDate),
    ));
    const uniqueDates = Array.from(new Set(dateRanges));
    const employeeIds = Array.from(new Set(approvedLeaves.map((leave) => leave.employeeId)));

    const attendanceRows = employeeIds.length > 0
      ? await db.select().from(attendanceTable).where(and(
          inArray(attendanceTable.employeeId, employeeIds),
          inArray(attendanceTable.date, uniqueDates),
        ))
      : [];

    const attendanceMap = new Map<string, any>();
    attendanceRows.forEach((row) => {
      attendanceMap.set(`${row.employeeId}__${row.date}`, row);
    });

    let updated = 0;
    let created = 0;

    for (const leave of approvedLeaves) {
      const leaveStatus = normalizeLeaveStatus(leave.leaveType);
      const leaveDates = getDatesBetween(
        dateFieldToString(leave.startDate),
        dateFieldToString(leave.endDate),
      );

      for (const date of leaveDates) {
        const key = `${leave.employeeId}__${date}`;
        const existingAttendance = attendanceMap.get(key);

        if (existingAttendance) {
          await db.update(attendanceTable).set({ status: leaveStatus, markedBy: req.user!.name, updatedAt: new Date() })
            .where(eq(attendanceTable.id, existingAttendance.id));
          updated += 1;
        } else {
          await db.insert(attendanceTable).values({ employeeId: leave.employeeId, date, status: leaveStatus, markedBy: req.user!.name });
          created += 1;
        }
      }
    }

    res.json({ success: true, created, updated, syncedLeaves: approvedLeaves.length });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/leaves/:id", requireAuth, requirePermission("leaves", "view"), async (req: any, res: any) => {
  try {
    const records = await db.select({ leave: leavesTable, emp: { firstName: employeesTable.firstName, lastName: employeesTable.lastName, email: employeesTable.email } })
      .from(leavesTable).leftJoin(employeesTable, eq(leavesTable.employeeId, employeesTable.id))
      .where(eq(leavesTable.id, Number(req.params.id))).limit(1);
    if (!records.length) { res.status(404).json({ error: "Not found" }); return; }
    const r = records[0];
    if (isEmployeeSelfOnly(req.user!.role) && r.emp?.email !== req.user!.email) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    res.json({ ...r.leave, employeeName: r.emp ? `${r.emp.firstName} ${r.emp.lastName}` : "Unknown", days: Number(r.leave.days) });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.put("/leaves/:id", requireAuth, requirePermission("leaves", "edit"), async (req: any, res: any) => {
  try {
    const leaveId = Number(req.params.id);
    const [existingLeave] = await db.select().from(leavesTable).where(eq(leavesTable.id, leaveId)).limit(1);
    if (!existingLeave) { res.status(404).json({ error: "Not found" }); return; }
    if (isEmployeeSelfOnly(req.user!.role)) {
      const [employee] = await db.select().from(employeesTable).where(eq(employeesTable.id, existingLeave.employeeId)).limit(1);
      if (!employee || employee.email !== req.user!.email) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }
    const [leave] = await db.update(leavesTable).set({ ...req.body, updatedAt: new Date() }).where(eq(leavesTable.id, leaveId)).returning();
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, leave.employeeId)).limit(1);
    const employeeName = emp ? `${emp.firstName} ${emp.lastName}` : `employee #${leave.employeeId}`;

    const leaveDates = getDatesBetween(
      dateFieldToString(leave.startDate),
      dateFieldToString(leave.endDate)
    );
    const leaveStatus = normalizeLeaveStatus(leave.leaveType);

    if (req.body.status === "approved") {
      for (const date of leaveDates) {
        const existingAttendance = await db.select().from(attendanceTable)
          .where(and(eq(attendanceTable.employeeId, leave.employeeId), eq(attendanceTable.date, date))).limit(1);

        if (existingAttendance.length) {
          await db.update(attendanceTable).set({ status: leaveStatus, markedBy: req.user!.name, updatedAt: new Date() })
            .where(eq(attendanceTable.id, existingAttendance[0].id));
        } else {
          await db.insert(attendanceTable).values({ employeeId: leave.employeeId, date, status: leaveStatus, markedBy: req.user!.name });
        }
      }
    } else if (existingLeave?.status === "approved" && req.body.status !== "approved") {
      const approvedStatuses = ["sick_leave", "half_day", "paid_leave", "unpaid_leave", "week_off", "holiday"];
      await db.update(attendanceTable).set({ status: "", updatedAt: new Date() })
        .where(and(
          eq(attendanceTable.employeeId, leave.employeeId),
          inArray(attendanceTable.date, leaveDates),
          inArray(attendanceTable.status, approvedStatuses)
        ));
    }

    await createAuditLog({
      module: "leaves",
      action: "update",
      recordId: leaveId,
      userId: req.user!.id,
      userName: req.user!.name,
      description: existingLeave.status !== leave.status ? `Changed leave status for ${employeeName} from ${existingLeave.status} to ${leave.status}` : `Updated leave request for ${employeeName}`,
      oldValues: existingLeave as any,
      newValues: req.body,
    });

    res.json({ ...leave, employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown", days: Number(leave.days) });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.delete("/leaves/:id", requireAuth, requirePermission("leaves", "delete"), async (req: any, res: any) => {
  try {
    const leaveId = Number(req.params.id);
    const [existingLeave] = await db.select().from(leavesTable).where(eq(leavesTable.id, leaveId)).limit(1);
    if (!existingLeave) { res.status(404).json({ error: "Not found" }); return; }
    if (isEmployeeSelfOnly(req.user!.role)) {
      const [employee] = await db.select().from(employeesTable).where(eq(employeesTable.id, existingLeave.employeeId)).limit(1);
      if (!employee || employee.email !== req.user!.email) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }
    await db.delete(leavesTable).where(eq(leavesTable.id, leaveId));
    await createAuditLog({ module: "leaves", action: "delete", recordId: leaveId, userId: req.user!.id, userName: req.user!.name, description: `Deleted leave request #${leaveId}`, oldValues: existingLeave as any });
    res.status(204).send();
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

export default router;
