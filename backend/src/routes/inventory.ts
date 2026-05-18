import { Router } from "express";
import { db } from "@workspace/db";
import { inventoryTable } from "@workspace/db/schema/inventory";
import { inventoryMovementsTable } from "@workspace/db/schema/inventory_movements";
import { desc, eq, ilike, count, sql, or, and } from "@workspace/db/drizzle";
import { requireAuth } from "../middlewares/auth.js";
import { createAuditLog } from "../lib/audit.js";

const router = Router();

const fmt = (i: any) => ({ ...i, quantity: Number(i.quantity), reorderLevel: Number(i.reorderLevel), costPrice: Number(i.costPrice), sellingPrice: Number(i.sellingPrice) });

router.get("/inventory/stats", requireAuth, async (req: any, res: any) => {
  try {
    const [stats] = await db.select({
      totalItems: count(),
      totalValue: sql<number>`sum(quantity * cost_price)`,
      lowStock: sql<number>`count(*) filter (where quantity <= reorder_level and quantity > 0)`,
      outOfStock: sql<number>`count(*) filter (where quantity = 0)`,
    }).from(inventoryTable);
    const byCategory = await db.select({ category: inventoryTable.category, count: count(), value: sql<number>`sum(quantity * cost_price)` }).from(inventoryTable).groupBy(inventoryTable.category);
    res.json({ totalItems: Number(stats.totalItems), totalValue: Number(stats.totalValue) || 0, lowStock: Number(stats.lowStock), outOfStock: Number(stats.outOfStock), byCategory: byCategory.map(c => ({ category: c.category, count: Number(c.count), value: Number(c.value) || 0 })) });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/inventory", requireAuth, async (req: any, res: any) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const search = req.query.search as string;
    const category = req.query.category as string;
    const offset = (page - 1) * limit;

    let conditions: any[] = [];
    if (search) conditions.push(or(ilike(inventoryTable.name, `%${search}%`), ilike(inventoryTable.description, `%${search}%`), ilike(inventoryTable.sku, `%${search}%`)));
    if (category) conditions.push(eq(inventoryTable.category, category));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [{ total }] = await db.select({ total: count() }).from(inventoryTable).where(whereClause);
    const data = await db.select().from(inventoryTable).where(whereClause).limit(limit).offset(offset).orderBy(desc(inventoryTable.createdAt), desc(inventoryTable.id));
    res.json({ data: data.map(fmt), pagination: { page, limit, total: Number(total), totalPages: Math.ceil(Number(total) / limit) } });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/inventory", requireAuth, async (req: any, res: any) => {
  try {
    const body = req.body;
    const [item] = await db.insert(inventoryTable).values({ ...body, quantity: String(body.quantity), reorderLevel: String(body.reorderLevel), costPrice: String(body.costPrice), sellingPrice: String(body.sellingPrice) }).returning();
    await createAuditLog({ module: "inventory", action: "create", recordId: item.id, userId: req.user!.id, userName: req.user!.name, description: `Created inventory item ${item.name}`, newValues: body });
    res.status(201).json(fmt(item));
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/inventory/:id", requireAuth, async (req: any, res: any) => {
  try {
    const [item] = await db.select().from(inventoryTable).where(eq(inventoryTable.id, Number(req.params.id))).limit(1);
    if (!item) { res.status(404).json({ error: "Not found" }); return; }
    res.json(fmt(item));
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.put("/inventory/:id", requireAuth, async (req: any, res: any) => {
  try {
    const id = Number(req.params.id);
    const [old] = await db.select().from(inventoryTable).where(eq(inventoryTable.id, id)).limit(1);
    const body = req.body;
    const updates: any = { ...body, updatedAt: new Date() };
    if (body.quantity !== undefined) updates.quantity = String(body.quantity);
    if (body.reorderLevel !== undefined) updates.reorderLevel = String(body.reorderLevel);
    if (body.costPrice !== undefined) updates.costPrice = String(body.costPrice);
    if (body.sellingPrice !== undefined) updates.sellingPrice = String(body.sellingPrice);
    const [item] = await db.update(inventoryTable).set(updates).where(eq(inventoryTable.id, id)).returning();
    await createAuditLog({ module: "inventory", action: "update", recordId: id, userId: req.user!.id, userName: req.user!.name, description: `Updated inventory item ${item.name}`, oldValues: old as any, newValues: body });
    res.json(fmt(item));
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.delete("/inventory/:id", requireAuth, async (req: any, res: any) => {
  try {
    const id = Number(req.params.id);
    const [item] = await db.select().from(inventoryTable).where(eq(inventoryTable.id, id)).limit(1);
    await db.delete(inventoryTable).where(eq(inventoryTable.id, id));
    await createAuditLog({ module: "inventory", action: "delete", recordId: id, userId: req.user!.id, userName: req.user!.name, description: `Deleted inventory item ${item?.name}`, oldValues: item as any });
    res.status(204).send();
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

// Inventory movements
router.get("/inventory-movements", requireAuth, async (req: any, res: any) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const [{ total }] = await db.select({ total: count() }).from(inventoryMovementsTable);
    const records = await db.select({ mov: inventoryMovementsTable, item: { name: inventoryTable.name } })
      .from(inventoryMovementsTable).leftJoin(inventoryTable, eq(inventoryMovementsTable.itemId, inventoryTable.id))
      .limit(limit).offset(offset).orderBy(desc(inventoryMovementsTable.createdAt), desc(inventoryMovementsTable.id));
    res.json({ data: records.map(r => ({ ...r.mov, itemName: r.item?.name || "Unknown", quantity: Number(r.mov.quantity), previousStock: Number(r.mov.previousStock), currentStock: Number(r.mov.currentStock) })), pagination: { page, limit, total: Number(total), totalPages: Math.ceil(Number(total) / limit) } });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/inventory-movements", requireAuth, async (req: any, res: any) => {
  try {
    const body = req.body;
    const [item] = await db.select().from(inventoryTable).where(eq(inventoryTable.id, body.itemId)).limit(1);
    if (!item) { res.status(404).json({ error: "Item not found" }); return; }
    const prevStock = Number(item.quantity);
    const qty = Number(body.quantity);
    const newStock = body.type === "OUT" ? prevStock - qty : prevStock + qty;
    await db.update(inventoryTable).set({ quantity: String(newStock), updatedAt: new Date() }).where(eq(inventoryTable.id, body.itemId));
    const [mov] = await db.insert(inventoryMovementsTable).values({ itemId: body.itemId, type: body.type, quantity: String(qty), previousStock: String(prevStock), currentStock: String(newStock), reference: body.reference || null, notes: body.notes || null, createdBy: req.user!.name }).returning();
    await createAuditLog({ module: "inventory", action: "movement", recordId: body.itemId, userId: req.user!.id, userName: req.user!.name, description: `Inventory movement: ${body.type} ${qty} units of ${item.name}`, newValues: body });
    res.status(201).json({ ...mov, itemName: item.name, quantity: Number(mov.quantity), previousStock: Number(mov.previousStock), currentStock: Number(mov.currentStock) });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

export default router;
