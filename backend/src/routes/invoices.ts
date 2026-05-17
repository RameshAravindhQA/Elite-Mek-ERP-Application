import { Router } from "express";
import XLSX from "xlsx";
import { db, invoicesTable, customersTable, projectsTable, settingsTable } from "@workspace/db";
import { desc, eq, count, sql, ilike, or, and } from "@workspace/db/drizzle";
import { requireAuth } from "../middlewares/auth.js";
import { createAuditLog } from "../lib/audit.js";
import { createTaxInvoicePdfFilename, generateTaxInvoicePdf } from "../lib/pdf.js";

const router = Router();

const fmt = (inv: any, customerName?: string, projectName?: string) => ({
  ...inv, subtotal: Number(inv.subtotal), taxAmount: Number(inv.taxAmount), totalAmount: Number(inv.totalAmount), paidAmount: Number(inv.paidAmount),
  customerName: customerName || "Unknown", projectName: projectName || null, items: Array.isArray(inv.items) ? inv.items : []
});

const validStatuses = new Set(["draft", "sent", "partial", "paid", "overdue"]);
class ValidationError extends Error {}

function parseRequiredPositiveInt(value: unknown, field: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new ValidationError(`${field} must be a valid ID`);
  return parsed;
}

function parseDateString(value: unknown, field: string, required = true) {
  if ((value === undefined || value === null || value === "") && !required) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(value).getTime())) {
    throw new ValidationError(`${field} must be a valid date`);
  }
  return value;
}

function parseMoney(value: unknown, field: string, fallback = 0) {
  const parsed = value === undefined || value === null || value === "" ? fallback : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new ValidationError(`${field} must be a valid positive number`);
  return parsed;
}

function normalizeItems(items: unknown) {
  if (!Array.isArray(items) || items.length === 0) throw new ValidationError("At least one line item is required");
  return items.map((item: any, idx: number) => {
    const quantity = parseMoney(item?.quantity, `items[${idx}].quantity`, 0);
    const unitPrice = parseMoney(item?.unitPrice, `items[${idx}].unitPrice`, 0);
    const taxRate = parseMoney(item?.taxRate, `items[${idx}].taxRate`, 0);
    if (!String(item?.description || "").trim()) throw new ValidationError(`items[${idx}].description is required`);
    return {
      id: idx + 1,
      description: String(item.description).trim(),
      hsn: String(item.hsn || item.sac || "").trim(),
      unit: String(item.unit || "Lot").trim(),
      per: String(item.per || item.unit || "Lot").trim(),
      quantity,
      unitPrice,
      taxRate,
      total: quantity * unitPrice * (1 + taxRate / 100),
    };
  });
}

function statusChangeDescription(oldRecord: any, newStatus: string, invoiceNumber: string) {
  if (oldRecord?.status && oldRecord.status !== newStatus) {
    return `Changed invoice ${invoiceNumber} status from ${oldRecord.status} to ${newStatus}`;
  }
  return `Updated invoice ${invoiceNumber}`;
}

