import { Router } from "express";
import { db, notificationsTable } from "@workspace/db";
import { eq, count, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

router.get("/notifications", requireAuth, async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const [{ total }] = await db.select({ total: count() }).from(notificationsTable);
    const [{ unread }] = await db.select({ unread: sql<number>`count(*) filter (where is_read = false)` }).from(notificationsTable);
    const data = await db.select().from(notificationsTable).limit(limit).offset(offset).orderBy(sql`created_at desc`);
    res.json({ data, unreadCount: Number(unread), pagination: { page, limit, total: Number(total), totalPages: Math.ceil(Number(total) / limit) } });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.put("/notifications/:id/read", requireAuth, async (req, res) => {
  try {
    await db.update(notificationsTable).set({ isRead: true }).where(eq(notificationsTable.id, Number(req.params.id)));
    res.json({ success: true });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.put("/notifications/read-all", requireAuth, async (req, res) => {
  try {
    await db.update(notificationsTable).set({ isRead: true });
    res.json({ success: true });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

export default router;
