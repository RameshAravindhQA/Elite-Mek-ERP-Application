import { Router } from "express";
import { db, auditLogsTable } from "@workspace/db";
import { and, eq, count, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

router.get("/audit-logs", requireAuth, async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const module = req.query.module as string;
    const recordId = req.query.recordId ? Number(req.query.recordId) : undefined;
    const conditions: any[] = [];
    if (module) conditions.push(eq(auditLogsTable.module, module));
    if (recordId) conditions.push(eq(auditLogsTable.recordId, recordId));
    const whereClause = conditions.length ? and(...conditions) : undefined;

    const [{ total }] = await db.select({ total: count() }).from(auditLogsTable).where(whereClause);
    const data = await db.select().from(auditLogsTable).where(whereClause).orderBy(sql`created_at desc`).limit(limit).offset(offset);

    res.json({ data, pagination: { page, limit, total: Number(total), totalPages: Math.ceil(Number(total) / limit) } });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

export default router;
