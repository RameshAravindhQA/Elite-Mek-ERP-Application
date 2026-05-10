import { boolean, pgTable, serial, text, timestamp, varchar, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const settingsTable = pgTable("settings", {
  id: serial("id").primaryKey(),
  companyName: varchar("company_name", { length: 255 }).notNull().default("EliteMek ERP"),
  companyLogo: text("company_logo"),
  companyAddress: text("company_address"),
  companyPhone: varchar("company_phone", { length: 50 }),
  companyPhone2: varchar("company_phone2", { length: 50 }),
  companyEmail: varchar("company_email", { length: 255 }),
  companyWebsite: varchar("company_website", { length: 255 }),
  gstNumber: varchar("gst_number", { length: 50 }),
  panNumber: varchar("pan_number", { length: 20 }),
  cinNumber: varchar("cin_number", { length: 50 }),
  bankName: varchar("bank_name", { length: 255 }),
  bankAccount: varchar("bank_account", { length: 50 }),
  bankIfsc: varchar("bank_ifsc", { length: 20 }),
  currency: varchar("currency", { length: 10 }).notNull().default("INR"),
  timezone: varchar("timezone", { length: 100 }).notNull().default("Asia/Kolkata"),
  themeColor: varchar("theme_color", { length: 50 }).notNull().default("#3B82F6"),
  themeMode: varchar("theme_mode", { length: 20 }).notNull().default("light"),
  headerFont: varchar("header_font", { length: 100 }).notNull().default("Inter"),
  bodyFont: varchar("body_font", { length: 100 }).notNull().default("Inter"),
  buttonColor: varchar("button_color", { length: 50 }).notNull().default("#3B82F6"),
  fieldColor: varchar("field_color", { length: 50 }).notNull().default("#F9FAFB"),
  pdfHeaderContent: text("pdf_header_content"),
  pdfFooterContent: text("pdf_footer_content"),
  excelHeaderContent: text("excel_header_content"),
  excelFooterContent: text("excel_footer_content"),
  pdfFormatting: text("pdf_formatting"),
  smtpHost: varchar("smtp_host", { length: 255 }),
  smtpPort: integer("smtp_port"),
  smtpUser: varchar("smtp_user", { length: 255 }),
  smtpFromEmail: varchar("smtp_from_email", { length: 255 }),
  whatsappApiKey: text("whatsapp_api_key"),
  openwaApiUrl: varchar("openwa_api_url", { length: 255 }).notNull().default("http://localhost:2785/api"),
  openwaApiKey: text("openwa_api_key"),
  openwaSessionId: varchar("openwa_session_id", { length: 100 }),
  payslipWhatsappEnabled: boolean("payslip_whatsapp_enabled").notNull().default(false),
  payslipWhatsappMode: varchar("payslip_whatsapp_mode", { length: 50 }).notNull().default("whatsapp-web"),
  payslipWhatsappSenderPhone: varchar("payslip_whatsapp_sender_phone", { length: 50 }),
  payslipMessageTemplate: text("payslip_message_template"),
  payslipDefaultWorkingDays: integer("payslip_default_working_days").notNull().default(26),
  payslipIncludeLeaveDetails: boolean("payslip_include_leave_details").notNull().default(true),
  smsApiKey: text("sms_api_key"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSettingsSchema = createInsertSchema(settingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settingsTable.$inferSelect;
