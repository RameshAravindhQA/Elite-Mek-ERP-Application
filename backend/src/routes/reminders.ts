import { Router } from "express";
import { db, remindersTable } from "@workspace/db";
import { eq, count, sql, lte, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

const fmt = (r: any) => ({ ...r });

router.get("/reminders/due-today", requireAuth, async (req, res) => {
  try {
    const now = new Date();
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const data = await db.select().from(remindersTable)
      .where(and(lte(remindersTable.remindAt, endOfDay), eq(remindersTable.isDismissed, false)))
      .orderBy(remindersTable.remindAt);
    res.json({ data: data.map(fmt), pagination: { page: 1, limit: 100, total: data.length, totalPages: 1 } });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/reminders", requireAuth, async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const [{ total }] = await db.select({ total: count() }).from(remindersTable);
    const data = await db.select().from(remindersTable).limit(limit).offset(offset).orderBy(remindersTable.remindAt, remindersTable.id);
    res.json({ data: data.map(fmt), pagination: { page, limit, total: Number(total), totalPages: Math.ceil(Number(total) / limit) } });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/reminders", requireAuth, async (req, res) => {
  try {
    const body = req.body;
    const [r] = await db.insert(remindersTable).values({ ...body, remindAt: new Date(body.remindAt), createdBy: req.user!.name }).returning();
    res.status(201).json(fmt(r));
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.put("/reminders/:id", requireAuth, async (req, res) => {
  try {
    const body = req.body;
    const updates: any = { ...body, updatedAt: new Date() };
    if (body.remindAt) updates.remindAt = new Date(body.remindAt);
    const [r] = await db.update(remindersTable).set(updates).where(eq(remindersTable.id, Number(req.params.id))).returning();
    res.json(fmt(r));
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.delete("/reminders/:id", requireAuth, async (req, res) => {
  try {
    await db.delete(remindersTable).where(eq(remindersTable.id, Number(req.params.id)));
    res.status(204).send();
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

export default router;
