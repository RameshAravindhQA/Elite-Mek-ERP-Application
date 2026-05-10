import { Router } from "express";
import nodemailer from "nodemailer";
import { db, purchaseOrdersTable, customersTable, projectsTable, settingsTable } from "@workspace/db";
import { desc, eq, count, ilike, or, and } from "drizzle-orm";
import { requireAuth, requirePermission } from "../middlewares/auth.js";
import { createAuditLog } from "../lib/audit.js";
import { createPurchaseOrderPdfFilename, generatePurchaseOrderPdf } from "../lib/pdf.js";

const router = Router();

const fmt = (po: any, customerName?: string, projectName?: string) => ({
  ...po, totalAmount: Number(po.totalAmount), customerName: customerName || "Unknown", projectName: projectName || null,
  items: Array.isArray(po.items) ? po.items : []
});

const validStatuses = new Set(["draft", "pending", "approved", "sent", "delivered", "cancelled"]);
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
    if (!String(item?.itemName || "").trim()) throw new ValidationError(`items[${idx}].itemName is required`);
    return {
      id: idx + 1,
      itemName: String(item.itemName).trim(),
      quantity,
      unitPrice,
      total: quantity * unitPrice,
    };
  });
}

function statusChangeDescription(oldRecord: any, newStatus: string, poNumber: string) {
  if (oldRecord?.status && oldRecord.status !== newStatus) {
    return `Changed PO ${poNumber} status from ${oldRecord.status} to ${newStatus}`;
  }
  return `Updated PO ${poNumber}`;
}

