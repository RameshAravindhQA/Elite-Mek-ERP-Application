import { pgTable, serial, text, timestamp, varchar, integer, numeric, json, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const payrollTable = pgTable("payroll", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull(),
  month: varchar("month", { length: 7 }).notNull(), // YYYY-MM
  basicSalary: numeric("basic_salary", { precision: 12, scale: 2 }).notNull(),
  hra: numeric("hra", { precision: 12, scale: 2 }).notNull().default("0"),
  allowances: numeric("allowances", { precision: 12, scale: 2 }).notNull().default("0"),
  deductions: numeric("deductions", { precision: 12, scale: 2 }).notNull().default("0"),
  overtimeHours: numeric("overtime_hours", { precision: 10, scale: 2 }).notNull().default("0"),
  overtimeAmount: numeric("overtime_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  advanceDeduction: numeric("advance_deduction", { precision: 12, scale: 2 }).notNull().default("0"),
  bonusAmount: numeric("bonus_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  otherPayments: numeric("other_payments", { precision: 12, scale: 2 }).notNull().default("0"),
  adjustmentSummary: json("adjustment_summary").default([]),
  pf: numeric("pf", { precision: 12, scale: 2 }).notNull().default("0"),
  esic: numeric("esic", { precision: 12, scale: 2 }).notNull().default("0"),
  netSalary: numeric("net_salary", { precision: 12, scale: 2 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  presentDays: integer("present_days").notNull().default(0),
  absentDays: integer("absent_days").notNull().default(0),
  totalWorkingDays: integer("total_working_days").notNull().default(26),
  formula: varchar("formula", { length: 50 }).default("basic"),
  excusedAbsences: json("excused_absences").default([]),
  excuseNotes: text("excuse_notes"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPayrollSchema = createInsertSchema(payrollTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPayroll = z.infer<typeof insertPayrollSchema>;
export type Payroll = typeof payrollTable.$inferSelect;

export const overtimeTable = pgTable("overtime_records", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull(),
  projectId: integer("project_id"),
  workDate: date("work_date").notNull(),
  hours: numeric("hours", { precision: 10, scale: 2 }).notNull(),
  basicSalary: numeric("basic_salary", { precision: 12, scale: 2 }).notNull().default("0"),
  hourlyRate: numeric("hourly_rate", { precision: 12, scale: 2 }).notNull().default("0"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
  proofUrl: text("proof_url"),
  notes: text("notes"),
  status: varchar("status", { length: 50 }).notNull().default("approved"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const advancePaymentsTable = pgTable("advance_payments", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull(),
  paymentDate: date("payment_date").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  deductionMonth: varchar("deduction_month", { length: 7 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  paymentMode: varchar("payment_mode", { length: 50 }),
  referenceNo: varchar("reference_no", { length: 100 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const payrollAdjustmentsTable = pgTable("payroll_adjustments", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull(),
  month: varchar("month", { length: 7 }).notNull(),
  type: varchar("type", { length: 50 }).notNull().default("bonus"),
  label: varchar("label", { length: 255 }).notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertOvertimeSchema = createInsertSchema(overtimeTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAdvancePaymentSchema = createInsertSchema(advancePaymentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPayrollAdjustmentSchema = createInsertSchema(payrollAdjustmentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type OvertimeRecord = typeof overtimeTable.$inferSelect;
export type AdvancePayment = typeof advancePaymentsTable.$inferSelect;
export type PayrollAdjustment = typeof payrollAdjustmentsTable.$inferSelect;
