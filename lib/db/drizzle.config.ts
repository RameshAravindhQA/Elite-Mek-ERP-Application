import { defineConfig } from "drizzle-kit";
const defaultDatabaseUrl =
  "postgresql://postgres:postgres@localhost:5432/postgres";
const databaseUrl = process.env.DATABASE_URL?.trim();
const effectiveDatabaseUrl = databaseUrl || defaultDatabaseUrl;
const parsedDatabaseUrl = new URL(effectiveDatabaseUrl);

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

export default defineConfig({
  schema: [
    "./src/schema/activity_logs.ts",
    "./src/schema/audit_logs.ts",
    "./src/schema/attendance.ts",
    "./src/schema/customers.ts",
    "./src/schema/documents.ts",
    "./src/schema/employees.ts",
    "./src/schema/expenses.ts",
    "./src/schema/inventory.ts",
    "./src/schema/inventory_movements.ts",
    "./src/schema/invoices.ts",
    "./src/schema/leaves.ts",
    "./src/schema/ledger.ts",
    "./src/schema/notifications.ts",
    "./src/schema/payroll.ts",
    "./src/schema/projects.ts",
    "./src/schema/purchase_orders.ts",
    "./src/schema/reminders.ts",
    "./src/schema/revenue.ts",
    "./src/schema/roles.ts",
    "./src/schema/salary_hikes.ts",
    "./src/schema/settings.ts",
    "./src/schema/users.ts",
    "./src/schema/vendors.ts",
    "./src/schema/work_allocations.ts",
  ],
  dialect: "postgresql",
  dbCredentials: {
    host: parsedDatabaseUrl.hostname,
    port: parsedDatabaseUrl.port ? Number(parsedDatabaseUrl.port) : 5432,
    user: decodeURIComponent(parsedDatabaseUrl.username),
    password: decodeURIComponent(parsedDatabaseUrl.password),
    database: parsedDatabaseUrl.pathname.replace(/^\//, ""),
    ssl: parsedDatabaseUrl.searchParams.has("sslmode") ? "require" : false,
  },
});