router.get("/purchase-orders", requireAuth, requirePermission("purchase_orders", "view"), async (req, res) => {
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
        ilike(purchaseOrdersTable.poNumber, searchTerm),
        ilike(purchaseOrdersTable.notes, searchTerm),
        ilike(customersTable.name, searchTerm),
      ));
    }
    if (status) conditions.push(eq(purchaseOrdersTable.status, status));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [{ total }] = await db.select({ total: count() })
      .from(purchaseOrdersTable)
      .leftJoin(customersTable, eq(purchaseOrdersTable.customerId, customersTable.id))
      .where(whereClause);
    const records = await db.select({ po: purchaseOrdersTable, customer: { name: customersTable.name } })
      .from(purchaseOrdersTable).leftJoin(customersTable, eq(purchaseOrdersTable.customerId, customersTable.id))
      .where(whereClause)
      .limit(limit).offset(offset).orderBy(desc(purchaseOrdersTable.createdAt), desc(purchaseOrdersTable.id));
    const projects = await db.select({ id: projectsTable.id, name: projectsTable.name }).from(projectsTable);
    const projectNameById = new Map(projects.map(project => [String(project.id), project.name]));
    res.json({ data: records.map(r => fmt(r.po, r.customer?.name, r.po.projectId ? projectNameById.get(String(r.po.projectId)) : undefined)), pagination: { page, limit, total: Number(total), totalPages: Math.ceil(Number(total) / limit) } });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/purchase-orders", requireAuth, requirePermission("purchase_orders", "create"), async (req, res) => {
  try {
    const body = req.body;
    const customerId = parseRequiredPositiveInt(body.customerId, "customerId");
    const orderDate = parseDateString(body.orderDate, "orderDate") as string;
    const deliveryDate = parseDateString(body.deliveryDate, "deliveryDate", false) || undefined;
    const status = validStatuses.has(String(body.status || "draft")) ? String(body.status || "draft") : "draft";
    const poItems = normalizeItems(body.items);
    const total = poItems.reduce((s: number, i: any) => s + (i.quantity * i.unitPrice), 0);
    const poNum = `PO-${Date.now()}`;
    const [po] = await db.insert(purchaseOrdersTable).values({
      customerId,
      projectId: body.projectId || null,
      poNumber: poNum,
      status,
      orderDate,
      deliveryDate,
      totalAmount: String(total),
      items: poItems,
      scopeDefinition: body.scopeDefinition || null,
      timePeriod: body.timePeriod || null,
      dependencies: Array.isArray(body.dependencies) ? body.dependencies : [],
      additionalContent: Array.isArray(body.additionalContent) ? body.additionalContent : [],
      notes: body.notes || null,
    }).returning();
    const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, po.customerId)).limit(1);
    await createAuditLog({ module: "purchase_orders", action: "create", recordId: po.id, userId: req.user!.id, userName: req.user!.name, description: `Created PO ${po.poNumber}`, newValues: body });
    const [project] = po.projectId ? await db.select({ name: projectsTable.name }).from(projectsTable).where(eq(projectsTable.id, Number(po.projectId))).limit(1) : [];
    res.status(201).json(fmt(po, customer?.name, project?.name));
  } catch (err) {
    if (err instanceof ValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    req.log.error({ err }); res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/purchase-orders/:id", requireAuth, requirePermission("purchase_orders", "view"), async (req, res) => {
  try {
    const records = await db.select({ po: purchaseOrdersTable, customer: { name: customersTable.name, email: customersTable.email, phone: customersTable.phone, address: customersTable.address } })
      .from(purchaseOrdersTable).leftJoin(customersTable, eq(purchaseOrdersTable.customerId, customersTable.id))
      .where(eq(purchaseOrdersTable.id, Number(req.params.id))).limit(1);
    if (!records.length) { res.status(404).json({ error: "Not found" }); return; }
    const [project] = records[0].po.projectId ? await db.select({ name: projectsTable.name }).from(projectsTable).where(eq(projectsTable.id, Number(records[0].po.projectId))).limit(1) : [];
    res.json(fmt(records[0].po, records[0].customer?.name, project?.name));
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

const loadSettings = async () => {
  const [settings] = await db.select().from(settingsTable).limit(1);
  return settings || {};
};

router.get("/purchase-orders/:id/pdf", requireAuth, requirePermission("purchase_orders", "view"), async (req, res) => {
  try {
    const records = await db.select({ po: purchaseOrdersTable, customer: customersTable })
      .from(purchaseOrdersTable).leftJoin(customersTable, eq(purchaseOrdersTable.customerId, customersTable.id))
      .where(eq(purchaseOrdersTable.id, Number(req.params.id))).limit(1);
    if (!records.length) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const settings = await loadSettings();
    const customer = records[0].customer || {};
    const [project] = records[0].po.projectId ? await db.select({ name: projectsTable.name }).from(projectsTable).where(eq(projectsTable.id, Number(records[0].po.projectId))).limit(1) : [];
    const pdfBuffer = await generatePurchaseOrderPdf({ ...records[0].po, projectName: project?.name }, customer, settings);
    const filename = createPurchaseOrderPdfFilename(records[0].po);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (err) {
    req.log.error({ err });
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/purchase-orders/:id/email", requireAuth, requirePermission("purchase_orders", "view"), async (req, res) => {
  try {
    const { to, subject, message } = req.body;
    if (!to) {
      res.status(400).json({ error: "Recipient email is required" });
      return;
    }
    const records = await db.select({ po: purchaseOrdersTable, customer: { name: customersTable.name, email: customersTable.email } })
      .from(purchaseOrdersTable).leftJoin(customersTable, eq(purchaseOrdersTable.customerId, customersTable.id))
      .where(eq(purchaseOrdersTable.id, Number(req.params.id))).limit(1);
    if (!records.length) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const settings = await loadSettings();
    if (!settings.smtpHost || !settings.smtpPort || !settings.smtpFromEmail) {
      res.status(400).json({ error: "SMTP settings are not configured" });
      return;
    }
    const customer = records[0].customer || {};
    const [project] = records[0].po.projectId ? await db.select({ name: projectsTable.name }).from(projectsTable).where(eq(projectsTable.id, Number(records[0].po.projectId))).limit(1) : [];
    const pdfBuffer = await generatePurchaseOrderPdf({ ...records[0].po, projectName: project?.name }, customer, settings);
    const transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: Number(settings.smtpPort) || 587,
      secure: Number(settings.smtpPort) === 465,
      auth: settings.smtpUser && process.env.SMTP_PASSWORD ? { user: settings.smtpUser, pass: process.env.SMTP_PASSWORD } : undefined,
    });
    await transporter.sendMail({
      from: settings.smtpFromEmail,
      to,
      subject: subject || `Purchase Order ${records[0].po.poNumber}`,
      text: message || `Please find the attached Purchase Order ${records[0].po.poNumber}.`,
      html: `<pre style="font-family: system-ui, sans-serif;">${message || `Please find the attached Purchase Order ${records[0].po.poNumber}.`}</pre>`,
      attachments: [
        {
          filename: createPurchaseOrderPdfFilename(records[0].po),
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err });
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/purchase-orders/:id", requireAuth, requirePermission("purchase_orders", "edit"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [old] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id)).limit(1);
    if (!old) { res.status(404).json({ error: "Not found" }); return; }
    const body = req.body || {};
    const updates: any = { updatedAt: new Date() };
    if (body.customerId !== undefined) updates.customerId = parseRequiredPositiveInt(body.customerId, "customerId");
    if (body.projectId !== undefined) updates.projectId = body.projectId ? String(body.projectId) : null;
    if (body.orderDate !== undefined) updates.orderDate = parseDateString(body.orderDate, "orderDate");
    if (body.deliveryDate !== undefined) updates.deliveryDate = parseDateString(body.deliveryDate, "deliveryDate", false);
    if (body.status !== undefined) updates.status = validStatuses.has(String(body.status)) ? String(body.status) : old.status;
    if (body.notes !== undefined) updates.notes = body.notes || null;
    if (body.scopeDefinition !== undefined) updates.scopeDefinition = body.scopeDefinition || null;
    if (body.items !== undefined) {
      const poItems = normalizeItems(body.items);
      updates.items = poItems;
      updates.totalAmount = String(poItems.reduce((s: number, i: any) => s + (i.quantity * i.unitPrice), 0));
    }
    const [po] = await db.update(purchaseOrdersTable).set(updates).where(eq(purchaseOrdersTable.id, id)).returning();
    const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, po.customerId)).limit(1);
    await createAuditLog({ module: "purchase_orders", action: "update", recordId: id, userId: req.user!.id, userName: req.user!.name, description: statusChangeDescription(old, po.status, po.poNumber), oldValues: old as any, newValues: updates });
    const [project] = po.projectId ? await db.select({ name: projectsTable.name }).from(projectsTable).where(eq(projectsTable.id, Number(po.projectId))).limit(1) : [];
    res.json(fmt(po, customer?.name, project?.name));
  } catch (err) {
    if (err instanceof ValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    req.log.error({ err }); res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/purchase-orders/:id", requireAuth, requirePermission("purchase_orders", "delete"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [po] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id)).limit(1);
    await db.delete(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id));
    await createAuditLog({ module: "purchase_orders", action: "delete", recordId: id, userId: req.user!.id, userName: req.user!.name, description: `Deleted PO ${po?.poNumber}`, oldValues: po as any });
    res.status(204).send();
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

export default router;
