import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";

const { Pool } = pg;

const defaultDatabaseUrl =
  "postgresql://postgres:postgres@localhost:5432/postgres";
const databaseUrl = process.env.DATABASE_URL?.trim();
const effectiveDatabaseUrl = databaseUrl || defaultDatabaseUrl;

if (!databaseUrl && process.env.VERCEL === "1") {
  throw new Error(
    "DATABASE_URL is required in Vercel deployment. Set DATABASE_URL in your Vercel environment variables.",
  );
}

if (!databaseUrl) {
  console.warn(
    "DATABASE_URL is not set. Falling back to local Postgres at",
    defaultDatabaseUrl,
  );
}

const useSsl =
  effectiveDatabaseUrl.includes("supabase.com") ||
  effectiveDatabaseUrl.includes("sslmode=") ||
  Boolean(process.env.PGSSLMODE?.trim());
const poolConfig: pg.PoolConfig = {
  connectionString: effectiveDatabaseUrl,
  max: process.env.VERCEL === "1" ? 1 : 10,
  allowExitOnIdle: process.env.VERCEL === "1",
  idleTimeoutMillis: 10000,
  ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
};

export const pool = new Pool(poolConfig);
export const db = drizzle(pool, { schema });

export * from "./schema/users.js";
export * from "./schema/employees.js";
export * from "./schema/attendance.js";
export * from "./schema/payroll.js";
export * from "./schema/leaves.js";
export * from "./schema/customers.js";
export * from "./schema/vendors.js";
export * from "./schema/projects.js";
export * from "./schema/purchase_orders.js";
export * from "./schema/inventory.js";
export * from "./schema/inventory_movements.js";
export * from "./schema/expenses.js";
export * from "./schema/revenue.js";
export * from "./schema/invoices.js";
export * from "./schema/documents.js";
export * from "./schema/notifications.js";
export * from "./schema/audit_logs.js";
export * from "./schema/roles.js";
export * from "./schema/settings.js";
export * from "./schema/reminders.js";
export * from "./schema/ledger.js";
export * from "./schema/salary_hikes.js";
export * from "./schema/work_allocations.js";
