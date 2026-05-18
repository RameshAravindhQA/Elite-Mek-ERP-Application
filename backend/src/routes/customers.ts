import { Router } from "express";
import { db } from "@workspace/db";
import { customersTable } from "@workspace/db/schema/customers";
import { desc, eq, ilike, count, sql, or, and } from "@workspace/db/drizzle";
import { requireAuth } from "../middlewares/auth.js";
import { createAuditLog } from "../lib/audit.js";

const router = Router();

const fmt = (c: any) => ({ ...c, totalOrders: Number(c.totalOrders), totalRevenue: Number(c.totalRevenue) });

router.get("/customers", requireAuth, async (req: any, res: any) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const search = req.query.search as string;
    const status = req.query.status as string;
    const offset = (page - 1) * limit;

    let conditions: any[] = [];
    if (search) conditions.push(or(ilike(customersTable.name, `%${search}%`), ilike(customersTable.email, `%${search}%`), ilike(customersTable.phone, `%${search}%`)));
    if (status) conditions.push(eq(customersTable.status, status));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [{ total }] = await db.select({ total: count() }).from(customersTable).where(whereClause);
    const data = await db.select().from(customersTable).where(whereClause).limit(limit).offset(offset).orderBy(desc(customersTable.createdAt), desc(customersTable.id));
    res.json({ data: data.map(fmt), pagination: { page, limit, total: Number(total), totalPages: Math.ceil(Number(total) / limit) } });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/customers", requireAuth, async (req: any, res: any) => {
  try {
    const [c] = await db.insert(customersTable).values(req.body).returning();
    await createAuditLog({ module: "customers", action: "create", recordId: c.id, userId: req.user!.id, userName: req.user!.name, description: `Created customer ${c.name}`, newValues: req.body });
    res.status(201).json(fmt(c));
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/customers/:id", requireAuth, async (req: any, res: any) => {
  try {
    const [c] = await db.select().from(customersTable).where(eq(customersTable.id, Number(req.params.id))).limit(1);
    if (!c) { res.status(404).json({ error: "Not found" }); return; }
    res.json(fmt(c));
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.put("/customers/:id", requireAuth, async (req: any, res: any) => {
  try {
    const id = Number(req.params.id);
    const [old] = await db.select().from(customersTable).where(eq(customersTable.id, id)).limit(1);
    const [c] = await db.update(customersTable).set({ ...req.body, updatedAt: new Date() }).where(eq(customersTable.id, id)).returning();
    await createAuditLog({ module: "customers", action: "update", recordId: id, userId: req.user!.id, userName: req.user!.name, description: `Updated customer ${c.name}`, oldValues: old as any, newValues: req.body });
    res.json(fmt(c));
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.delete("/customers/:id", requireAuth, async (req: any, res: any) => {
  try {
    const id = Number(req.params.id);
    const [c] = await db.select().from(customersTable).where(eq(customersTable.id, id)).limit(1);
    await db.delete(customersTable).where(eq(customersTable.id, id));
    await createAuditLog({ module: "customers", action: "delete", recordId: id, userId: req.user!.id, userName: req.user!.name, description: `Deleted customer ${c?.name}`, oldValues: c as any });
    res.status(204).send();
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

export default router;
