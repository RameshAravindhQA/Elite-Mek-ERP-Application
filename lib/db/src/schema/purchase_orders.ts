import { pgTable, serial, text, timestamp, varchar, integer, numeric, date, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const purchaseOrdersTable = pgTable("purchase_orders", {
  id: serial("id").primaryKey(),
  poNumber: varchar("po_number", { length: 50 }).notNull().unique(),
  customerId: integer("vendor_id").notNull(),
  projectId: text("project_id"),
  status: varchar("status", { length: 50 }).notNull().default("draft"),
  orderDate: date("order_date").notNull(),
  deliveryDate: date("delivery_date"),
  totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  items: json("items").notNull().default([]),
  scopeDefinition: text("scope_definition"),
  timePeriod: varchar("time_period", { length: 100 }),
  dependencies: json("dependencies").default([]),
  additionalContent: json("additional_content").default([]),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPurchaseOrderSchema = createInsertSchema(purchaseOrdersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPurchaseOrder = z.infer<typeof insertPurchaseOrderSchema>;
export type PurchaseOrder = typeof purchaseOrdersTable.$inferSelect;
