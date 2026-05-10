import { pgTable, serial, text, timestamp, varchar, integer, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const revenueTable = pgTable("revenue", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  source: varchar("source", { length: 100 }).notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  date: date("date").notNull(),
  customerId: integer("customer_id"),
  projectId: integer("project_id"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertRevenueSchema = createInsertSchema(revenueTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRevenue = z.infer<typeof insertRevenueSchema>;
export type Revenue = typeof revenueTable.$inferSelect;
