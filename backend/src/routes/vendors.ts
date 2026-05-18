import { Router } from "express";
import { db } from "@workspace/db";
import { vendorsTable } from "@workspace/db/schema/vendors";
import { desc, eq, ilike, count, sql, or, and } from "@workspace/db/drizzle";
import { requireAuth } from "../middlewares/auth.js";
import { createAuditLog } from "../lib/audit.js";

const router = Router();

router.get("/vendors", requireAuth, async (req: any, res: any) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const search = req.query.search as string;
    const category = req.query.category as string;
    const offset = (page - 1) * limit;

    let conditions: any[] = [];
    if (search) conditions.push(or(ilike(vendorsTable.name, `%${search}%`), ilike(vendorsTable.email, `%${search}%`), ilike(vendorsTable.phone, `%${search}%`)));
    if (category) conditions.push(eq(vendorsTable.category, category));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [{ total }] = await db.select({ total: count() }).from(vendorsTable).where(whereClause);
    const data = await db.select().from(vendorsTable).where(whereClause).limit(limit).offset(offset).orderBy(desc(vendorsTable.createdAt), desc(vendorsTable.id));
    res.json({ data, pagination: { page, limit, total: Number(total), totalPages: Math.ceil(Number(total) / limit) } });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/vendors", requireAuth, async (req: any, res: any) => {
  try {
    const [v] = await db.insert(vendorsTable).values(req.body).returning();
    await createAuditLog({ module: "vendors", action: "create", recordId: v.id, userId: req.user!.id, userName: req.user!.name, description: `Created vendor ${v.name}`, newValues: req.body });
    res.status(201).json(v);
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/vendors/:id", requireAuth, async (req: any, res: any) => {
  try {
    const [v] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, Number(req.params.id))).limit(1);
    if (!v) { res.status(404).json({ error: "Not found" }); return; }
    res.json(v);
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.put("/vendors/:id", requireAuth, async (req: any, res: any) => {
  try {
    const id = Number(req.params.id);
    const [old] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, id)).limit(1);
    const [v] = await db.update(vendorsTable).set({ ...req.body, updatedAt: new Date() }).where(eq(vendorsTable.id, id)).returning();
    await createAuditLog({ module: "vendors", action: "update", recordId: id, userId: req.user!.id, userName: req.user!.name, description: `Updated vendor ${v.name}`, oldValues: old as any, newValues: req.body });
    res.json(v);
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.delete("/vendors/:id", requireAuth, async (req: any, res: any) => {
  try {
    const id = Number(req.params.id);
    const [v] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, id)).limit(1);
    await db.delete(vendorsTable).where(eq(vendorsTable.id, id));
    await createAuditLog({ module: "vendors", action: "delete", recordId: id, userId: req.user!.id, userName: req.user!.name, description: `Deleted vendor ${v?.name}`, oldValues: v as any });
    res.status(204).send();
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

export default router;
