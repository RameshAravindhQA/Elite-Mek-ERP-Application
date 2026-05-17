import { Router } from "express";
import { db, expensesTable, expenseCategoriesTable, projectsTable } from "@workspace/db";
import { desc, eq, ilike, count, sql, or, and, gte, lte } from "@workspace/db/drizzle";
import { requireAuth } from "../middlewares/auth.js";
import { createAuditLog } from "../lib/audit.js";

const router = Router();

const fmt = (e: any) => ({ ...e, amount: Number(e.amount) });

router.get("/expenses/stats", requireAuth, async (req, res) => {
  try {
    const [stats] = await db.select({
      totalThisMonth: sql<number>`sum(amount) filter (where date_trunc('month', date::date) = date_trunc('month', now()))`,
      totalThisYear: sql<number>`sum(amount) filter (where date_trunc('year', date::date) = date_trunc('year', now()))`,
      pendingApproval: sql<number>`sum(amount) filter (where status = 'pending')`,
    }).from(expensesTable);
    const byCategory = await db.select({ category: expensesTable.category, amount: sql<number>`sum(amount)` }).from(expensesTable).groupBy(expensesTable.category);
    res.json({ totalThisMonth: Number(stats.totalThisMonth) || 0, totalThisYear: Number(stats.totalThisYear) || 0, pendingApproval: Number(stats.pendingApproval) || 0, byCategory: byCategory.map(c => ({ category: c.category, amount: Number(c.amount) })) });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/expenses", requireAuth, async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const search = req.query.search as string;
    const category = req.query.category as string;
    const status = req.query.status as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const offset = (page - 1) * limit;

    let conditions: any[] = [];
    if (search) conditions.push(or(ilike(expensesTable.title, `%${search}%`), ilike(expensesTable.description, `%${search}%`)));
    if (category) conditions.push(eq(expensesTable.category, category));
    if (status) conditions.push(eq(expensesTable.status, status));
    if (startDate) conditions.push(gte(expensesTable.date, startDate));
    if (endDate) conditions.push(lte(expensesTable.date, endDate));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [{ total }] = await db.select({ total: count() }).from(expensesTable).where(whereClause);
    const data = await db.select().from(expensesTable).where(whereClause).limit(limit).offset(offset).orderBy(desc(expensesTable.createdAt), desc(expensesTable.id));
    res.json({ data: data.map(fmt), pagination: { page, limit, total: Number(total), totalPages: Math.ceil(Number(total) / limit) } });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/expenses", requireAuth, async (req, res) => {
  try {
    const body = req.body;
    const [e] = await db.insert(expensesTable).values({ ...body, amount: String(body.amount), submittedBy: req.user!.name }).returning();
    await createAuditLog({ module: "expenses", action: "create", recordId: e.id, userId: req.user!.id, userName: req.user!.name, description: `Created expense: ${e.title}`, newValues: body });
    res.status(201).json(fmt(e));
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/expenses/:id", requireAuth, async (req, res) => {
  try {
    const [e] = await db.select().from(expensesTable).where(eq(expensesTable.id, Number(req.params.id))).limit(1);
    if (!e) { res.status(404).json({ error: "Not found" }); return; }
    res.json(fmt(e));
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.put("/expenses/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [old] = await db.select().from(expensesTable).where(eq(expensesTable.id, id)).limit(1);
    if (!old) { res.status(404).json({ error: "Not found" }); return; }
    const body = req.body;
    const updates: any = { ...body, updatedAt: new Date() };
    if (body.amount !== undefined) updates.amount = String(body.amount);
    const [e] = await db.update(expensesTable).set(updates).where(eq(expensesTable.id, id)).returning();
    await createAuditLog({ module: "expenses", action: "update", recordId: id, userId: req.user!.id, userName: req.user!.name, description: `Updated expense: ${e.title}`, oldValues: old as any, newValues: body });
    res.json(fmt(e));
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.delete("/expenses/:id", requireAuth, async (req, res) => {
  try {
    const [e] = await db.select().from(expensesTable).where(eq(expensesTable.id, Number(req.params.id))).limit(1);
    if (!e) { res.status(404).json({ error: "Not found" }); return; }
    await db.delete(expensesTable).where(eq(expensesTable.id, Number(req.params.id)));
    await createAuditLog({ module: "expenses", action: "delete", recordId: Number(req.params.id), userId: req.user!.id, userName: req.user!.name, description: `Deleted expense: ${e.title}`, oldValues: e as any });
    res.status(204).send();
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

// Expense categories
router.get("/expense-categories", requireAuth, async (req, res) => {
  try {
    const all = await db.select().from(expenseCategoriesTable).orderBy(expenseCategoriesTable.name);
    const parents = all.filter(c => !c.parentId);
    const children = all.filter(c => c.parentId);
    const tree = parents.map(p => ({ ...p, subCategories: children.filter(c => c.parentId === p.id) }));
    res.json({ data: all, tree });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/expense-categories", requireAuth, async (req, res) => {
  try {
    const [cat] = await db.insert(expenseCategoriesTable).values(req.body).returning();
    await createAuditLog({ module: "expense_categories", action: "create", recordId: cat.id, userId: req.user!.id, userName: req.user!.name, description: `Created expense category ${cat.name}`, newValues: req.body });
    res.status(201).json(cat);
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.put("/expense-categories/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [old] = await db.select().from(expenseCategoriesTable).where(eq(expenseCategoriesTable.id, id)).limit(1);
    if (!old) { res.status(404).json({ error: "Not found" }); return; }
    const [cat] = await db.update(expenseCategoriesTable).set(req.body).where(eq(expenseCategoriesTable.id, id)).returning();
    await createAuditLog({ module: "expense_categories", action: "update", recordId: id, userId: req.user!.id, userName: req.user!.name, description: `Updated expense category ${cat.name}`, oldValues: old as any, newValues: req.body });
    res.json(cat);
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.delete("/expense-categories/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [cat] = await db.select().from(expenseCategoriesTable).where(eq(expenseCategoriesTable.id, id)).limit(1);
    if (!cat) { res.status(404).json({ error: "Not found" }); return; }
    await db.delete(expenseCategoriesTable).where(eq(expenseCategoriesTable.id, id));
    await createAuditLog({ module: "expense_categories", action: "delete", recordId: id, userId: req.user!.id, userName: req.user!.name, description: `Deleted expense category ${cat.name}`, oldValues: cat as any });
    res.status(204).send();
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

export default router;
