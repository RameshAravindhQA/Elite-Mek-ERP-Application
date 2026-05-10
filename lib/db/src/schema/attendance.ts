import { pgTable, serial, text, timestamp, varchar, integer, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const attendanceTable = pgTable("attendance", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull(),
  date: date("date").notNull(),
  checkIn: varchar("check_in", { length: 10 }),
  checkOut: varchar("check_out", { length: 10 }),
  status: varchar("status", { length: 50 }).notNull().default("present"),
  hoursWorked: numeric("hours_worked", { precision: 5, scale: 2 }),
  notes: text("notes"),
  markedBy: varchar("marked_by", { length: 255 }),
  excuseReason: text("excuse_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const attendanceCategoriesTable = pgTable("attendance_categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  color: varchar("color", { length: 20 }).notNull().default("#6B7280"),
  shortCode: varchar("short_code", { length: 5 }).notNull(),
  description: text("description"),
  isPaid: integer("is_paid").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAttendanceSchema = createInsertSchema(attendanceTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAttendance = z.infer<typeof insertAttendanceSchema>;
export type Attendance = typeof attendanceTable.$inferSelect;

export const insertAttendanceCategorySchema = createInsertSchema(attendanceCategoriesTable).omit({ id: true, createdAt: true });
export type InsertAttendanceCategory = z.infer<typeof insertAttendanceCategorySchema>;
export type AttendanceCategory = typeof attendanceCategoriesTable.$inferSelect;
