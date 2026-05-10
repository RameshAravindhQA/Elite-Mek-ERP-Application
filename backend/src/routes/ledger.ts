import { Router } from "express";
import { db, ledgerTable, ledgerTransactionTable, projectsTable, customersTable, invoicesTable, settingsTable } from "@workspace/db";
import { desc, eq, count, ilike, or, and } from "drizzle-orm";
import { requireAuth, requirePermission } from "../middlewares/auth.js";
import { createAuditLog } from "../lib/audit.js";

const router = Router();

const fmt = (ledger: any) => ({
  ...ledger,
  openingBalance: Number(ledger.openingBalance),
  closingBalance: Number(ledger.closingBalance),
  currentBalance: Number(ledger.currentBalance),
});

const fmtTransaction = (txn: any) => ({
  ...txn,
  debit: Number(txn.debit),
  credit: Number(txn.credit),
});

router.get("/ledger", requireAuth, requirePermission("ledger", "view"), async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const search = req.query.search as string;
    const accountType = req.query.accountType as string;
    const status = req.query.status as string;
    const offset = (page - 1) * limit;

    let conditions: any[] = [];
    if (search) conditions.push(or(ilike(ledgerTable.accountName, `%${search}%`), ilike(ledgerTable.accountCode, `%${search}%`), ilike(ledgerTable.description, `%${search}%`)));
    if (accountType) conditions.push(eq(ledgerTable.accountType, accountType));
    if (status) conditions.push(eq(ledgerTable.status, status));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [{ total }] = await db.select({ total: count() }).from(ledgerTable).where(whereClause);
    const ledgers = await db.select().from(ledgerTable).where(whereClause).limit(limit).offset(offset).orderBy(desc(ledgerTable.createdAt), desc(ledgerTable.id));
    res.json({ data: ledgers.map(fmt), pagination: { page, limit, total: Number(total), totalPages: Math.ceil(Number(total) / limit) } });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/ledger", requireAuth, requirePermission("ledger", "create"), async (req, res) => {
  try {
    const body = req.body;
    const [ledger] = await db.insert(ledgerTable).values({ ...body, openingBalance: String(body.openingBalance || 0), currentBalance: String(body.openingBalance || 0), closingBalance: String(body.openingBalance || 0) }).returning();
    await createAuditLog({ module: "ledger", action: "create", recordId: ledger.id, userId: req.user!.id, userName: req.user!.name, description: `Created ledger account ${ledger.accountName}`, newValues: body });
    res.status(201).json(fmt(ledger));
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/ledger/:id", requireAuth, requirePermission("ledger", "view"), async (req, res) => {
  try {
    const [ledger] = await db.select().from(ledgerTable).where(eq(ledgerTable.id, Number(req.params.id))).limit(1);
    if (!ledger) { res.status(404).json({ error: "Not found" }); return; }
    res.json(fmt(ledger));
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.put("/ledger/:id", requireAuth, requirePermission("ledger", "edit"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [old] = await db.select().from(ledgerTable).where(eq(ledgerTable.id, id)).limit(1);
    const body = req.body;
    const updates: any = { ...body, updatedAt: new Date() };
    if (body.currentBalance !== undefined) updates.currentBalance = String(body.currentBalance);
    if (body.closingBalance !== undefined) updates.closingBalance = String(body.closingBalance);
    const [ledger] = await db.update(ledgerTable).set(updates).where(eq(ledgerTable.id, id)).returning();
    await createAuditLog({ module: "ledger", action: "update", recordId: id, userId: req.user!.id, userName: req.user!.name, description: `Updated ledger ${ledger.accountName}`, oldValues: old as any, newValues: body });
    res.json(fmt(ledger));
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.delete("/ledger/:id", requireAuth, requirePermission("ledger", "delete"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [ledger] = await db.select().from(ledgerTable).where(eq(ledgerTable.id, id)).limit(1);
    await db.delete(ledgerTable).where(eq(ledgerTable.id, id));
    await createAuditLog({ module: "ledger", action: "delete", recordId: id, userId: req.user!.id, userName: req.user!.name, description: `Deleted ledger ${ledger?.accountName}`, oldValues: ledger as any });
    res.status(204).send();
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/ledger/:id/transactions", requireAuth, requirePermission("ledger", "view"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    
    const [{ total }] = await db.select({ total: count() }).from(ledgerTransactionTable).where(eq(ledgerTransactionTable.ledgerId, id));
    const transactions = await db.select().from(ledgerTransactionTable).where(eq(ledgerTransactionTable.ledgerId, id)).limit(limit).offset(offset).orderBy(ledgerTransactionTable.transactionDate, ledgerTransactionTable.id);
    res.json({ data: transactions.map(fmtTransaction), pagination: { page, limit, total: Number(total), totalPages: Math.ceil(Number(total) / limit) } });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/ledger/:id/transactions", requireAuth, requirePermission("ledger", "edit"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = req.body;
    const [txn] = await db.insert(ledgerTransactionTable).values({ ...body, ledgerId: id, debit: String(body.debit || 0), credit: String(body.credit || 0) }).returning();
    
    // Update current balance
    const debit = Number(body.debit || 0);
    const credit = Number(body.credit || 0);
    const [ledger] = await db.select().from(ledgerTable).where(eq(ledgerTable.id, id)).limit(1);
    if (ledger) {
      const newBalance = Number(ledger.currentBalance) + debit - credit;
      await db.update(ledgerTable).set({ currentBalance: String(newBalance), updatedAt: new Date() }).where(eq(ledgerTable.id, id));
    }
    
    await createAuditLog({ module: "ledger", action: "create", recordId: id, userId: req.user!.id, userName: req.user!.name, description: `Added transaction to ledger`, newValues: body });
    res.status(201).json(fmtTransaction(txn));
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/ledger/projects/:projectId", requireAuth, requirePermission("ledger", "view"), async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    const records = await db.select({ project: projectsTable, customer: { name: customersTable.name, email: customersTable.email, phone: customersTable.phone, address: customersTable.address } })
      .from(projectsTable)
      .leftJoin(customersTable, eq(projectsTable.customerId, customersTable.id))
      .where(eq(projectsTable.id, projectId)).limit(1);

    if (!records.length) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const [projectRecord] = records;
    const invoices = await db.select().from(invoicesTable).where(eq(invoicesTable.projectId, String(projectId))).orderBy(invoicesTable.issueDate);

    const invoiceRows = invoices.map((inv: any) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      status: inv.status,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      totalAmount: Number(inv.totalAmount),
      paidAmount: Number(inv.paidAmount),
      balance: Number(inv.totalAmount) - Number(inv.paidAmount),
      scopeDefinition: inv.scopeDefinition,
      notes: inv.notes,
    }));

    const committedAmount = invoiceRows.reduce((sum, item) => sum + item.totalAmount, 0);
    const paidAmount = invoiceRows.reduce((sum, item) => sum + item.paidAmount, 0);
    const remainingAmount = committedAmount - paidAmount;

    res.json({
      project: {
        id: projectRecord.project.id,
        name: projectRecord.project.name,
        status: projectRecord.project.status,
        customerId: projectRecord.project.customerId,
        budget: Number(projectRecord.project.budget || 0),
        spent: Number(projectRecord.project.spent || 0),
        startDate: projectRecord.project.startDate,
        endDate: projectRecord.project.endDate,
        progress: projectRecord.project.progress,
        scope: projectRecord.project.description,
      },
      customer: projectRecord.customer || {},
      invoices: invoiceRows,
      summary: {
        committedAmount,
        paidAmount,
        remainingAmount,
        invoiceCount: invoiceRows.length,
      },
    });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/ledger/projects/:projectId/pdf", requireAuth, requirePermission("ledger", "view"), async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    const records = await db.select({ project: projectsTable, customer: { name: customersTable.name, email: customersTable.email, phone: customersTable.phone, address: customersTable.address } })
      .from(projectsTable)
      .leftJoin(customersTable, eq(projectsTable.customerId, customersTable.id))
      .where(eq(projectsTable.id, projectId)).limit(1);

    if (!records.length) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const [projectRecord] = records;
    const invoices = await db.select().from(invoicesTable).where(eq(invoicesTable.projectId, String(projectId))).orderBy(invoicesTable.issueDate);
    const invoiceRows = invoices.map((inv: any) => ({
      invoiceNumber: inv.invoiceNumber,
      status: inv.status,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      totalAmount: Number(inv.totalAmount),
      paidAmount: Number(inv.paidAmount),
      balance: Number(inv.totalAmount) - Number(inv.paidAmount),
      scopeDefinition: inv.scopeDefinition,
      notes: inv.notes,
    }));

    const settings = await db.select().from(settingsTable).limit(1).then(rows => rows[0] || {});
    const { createLedgerProjectPdfFilename, generateLedgerProjectPdf } = await import("../lib/pdf.js");
    const pdfBuffer = await generateLedgerProjectPdf(projectRecord.project, projectRecord.customer || {}, { invoices: invoiceRows, summary: { committedAmount: invoiceRows.reduce((sum, item) => sum + item.totalAmount, 0), paidAmount: invoiceRows.reduce((sum, item) => sum + item.paidAmount, 0), remainingAmount: invoiceRows.reduce((sum, item) => sum + item.balance, 0), invoiceCount: invoiceRows.length } }, settings);
    const filename = createLedgerProjectPdfFilename(projectRecord.project);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

export default router;
