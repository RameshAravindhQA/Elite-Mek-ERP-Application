import { pgTable, serial, text, timestamp, varchar, integer, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ledgerTable = pgTable("ledger", {
  id: serial("id").primaryKey(),
  accountName: varchar("account_name", { length: 255 }).notNull(),
  accountCode: varchar("account_code", { length: 50 }).unique().notNull(),
  accountType: varchar("account_type", { length: 100 }).notNull(), // Asset, Liability, Equity, Income, Expense
  description: text("description"),
  openingBalance: numeric("opening_balance", { precision: 14, scale: 2 }).default("0").notNull(),
  closingBalance: numeric("closing_balance", { precision: 14, scale: 2 }).default("0").notNull(),
  currentBalance: numeric("current_balance", { precision: 14, scale: 2 }).default("0").notNull(),
  startDate: date("start_date").notNull(),
  status: varchar("status", { length: 50 }).default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const ledgerTransactionTable = pgTable("ledger_transactions", {
  id: serial("id").primaryKey(),
  ledgerId: integer("ledger_id").notNull().references(() => ledgerTable.id, { onDelete: "cascade" }),
  transactionDate: date("transaction_date").notNull(),
  description: text("description").notNull(),
  debit: numeric("debit", { precision: 14, scale: 2 }).default("0"),
  credit: numeric("credit", { precision: 14, scale: 2 }).default("0"),
  referenceNumber: varchar("reference_number", { length: 100 }),
  module: varchar("module", { length: 50 }), // customers, vendors, invoices, expenses, etc.
  moduleId: integer("module_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertLedgerSchema = createInsertSchema(ledgerTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLedger = z.infer<typeof insertLedgerSchema>;
export type Ledger = typeof ledgerTable.$inferSelect;

export const insertLedgerTransactionSchema = createInsertSchema(ledgerTransactionTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLedgerTransaction = z.infer<typeof insertLedgerTransactionSchema>;
export type LedgerTransaction = typeof ledgerTransactionTable.$inferSelect;
