import { pgTable, serial, text, timestamp, varchar, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const inventoryMovementsTable = pgTable("inventory_movements", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull(),
  type: varchar("type", { length: 50 }).notNull(), // IN, OUT, TRANSFER, ADJUSTMENT
  quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull(),
  previousStock: numeric("previous_stock", { precision: 12, scale: 2 }).notNull(),
  currentStock: numeric("current_stock", { precision: 12, scale: 2 }).notNull(),
  reference: varchar("reference", { length: 100 }),
  notes: text("notes"),
  createdBy: varchar("created_by", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertInventoryMovementSchema = createInsertSchema(inventoryMovementsTable).omit({ id: true, createdAt: true });
export type InsertInventoryMovement = z.infer<typeof insertInventoryMovementSchema>;
export type InventoryMovement = typeof inventoryMovementsTable.$inferSelect;
