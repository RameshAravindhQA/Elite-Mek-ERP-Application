import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

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

export * from "./schema";
