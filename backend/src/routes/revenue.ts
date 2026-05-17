import { Router } from "express";
import { db, revenueTable, customersTable, projectsTable } from "@workspace/db";
import { desc, eq, count, sql, ilike, or, and } from "@workspace/db/drizzle";
import { requireAuth } from "../middlewares/auth.js";
import { createAuditLog } from "../lib/audit.js";

const router = Router();

const fmt = (r: any) => ({ ...r, amount: Number(r.amount) });

router.get("/revenue/stats", requireAuth, async (req, res) => {
  try {
    const [stats] = await db.select({
      totalThisMonth: sql<number>`sum(amount) filter (where date_trunc('month', date::date) = date_trunc('month', now()))`,
      totalThisYear: sql<number>`sum(amount) filter (where date_trunc('year', date::date) = date_trunc('year', now()))`,
      lastMonth: sql<number>`sum(amount) filter (where date_trunc('month', date::date) = date_trunc('month', now() - interval '1 month'))`,
    }).from(revenueTable);
    const thisMonth = Number(stats.totalThisMonth) || 0;
    const lastMonth = Number(stats.lastMonth) || 0;
    const growth = lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : 0;
    const bySource = await db.select({ source: revenueTable.source, amount: sql<number>`sum(amount)` }).from(revenueTable).groupBy(revenueTable.source);
    res.json({ totalThisMonth: thisMonth, totalThisYear: Number(stats.totalThisYear) || 0, growth: Math.round(growth * 100) / 100, bySource: bySource.map(s => ({ source: s.source, amount: Number(s.amount) })) });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/revenue", requireAuth, async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const search = req.query.search as string;
    const source = req.query.source as string;
    const offset = (page - 1) * limit;

    let conditions: any[] = [];
    if (search) conditions.push(or(ilike(revenueTable.title, `%${search}%`), ilike(revenueTable.description, `%${search}%`)));
    if (source) conditions.push(eq(revenueTable.source, source));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [{ total }] = await db.select({ total: count() }).from(revenueTable).where(whereClause);
    const data = await db.select().from(revenueTable).where(whereClause).limit(limit).offset(offset).orderBy(desc(revenueTable.createdAt), desc(revenueTable.id));
    res.json({ data: data.map(fmt), pagination: { page, limit, total: Number(total), totalPages: Math.ceil(Number(total) / limit) } });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/revenue", requireAuth, async (req, res) => {
  try {
    const body = req.body;
    const [r] = await db.insert(revenueTable).values({ ...body, amount: String(body.amount) }).returning();
    await createAuditLog({ module: "revenue", action: "create", recordId: r.id, userId: req.user!.id, userName: req.user!.name, description: `Created revenue: ${r.title}`, newValues: body });
    res.status(201).json(fmt(r));
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/revenue/:id", requireAuth, async (req, res) => {
  try {
    const [r] = await db.select().from(revenueTable).where(eq(revenueTable.id, Number(req.params.id))).limit(1);
    if (!r) { res.status(404).json({ error: "Not found" }); return; }
    res.json(fmt(r));
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.put("/revenue/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [old] = await db.select().from(revenueTable).where(eq(revenueTable.id, id)).limit(1);
    if (!old) { res.status(404).json({ error: "Not found" }); return; }
    const body = req.body;
    const updates: any = { ...body, updatedAt: new Date() };
    if (body.amount !== undefined) updates.amount = String(body.amount);
    const [r] = await db.update(revenueTable).set(updates).where(eq(revenueTable.id, id)).returning();
    await createAuditLog({ module: "revenue", action: "update", recordId: id, userId: req.user!.id, userName: req.user!.name, description: `Updated revenue: ${r.title}`, oldValues: old as any, newValues: body });
    res.json(fmt(r));
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.delete("/revenue/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [r] = await db.select().from(revenueTable).where(eq(revenueTable.id, id)).limit(1);
    if (!r) { res.status(404).json({ error: "Not found" }); return; }
    await db.delete(revenueTable).where(eq(revenueTable.id, id));
    await createAuditLog({ module: "revenue", action: "delete", recordId: id, userId: req.user!.id, userName: req.user!.name, description: `Deleted revenue: ${r.title}`, oldValues: r as any });
    res.status(204).send();
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

export default router;
