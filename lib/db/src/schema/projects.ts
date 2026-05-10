import { pgTable, serial, text, timestamp, varchar, integer, numeric, date, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const projectsTable = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  customerId: integer("customer_id"),
  status: varchar("status", { length: 50 }).notNull().default("active"),
  priority: varchar("priority", { length: 50 }).notNull().default("medium"),
  budget: numeric("budget", { precision: 14, scale: 2 }),
  spent: numeric("spent", { precision: 14, scale: 2 }).notNull().default("0"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  progress: integer("progress").notNull().default(0),
  managerId: integer("manager_id"),
  imageUrl: text("image_url"),
  pendingWorks: json("pending_works").default([]),
  dependencies: json("dependencies").default([]),
  followUps: json("follow_ups").default([]),
  tags: json("tags").default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const projectTasksTable = pgTable("project_tasks", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  priority: varchar("priority", { length: 50 }).notNull().default("medium"),
  assignedTo: integer("assigned_to"),
  dueDate: date("due_date"),
  completedAt: timestamp("completed_at"),
  dependencies: json("dependencies").default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertProjectSchema = createInsertSchema(projectsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;

export const insertProjectTaskSchema = createInsertSchema(projectTasksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProjectTask = z.infer<typeof insertProjectTaskSchema>;
export type ProjectTask = typeof projectTasksTable.$inferSelect;
