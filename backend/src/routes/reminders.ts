import { Router } from "express";
import { db } from "@workspace/db";
import { remindersTable } from "@workspace/db/schema/reminders";
import { eq, count, sql, lte, and } from "@workspace/db/drizzle";
import { requireAuth } from "../middlewares/auth.js";
import { createAuditLog } from "../lib/audit.js";

const router = Router();

const fmt = (r: any) => ({ ...r });

router.get("/reminders/due-today", requireAuth, async (req: any, res: any) => {
  try {
    const now = new Date();
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const data = await db.select().from(remindersTable)
      .where(and(lte(remindersTable.remindAt, endOfDay), eq(remindersTable.isDismissed, false)))
      .orderBy(remindersTable.remindAt);
    res.json({ data: data.map(fmt), pagination: { page: 1, limit: 100, total: data.length, totalPages: 1 } });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/reminders", requireAuth, async (req: any, res: any) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const [{ total }] = await db.select({ total: count() }).from(remindersTable);
    const data = await db.select().from(remindersTable).limit(limit).offset(offset).orderBy(remindersTable.remindAt, remindersTable.id);
    res.json({ data: data.map(fmt), pagination: { page, limit, total: Number(total), totalPages: Math.ceil(Number(total) / limit) } });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/reminders", requireAuth, async (req: any, res: any) => {
  try {
    const body = req.body;
    const [r] = await db.insert(remindersTable).values({ ...body, remindAt: new Date(body.remindAt), createdBy: req.user!.name }).returning();
    await createAuditLog({ module: "reminders", action: "create", recordId: r.id, userId: req.user!.id, userName: req.user!.name, description: `Created reminder ${r.title}`, newValues: body });
    res.status(201).json(fmt(r));
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.put("/reminders/:id", requireAuth, async (req: any, res: any) => {
  try {
    const id = Number(req.params.id);
    const [old] = await db.select().from(remindersTable).where(eq(remindersTable.id, id)).limit(1);
    if (!old) { res.status(404).json({ error: "Not found" }); return; }
    const body = req.body;
    const updates: any = { ...body, updatedAt: new Date() };
    if (body.remindAt) updates.remindAt = new Date(body.remindAt);
    const [r] = await db.update(remindersTable).set(updates).where(eq(remindersTable.id, id)).returning();
    await createAuditLog({ module: "reminders", action: "update", recordId: id, userId: req.user!.id, userName: req.user!.name, description: `Updated reminder ${r.title}`, oldValues: old as any, newValues: body });
    res.json(fmt(r));
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.delete("/reminders/:id", requireAuth, async (req: any, res: any) => {
  try {
    const id = Number(req.params.id);
    const [r] = await db.select().from(remindersTable).where(eq(remindersTable.id, id)).limit(1);
    if (!r) { res.status(404).json({ error: "Not found" }); return; }
    await db.delete(remindersTable).where(eq(remindersTable.id, id));
    await createAuditLog({ module: "reminders", action: "delete", recordId: id, userId: req.user!.id, userName: req.user!.name, description: `Deleted reminder ${r.title}`, oldValues: r as any });
    res.status(204).send();
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

export default router;
