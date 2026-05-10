import pg from 'pg';
const { Pool } = pg;
const env = process.env.DATABASE_URL;
const databaseUrl = env ? env.trim() : 'postgresql://postgres:postgres@localhost:5432/postgres';
const pool = new Pool({ connectionString: databaseUrl });
try {
  const res = await pool.query('SELECT 1 AS ok');
  console.log('DB OK', res.rows[0]);
} catch (err) {
  console.error('DB ERROR', err.message || err);
  process.exit(1);
} finally {
  await pool.end();
}
