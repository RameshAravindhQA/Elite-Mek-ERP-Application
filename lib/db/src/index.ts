import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index";

const { Pool } = pg;

const defaultDatabaseUrl =
  "postgresql://postgres:postgres@localhost:5432/postgres";
const databaseUrl = process.env.DATABASE_URL?.trim() || defaultDatabaseUrl;

if (!process.env.DATABASE_URL) {
  console.warn(
    "DATABASE_URL is not set. Falling back to local Postgres at",
    defaultDatabaseUrl,
  );
}

export const pool = new Pool({ connectionString: databaseUrl });
export const db = drizzle(pool, { schema });

export * from "./schema/users";
export * from "./schema/employees";
export * from "./schema/attendance";
export * from "./schema/payroll";
export * from "./schema/leaves";
export * from "./schema/customers";
export * from "./schema/vendors";
export * from "./schema/projects";
export * from "./schema/purchase_orders";
export * from "./schema/inventory";
export * from "./schema/inventory_movements";
export * from "./schema/expenses";
export * from "./schema/revenue";
export * from "./schema/invoices";
export * from "./schema/documents";
export * from "./schema/notifications";
export * from "./schema/audit_logs";
export * from "./schema/roles";
export * from "./schema/settings";
export * from "./schema/reminders";
export * from "./schema/ledger";
export * from "./schema/salary_hikes";
export * from "./schema/work_allocations";
