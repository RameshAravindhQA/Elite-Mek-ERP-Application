import { defineConfig } from "drizzle-kit";
import path from "path";

const defaultDatabaseUrl =
  "postgresql://postgres:postgres@localhost:5432/postgres";
const databaseUrl = process.env.DATABASE_URL?.trim() || defaultDatabaseUrl;

if (!process.env.DATABASE_URL) {
  console.warn(
    "DATABASE_URL is not set. Falling back to local Postgres at",
    defaultDatabaseUrl,
  );
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
