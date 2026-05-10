import { pgTable, serial, text, timestamp, varchar, integer, numeric, date, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const invoicesTable = pgTable("invoices", {
  id: serial("id").primaryKey(),
  invoiceNumber: varchar("invoice_number", { length: 50 }).notNull().unique(),
  quotationNumber: varchar("quotation_number", { length: 100 }),
  poNumber: varchar("po_number", { length: 255 }),
  vendorCode: varchar("vendor_code", { length: 100 }),
  deliveryNote: varchar("delivery_note", { length: 255 }),
  deliveryNoteDate: date("delivery_note_date"),
  supplierRef: varchar("supplier_ref", { length: 255 }),
  otherReferences: text("other_references"),
  destination: varchar("destination", { length: 255 }),
  termsOfDelivery: varchar("terms_of_delivery", { length: 255 }),
  modeTermsOfPayment: varchar("mode_terms_of_payment", { length: 255 }),
  customerId: integer("customer_id").notNull(),
  projectId: text("project_id"),
  status: varchar("status", { length: 50 }).notNull().default("draft"),
  issueDate: date("issue_date").notNull(),
  dueDate: date("due_date").notNull(),
  subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull().default("0"),
  taxAmount: numeric("tax_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  paidAmount: numeric("paid_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  items: json("items").notNull().default([]),
  scopeDefinition: text("scope_definition"),
  timePeriod: varchar("time_period", { length: 100 }),
  dependencies: json("dependencies").default([]),
  termsConditions: text("terms_conditions"),
  additionalContent: json("additional_content").default([]),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertInvoiceSchema = createInsertSchema(invoicesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoicesTable.$inferSelect;
