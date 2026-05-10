import { Router } from "express";
import { db, projectsTable, projectTasksTable, customersTable, employeesTable } from "@workspace/db";
import { desc, eq, ilike, count, sql, or, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { createAuditLog } from "../lib/audit.js";

const router = Router();

const fmt = (p: any, customerName?: string, managerName?: string) => ({
  ...p, budget: p.budget ? Number(p.budget) : null, spent: Number(p.spent),
  customerName: customerName || null, managerName: managerName || null,
  pendingWorks: Array.isArray(p.pendingWorks) ? p.pendingWorks : [],
  dependencies: Array.isArray(p.dependencies) ? p.dependencies : [],
  followUps: Array.isArray(p.followUps) ? p.followUps : [],
  tags: Array.isArray(p.tags) ? p.tags : [],
});

router.get("/projects/stats", requireAuth, async (req, res) => {
  try {
    const [stats] = await db.select({
      total: count(),
      active: sql<number>`count(*) filter (where status = 'active')`,
      completed: sql<number>`count(*) filter (where status = 'completed')`,
      onHold: sql<number>`count(*) filter (where status = 'on_hold')`,
      totalBudget: sql<number>`sum(budget::numeric)`,
      totalSpent: sql<number>`sum(spent::numeric)`,
    }).from(projectsTable);
    res.json({ total: Number(stats.total), active: Number(stats.active), completed: Number(stats.completed), onHold: Number(stats.onHold), totalBudget: Number(stats.totalBudget) || 0, totalSpent: Number(stats.totalSpent) || 0 });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/projects", requireAuth, async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const search = req.query.search as string;
    const status = req.query.status as string;
    const priority = req.query.priority as string;
    const customerId = req.query.customerId ? Number(req.query.customerId) : null;
    const offset = (page - 1) * limit;

    let conditions: any[] = [];
    if (search) conditions.push(or(ilike(projectsTable.name, `%${search}%`), ilike(projectsTable.description, `%${search}%`)));
    if (status) conditions.push(eq(projectsTable.status, status));
    if (priority) conditions.push(eq(projectsTable.priority, priority));
    if (customerId) conditions.push(eq(projectsTable.customerId, customerId));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [{ total }] = await db.select({ total: count() }).from(projectsTable).where(whereClause);
    const data = await db.select().from(projectsTable).where(whereClause).limit(limit).offset(offset).orderBy(desc(projectsTable.createdAt), desc(projectsTable.id));
    res.json({ data: data.map(p => fmt(p)), pagination: { page, limit, total: Number(total), totalPages: Math.ceil(Number(total) / limit) } });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/projects", requireAuth, async (req, res) => {
  try {
    const body = req.body;
    const [p] = await db.insert(projectsTable).values({ ...body, budget: body.budget ? String(body.budget) : null, spent: "0" }).returning();
    await createAuditLog({ module: "projects", action: "create", recordId: p.id, userId: req.user!.id, userName: req.user!.name, description: `Created project ${p.name}`, newValues: body });
    res.status(201).json(fmt(p));
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/projects/:id", requireAuth, async (req, res) => {
  try {
    const [p] = await db.select().from(projectsTable).where(eq(projectsTable.id, Number(req.params.id))).limit(1);
    if (!p) { res.status(404).json({ error: "Not found" }); return; }
    const tasks = await db.select().from(projectTasksTable).where(eq(projectTasksTable.projectId, p.id));
    res.json({ ...fmt(p), tasks });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.put("/projects/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [old] = await db.select().from(projectsTable).where(eq(projectsTable.id, id)).limit(1);
    const body = req.body;
    const updates: any = { ...body, updatedAt: new Date() };
    if (body.budget !== undefined) updates.budget = body.budget ? String(body.budget) : null;
    if (body.spent !== undefined) updates.spent = String(body.spent);
    const [p] = await db.update(projectsTable).set(updates).where(eq(projectsTable.id, id)).returning();
    await createAuditLog({ module: "projects", action: "update", recordId: id, userId: req.user!.id, userName: req.user!.name, description: `Updated project ${p.name}`, oldValues: old as any, newValues: body });
    res.json(fmt(p));
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.delete("/projects/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [p] = await db.select().from(projectsTable).where(eq(projectsTable.id, id)).limit(1);
    await db.delete(projectTasksTable).where(eq(projectTasksTable.projectId, id));
    await db.delete(projectsTable).where(eq(projectsTable.id, id));
    await createAuditLog({ module: "projects", action: "delete", recordId: id, userId: req.user!.id, userName: req.user!.name, description: `Deleted project ${p?.name}`, oldValues: p as any });
    res.status(204).send();
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

// Project Tasks
router.get("/projects/:id/tasks", requireAuth, async (req, res) => {
  try {
    const tasks = await db.select().from(projectTasksTable).where(eq(projectTasksTable.projectId, Number(req.params.id))).orderBy(desc(projectTasksTable.createdAt), desc(projectTasksTable.id));
    res.json({ data: tasks });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/projects/:id/tasks", requireAuth, async (req, res) => {
  try {
    const [task] = await db.insert(projectTasksTable).values({ ...req.body, projectId: Number(req.params.id) }).returning();
    await createAuditLog({ module: "projects", action: "task_create", recordId: Number(req.params.id), userId: req.user!.id, userName: req.user!.name, description: `Created task: ${task.title}`, newValues: req.body });
    res.status(201).json(task);
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.put("/projects/:projectId/tasks/:taskId", requireAuth, async (req, res) => {
  try {
    const [task] = await db.update(projectTasksTable).set({ ...req.body, updatedAt: new Date() }).where(eq(projectTasksTable.id, Number(req.params.taskId))).returning();
    res.json(task);
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.delete("/projects/:projectId/tasks/:taskId", requireAuth, async (req, res) => {
  try {
    await db.delete(projectTasksTable).where(eq(projectTasksTable.id, Number(req.params.taskId)));
    res.status(204).send();
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

export default router;