router.get("/invoices/stats", requireAuth, async (req, res) => {
  try {
    const [stats] = await db.select({
      totalInvoiced: sql<number>`sum(total_amount)`,
      totalPaid: sql<number>`sum(paid_amount)`,
      totalOverdue: sql<number>`sum(total_amount - paid_amount) filter (where status = 'overdue')`,
      totalPending: sql<number>`sum(total_amount - paid_amount) filter (where status in ('sent', 'partial'))`,
      overdueCount: sql<number>`count(*) filter (where status = 'overdue')`,
    }).from(invoicesTable);
    res.json({ totalInvoiced: Number(stats.totalInvoiced) || 0, totalPaid: Number(stats.totalPaid) || 0, totalOverdue: Number(stats.totalOverdue) || 0, totalPending: Number(stats.totalPending) || 0, overdueCount: Number(stats.overdueCount) });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/invoices", requireAuth, async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const search = req.query.search as string;
    const status = req.query.status as string;
    const offset = (page - 1) * limit;

    const searchTerm = search ? `%${search}%` : undefined;
    let conditions: any[] = [];
    if (searchTerm) {
      conditions.push(or(
        ilike(invoicesTable.invoiceNumber, searchTerm),
        ilike(customersTable.name, searchTerm),
      ));
    }
    if (status) conditions.push(eq(invoicesTable.status, status));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [{ total }] = await db.select({ total: count() })
      .from(invoicesTable)
      .leftJoin(customersTable, eq(invoicesTable.customerId, customersTable.id))
      .where(whereClause);
    const records = await db.select({ inv: invoicesTable, cust: { name: customersTable.name } })
      .from(invoicesTable).leftJoin(customersTable, eq(invoicesTable.customerId, customersTable.id))
      .where(whereClause)
      .limit(limit).offset(offset).orderBy(desc(invoicesTable.createdAt), desc(invoicesTable.id));
    const projects = await db.select({ id: projectsTable.id, name: projectsTable.name }).from(projectsTable);
    const projectNameById = new Map(projects.map(project => [String(project.id), project.name]));
    res.json({ data: records.map(r => fmt(r.inv, r.cust?.name, r.inv.projectId ? projectNameById.get(String(r.inv.projectId)) : undefined)), pagination: { page, limit, total: Number(total), totalPages: Math.ceil(Number(total) / limit) } });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/invoices", requireAuth, async (req, res) => {
  try {
    const body = req.body;
    const customerId = parseRequiredPositiveInt(body.customerId, "customerId");
    const issueDate = parseDateString(body.issueDate, "issueDate") as string;
    const dueDate = parseDateString(body.dueDate, "dueDate") as string;
    const status = validStatuses.has(String(body.status || "draft")) ? String(body.status || "draft") : "draft";
    const invItems = normalizeItems(body.items);
    const subtotal = invItems.reduce((s: number, i: any) => s + (i.quantity * i.unitPrice), 0);
    const taxAmount = invItems.reduce((s: number, i: any) => s + (i.quantity * i.unitPrice * i.taxRate / 100), 0);
    const total = subtotal + taxAmount;
    const invNum = `INV-${Date.now()}`;
    const [inv] = await db.insert(invoicesTable).values({
      customerId,
      projectId: body.projectId ? String(body.projectId) : null,
      invoiceNumber: invNum,
      status,
      issueDate,
      dueDate,
      subtotal: String(subtotal),
      taxAmount: String(taxAmount),
      totalAmount: String(total),
      paidAmount: "0",
      items: invItems,
      scopeDefinition: body.scopeDefinition || null,
      timePeriod: body.timePeriod || null,
      dependencies: Array.isArray(body.dependencies) ? body.dependencies : [],
      termsConditions: body.termsConditions || null,
      additionalContent: Array.isArray(body.additionalContent) ? body.additionalContent : [],
      notes: body.notes || null,
      quotationNumber: body.quotationNumber || null,
      poNumber: body.poNumber || null,
      vendorCode: body.vendorCode || null,
      deliveryNote: body.deliveryNote || null,
      deliveryNoteDate: body.deliveryNoteDate || null,
      supplierRef: body.supplierRef || null,
      otherReferences: body.otherReferences || null,
      destination: body.destination || null,
      termsOfDelivery: body.termsOfDelivery || null,
      modeTermsOfPayment: body.modeTermsOfPayment || null,
    }).returning();
    const [cust] = await db.select().from(customersTable).where(eq(customersTable.id, inv.customerId)).limit(1);
    await createAuditLog({ module: "invoices", action: "create", recordId: inv.id, userId: req.user!.id, userName: req.user!.name, description: `Created invoice ${inv.invoiceNumber}`, newValues: body });
    const [project] = inv.projectId ? await db.select({ name: projectsTable.name }).from(projectsTable).where(eq(projectsTable.id, Number(inv.projectId))).limit(1) : [];
    res.status(201).json(fmt(inv, cust?.name, project?.name));
  } catch (err) {
    if (err instanceof ValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    req.log.error({ err }); res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/invoices/:id", requireAuth, async (req, res) => {
  try {
    const records = await db.select({ inv: invoicesTable, cust: { name: customersTable.name } })
      .from(invoicesTable).leftJoin(customersTable, eq(invoicesTable.customerId, customersTable.id))
      .where(eq(invoicesTable.id, Number(req.params.id))).limit(1);
    if (!records.length) { res.status(404).json({ error: "Not found" }); return; }
    const [project] = records[0].inv.projectId ? await db.select({ name: projectsTable.name }).from(projectsTable).where(eq(projectsTable.id, Number(records[0].inv.projectId))).limit(1) : [];
    res.json(fmt(records[0].inv, records[0].cust?.name, project?.name));
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.put("/invoices/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [old] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id)).limit(1);
    if (!old) { res.status(404).json({ error: "Not found" }); return; }
    const body = req.body;
    const updates: any = { updatedAt: new Date() };
    if (body.customerId !== undefined) updates.customerId = parseRequiredPositiveInt(body.customerId, "customerId");
    if (body.issueDate !== undefined) updates.issueDate = parseDateString(body.issueDate, "issueDate");
    if (body.dueDate !== undefined) updates.dueDate = parseDateString(body.dueDate, "dueDate");
    if (body.status !== undefined) updates.status = validStatuses.has(String(body.status)) ? String(body.status) : old.status;
    if (body.notes !== undefined) updates.notes = body.notes || null;
    ["quotationNumber", "poNumber", "vendorCode", "deliveryNote", "deliveryNoteDate", "supplierRef", "otherReferences", "destination", "termsOfDelivery", "modeTermsOfPayment", "termsConditions"].forEach((field) => {
      if (body[field] !== undefined) updates[field] = body[field] || null;
    });
    if (body.scopeDefinition !== undefined) updates.scopeDefinition = body.scopeDefinition || null;
    if (body.items !== undefined) {
      const invItems = normalizeItems(body.items);
      const subtotal = invItems.reduce((s: number, i: any) => s + (i.quantity * i.unitPrice), 0);
      const taxAmount = invItems.reduce((s: number, i: any) => s + (i.quantity * i.unitPrice * i.taxRate / 100), 0);
      updates.items = invItems;
      updates.subtotal = String(subtotal);
      updates.taxAmount = String(taxAmount);
      updates.totalAmount = String(subtotal + taxAmount);
    }
    if (body.paidAmount !== undefined) updates.paidAmount = String(parseMoney(body.paidAmount, "paidAmount"));
    if (body.projectId !== undefined) updates.projectId = body.projectId ? String(body.projectId) : null;
    const [inv] = await db.update(invoicesTable).set(updates).where(eq(invoicesTable.id, id)).returning();
    const [cust] = await db.select().from(customersTable).where(eq(customersTable.id, inv.customerId)).limit(1);
    await createAuditLog({ module: "invoices", action: "update", recordId: id, userId: req.user!.id, userName: req.user!.name, description: statusChangeDescription(old, inv.status, inv.invoiceNumber), oldValues: old as any, newValues: updates });
    const [project] = inv.projectId ? await db.select({ name: projectsTable.name }).from(projectsTable).where(eq(projectsTable.id, Number(inv.projectId))).limit(1) : [];
    res.json(fmt(inv, cust?.name, project?.name));
  } catch (err) {
    if (err instanceof ValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    req.log.error({ err }); res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/invoices/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [inv] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id)).limit(1);
    await db.delete(invoicesTable).where(eq(invoicesTable.id, id));
    await createAuditLog({ module: "invoices", action: "delete", recordId: id, userId: req.user!.id, userName: req.user!.name, description: `Deleted invoice ${inv?.invoiceNumber}`, oldValues: inv as any });
    res.status(204).send();
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

async function getInvoiceDetail(id: number) {
  const records = await db.select({ inv: invoicesTable, cust: customersTable })
    .from(invoicesTable)
    .leftJoin(customersTable, eq(invoicesTable.customerId, customersTable.id))
    .where(eq(invoicesTable.id, id))
    .limit(1);
  if (!records.length) return null;
  const [project] = records[0].inv.projectId ? await db.select().from(projectsTable).where(eq(projectsTable.id, Number(records[0].inv.projectId))).limit(1) : [];
  const [settings] = await db.select().from(settingsTable).limit(1);
  return { invoice: records[0].inv, customer: records[0].cust, project, settings: settings || {} };
}

router.get("/invoices/:id/pdf", requireAuth, async (req, res) => {
  try {
    const detail = await getInvoiceDetail(Number(req.params.id));
    if (!detail) { res.status(404).json({ error: "Not found" }); return; }
    const pdf = await generateTaxInvoicePdf(detail.invoice, detail.customer, detail.project, detail.settings);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${createTaxInvoicePdfFilename(detail.invoice)}"`);
    res.setHeader("Content-Length", String(pdf.length));
    res.send(pdf);
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/invoices/:id/excel", requireAuth, async (req, res) => {
  try {
    const detail = await getInvoiceDetail(Number(req.params.id));
    if (!detail) { res.status(404).json({ error: "Not found" }); return; }
    const { invoice, customer, project } = detail;
    const items = Array.isArray(invoice.items) ? invoice.items : [];
    const rows = [
      ["TAX INVOICE", invoice.invoiceNumber],
      ["Dated", invoice.issueDate],
      ["Seller", detail.settings.companyName || "M/s ELITEMEK"],
      ["Seller GSTIN", detail.settings.gstNumber || "33INKPS5382C1ZO"],
      ["Buyer", customer?.name || "-"],
      ["Buyer GSTIN", customer?.gstNumber || "-"],
      ["Project", project?.name || "-"],
      ["Quotation Number", invoice.quotationNumber || "-"],
      ["PO Number", invoice.poNumber || "-"],
      ["Mode/Terms of Payment", invoice.modeTermsOfPayment || "-"],
      [],
      ["Sl No.", "Description of Goods", "SAC/HSN", "Quantity", "Rate", "Per", "Amount"],
      ...items.map((item: any, index: number) => [index + 1, item.description, item.hsn || item.sac || "-", `${item.quantity} ${item.unit || "Lot"}`, item.unitPrice, item.per || item.unit || "Lot", Number(item.quantity || 0) * Number(item.unitPrice || 0)]),
      [],
      ["Subtotal", invoice.subtotal],
      ["Output tax CGST @ 9%", Number(invoice.taxAmount || 0) / 2],
      ["Output tax SGST @ 9%", Number(invoice.taxAmount || 0) / 2],
      ["Total", invoice.totalAmount],
      ["Terms", invoice.termsConditions || "Kindly pay the Due Amount Immediate"],
    ];
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, sheet, "Tax Invoice");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${String(invoice.invoiceNumber || "invoice").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.xlsx"`);
    res.send(buffer);
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

export default router;
