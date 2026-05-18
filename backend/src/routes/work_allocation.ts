import { Router } from "express";
import { db } from "@workspace/db";
import { projectsTable } from "@workspace/db/schema/projects";
import { employeesTable } from "@workspace/db/schema/employees";
import { workAllocationsTable } from "@workspace/db/schema/work_allocations";
import { customersTable } from "@workspace/db/schema/customers";
import { eq } from "@workspace/db/drizzle";
import { requireAuth } from "../middlewares/auth.js";
import { createAuditLog } from "../lib/audit.js";

const router = Router();

router.get("/work-allocation", requireAuth, async (req: any, res: any) => {
  try {
    const projectId = req.query.projectId ? Number(req.query.projectId) : null;
    if (!projectId) {
      res.json({ allocations: [] });
      return;
    }
    const rows = await db.select().from(workAllocationsTable).where(eq(workAllocationsTable.projectId, projectId));
    const employeeIds = rows.map(row => row.employeeId);
    res.json({ projectId, employeeIds });
  } catch (err) {
    req.log.error({ err });
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/work-allocation", requireAuth, async (req: any, res: any) => {
  try {
    const { projectId, employeeIds } = req.body;
    if (!projectId) {
      res.status(400).json({ error: "projectId required" });
      return;
    }
    const pid = Number(projectId);
    const ids = Array.isArray(employeeIds) ? employeeIds.map(Number).filter(Boolean) : [];
    const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, pid)).limit(1);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    await db.delete(workAllocationsTable).where(eq(workAllocationsTable.projectId, pid));
    if (ids.length) {
      await db.insert(workAllocationsTable).values(ids.map(employeeId => ({
        customerId: Number(project.customerId || 0),
        projectId: pid,
        employeeId,
        status: "active",
      })));
    }
    await createAuditLog({ module: "work_allocation", action: "save", recordId: pid, userId: req.user!.id, userName: req.user!.name, description: `Saved work allocation for ${project.name}`, newValues: { projectId: pid, employeeIds: ids } });
    res.json({ success: true, projectId: pid, employeeIds: ids, count: ids.length });
  } catch (err) {
    req.log.error({ err });
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/work-allocation/all", requireAuth, async (req: any, res: any) => {
  try {
    const rows = await db.select({
      allocation: workAllocationsTable,
      project: { name: projectsTable.name },
      customer: { name: customersTable.name },
      emp: { firstName: employeesTable.firstName, lastName: employeesTable.lastName, employeeId: employeesTable.employeeId },
    }).from(workAllocationsTable)
      .leftJoin(projectsTable, eq(workAllocationsTable.projectId, projectsTable.id))
      .leftJoin(customersTable, eq(workAllocationsTable.customerId, customersTable.id))
      .leftJoin(employeesTable, eq(workAllocationsTable.employeeId, employeesTable.id));
    res.json({ data: rows.map(row => ({ ...row.allocation, projectName: row.project?.name, customerName: row.customer?.name, employeeName: row.emp ? `${row.emp.firstName} ${row.emp.lastName}` : "Unknown", employeeCode: row.emp?.employeeId })) });
  } catch (err) {
    req.log.error({ err });
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
