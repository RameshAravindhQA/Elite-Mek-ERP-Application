import { pgTable, serial, timestamp, varchar, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const workAllocationsTable = pgTable("work_allocations", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull(),
  projectId: integer("project_id").notNull(),
  employeeId: integer("employee_id").notNull(),
  status: varchar("status", { length: 50 }).notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, table => ({
  employeeProjectUnique: uniqueIndex("work_allocations_employee_project_unique").on(table.projectId, table.employeeId),
}));

export const insertWorkAllocationSchema = createInsertSchema(workAllocationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertWorkAllocation = z.infer<typeof insertWorkAllocationSchema>;
export type WorkAllocation = typeof workAllocationsTable.$inferSelect;
