import { pgTable, serial, text, timestamp, varchar, numeric, date, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const employeesTable = pgTable("employees", {
  id: serial("id").primaryKey(),
  employeeId: varchar("employee_id", { length: 50 }).notNull().unique(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  phone: varchar("phone", { length: 50 }),
  department: varchar("department", { length: 100 }).notNull(),
  designation: varchar("designation", { length: 100 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("active"),
  salary: numeric("salary", { precision: 12, scale: 2 }).notNull(),
  joiningDate: date("joining_date").notNull(),
  imageUrl: text("image_url"),
  panNumber: varchar("pan_number", { length: 20 }),
  aadharNumber: varchar("aadhar_number", { length: 20 }),
  bankAccount: varchar("bank_account", { length: 30 }),
  bankName: varchar("bank_name", { length: 100 }),
  ifscCode: varchar("ifsc_code", { length: 20 }),
  address: text("address"),
  emergencyContact: varchar("emergency_contact", { length: 100 }),
  salaryFormula: varchar("salary_formula", { length: 50 }).default("basic"),
  basicPercent: numeric("basic_percent", { precision: 5, scale: 2 }).default("60"),
  hraPercent: numeric("hra_percent", { precision: 5, scale: 2 }).default("20"),
  allowancesPercent: numeric("allowances_percent", { precision: 5, scale: 2 }).default("20"),
  pfEnabled: boolean("pf_enabled").default(false),
  esicEnabled: boolean("esic_enabled").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertEmployeeSchema = createInsertSchema(employeesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employeesTable.$inferSelect;
