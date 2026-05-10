import { date, integer, numeric, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const salaryHikesTable = pgTable("salary_hikes", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull(),
  previousSalary: numeric("previous_salary", { precision: 12, scale: 2 }).notNull(),
  newSalary: numeric("new_salary", { precision: 12, scale: 2 }).notNull(),
  hikeAmount: numeric("hike_amount", { precision: 12, scale: 2 }).notNull(),
  hikePercent: numeric("hike_percent", { precision: 8, scale: 2 }).notNull().default("0"),
  effectiveDate: date("effective_date").notNull(),
  reason: text("reason"),
  approvedBy: varchar("approved_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSalaryHikeSchema = createInsertSchema(salaryHikesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSalaryHike = z.infer<typeof insertSalaryHikeSchema>;
export type SalaryHike = typeof salaryHikesTable.$inferSelect;
