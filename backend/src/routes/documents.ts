import { Router } from "express";
import { db } from "@workspace/db";
import { documentsTable } from "@workspace/db/schema/documents";
import { projectsTable } from "@workspace/db/schema/projects";
import { desc, eq, count, ilike, and, isNull } from "@workspace/db/drizzle";
import { requireAuth } from "../middlewares/auth.js";
import { createAuditLog } from "../lib/audit.js";

const router = Router();

const fmt = (d: any) => ({ ...d, tags: Array.isArray(d.tags) ? d.tags : [] });

router.get("/documents", requireAuth, async (req: any, res: any) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const search = req.query.search as string;
    const projectId = req.query.projectId as string;
    const offset = (page - 1) * limit;

    let conditions: any[] = [];
    if (search) conditions.push(ilike(documentsTable.title, `%${search}%`));
    if (projectId) {
      if (projectId === "none") {
        conditions.push(isNull(documentsTable.projectId));
      } else {
        conditions.push(eq(documentsTable.projectId, Number(projectId)));
      }
    }
    const whereClause = conditions.length > 0 ? conditions.reduce((a, b) => and(a, b)) : undefined;

    const [{ total }] = await db.select({ total: count() }).from(documentsTable).where(whereClause);
    const records = await db.select({ doc: documentsTable, proj: { name: projectsTable.name } })
      .from(documentsTable).leftJoin(projectsTable, eq(documentsTable.projectId, projectsTable.id))
      .where(whereClause)
      .limit(limit).offset(offset).orderBy(desc(documentsTable.createdAt), desc(documentsTable.id));
    res.json({ data: records.map(r => ({ ...fmt(r.doc), projectName: r.proj?.name || null })), pagination: { page, limit, total: Number(total), totalPages: Math.ceil(Number(total) / limit) } });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/documents", requireAuth, async (req: any, res: any) => {
  try {
    const body = req.body;
    const [d] = await db.insert(documentsTable).values({ ...body, tags: body.tags || [], uploadedBy: req.user!.name }).returning();
    await createAuditLog({ module: "documents", action: "create", recordId: d.id, userId: req.user!.id, userName: req.user!.name, description: `Created document ${d.title}`, newValues: body });
    res.status(201).json(fmt(d));
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/documents/:id", requireAuth, async (req: any, res: any) => {
  try {
    const records = await db.select({ doc: documentsTable, proj: { name: projectsTable.name } })
      .from(documentsTable).leftJoin(projectsTable, eq(documentsTable.projectId, projectsTable.id))
      .where(eq(documentsTable.id, Number(req.params.id))).limit(1);
    if (!records.length) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ ...fmt(records[0].doc), projectName: records[0].proj?.name || null });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.put("/documents/:id", requireAuth, async (req: any, res: any) => {
  try {
    const id = Number(req.params.id);
    const [old] = await db.select().from(documentsTable).where(eq(documentsTable.id, id)).limit(1);
    if (!old) { res.status(404).json({ error: "Not found" }); return; }
    const [d] = await db.update(documentsTable).set({ ...req.body, updatedAt: new Date() }).where(eq(documentsTable.id, id)).returning();
    await createAuditLog({ module: "documents", action: "update", recordId: id, userId: req.user!.id, userName: req.user!.name, description: `Updated document ${d.title}`, oldValues: old as any, newValues: req.body });
    res.json(fmt(d));
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.delete("/documents/:id", requireAuth, async (req: any, res: any) => {
  try {
    const id = Number(req.params.id);
    const [d] = await db.select().from(documentsTable).where(eq(documentsTable.id, id)).limit(1);
    if (!d) { res.status(404).json({ error: "Not found" }); return; }
    await db.delete(documentsTable).where(eq(documentsTable.id, id));
    await createAuditLog({ module: "documents", action: "delete", recordId: id, userId: req.user!.id, userName: req.user!.name, description: `Deleted document ${d.title}`, oldValues: d as any });
    res.status(204).send();
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

export default router;
