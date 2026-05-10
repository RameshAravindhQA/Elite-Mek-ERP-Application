import { Router } from "express";
import { db, employeesTable, projectsTable, revenueTable, expensesTable, invoicesTable, leavesTable, inventoryTable, purchaseOrdersTable, auditLogsTable } from "@workspace/db";
import { count, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

router.get("/dashboard/summary", requireAuth, async (req, res) => {
  try {
    const [empStats] = await db.select({ total: count() }).from(employeesTable);
    const [projStats] = await db.select({ active: sql<number>`count(*) filter (where status = 'active')` }).from(projectsTable);
    const [revStats] = await db.select({ thisMonth: sql<number>`sum(amount) filter (where date_trunc('month', date::date) = date_trunc('month', now()))`, lastMonth: sql<number>`sum(amount) filter (where date_trunc('month', date::date) = date_trunc('month', now() - interval '1 month'))` }).from(revenueTable);
    const [expStats] = await db.select({ thisMonth: sql<number>`sum(amount) filter (where date_trunc('month', date::date) = date_trunc('month', now()))`, lastMonth: sql<number>`sum(amount) filter (where date_trunc('month', date::date) = date_trunc('month', now() - interval '1 month'))` }).from(expensesTable);
    const [invStats] = await db.select({ pending: sql<number>`count(*) filter (where status in ('sent', 'partial', 'overdue'))` }).from(invoicesTable);
    const [leaveStats] = await db.select({ pending: sql<number>`count(*) filter (where status = 'pending')` }).from(leavesTable);
    const [stockStats] = await db.select({ lowStock: sql<number>`count(*) filter (where quantity <= reorder_level)` }).from(inventoryTable);
    const [poStats] = await db.select({ open: sql<number>`count(*) filter (where status in ('draft', 'sent', 'approved'))` }).from(purchaseOrdersTable);

    const rev = Number(revStats.thisMonth) || 0;
    const lastRev = Number(revStats.lastMonth) || 1;
    const exp = Number(expStats.thisMonth) || 0;
    const lastExp = Number(expStats.lastMonth) || 1;

    res.json({
      totalEmployees: Number(empStats.total),
      activeProjects: Number(projStats.active),
      monthlyRevenue: rev,
      monthlyExpenses: exp,
      pendingInvoices: Number(invStats.pending),
      pendingLeaves: Number(leaveStats.pending),
      lowStockItems: Number(stockStats.lowStock),
      openPurchaseOrders: Number(poStats.open),
      revenueGrowth: Math.round(((rev - lastRev) / lastRev) * 100 * 100) / 100,
      expenseGrowth: Math.round(((exp - lastExp) / lastExp) * 100 * 100) / 100,
    });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/dashboard/recent-activity", requireAuth, async (req, res) => {
  try {
    const logs = await db.select().from(auditLogsTable).orderBy(sql`created_at desc`).limit(10);
    res.json({ data: logs.map(l => ({ id: l.id, module: l.module, action: l.action, description: l.description, user: l.userName, createdAt: l.createdAt })) });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/dashboard/monthly-financials", requireAuth, async (req, res) => {
  try {
    const months = Number(req.query.months) || 12;
    const revData = await db.execute(sql`
      SELECT to_char(date_trunc('month', date::date), 'Mon YYYY') as month,
             date_trunc('month', date::date) as month_date,
             sum(amount)::float as revenue
      FROM revenue
      WHERE date::date >= now() - interval '${sql.raw(String(months))} months'
      GROUP BY date_trunc('month', date::date)
      ORDER BY date_trunc('month', date::date)
    `);
    const expData = await db.execute(sql`
      SELECT to_char(date_trunc('month', date::date), 'Mon YYYY') as month,
             date_trunc('month', date::date) as month_date,
             sum(amount)::float as expenses
      FROM expenses
      WHERE date::date >= now() - interval '${sql.raw(String(months))} months'
      GROUP BY date_trunc('month', date::date)
      ORDER BY date_trunc('month', date::date)
    `);

    const revMap = new Map((revData.rows as any[]).map(r => [r.month, Number(r.revenue)]));
    const expMap = new Map((expData.rows as any[]).map(r => [r.month, Number(r.expenses)]));
    const allMonths = new Set([...revMap.keys(), ...expMap.keys()]);
    const data = Array.from(allMonths).sort().map(m => ({
      month: m, revenue: revMap.get(m) || 0, expenses: expMap.get(m) || 0,
      profit: (revMap.get(m) || 0) - (expMap.get(m) || 0)
    }));

    res.json({ data });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

export default router;
