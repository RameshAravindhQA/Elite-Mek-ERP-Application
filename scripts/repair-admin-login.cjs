const crypto = require("crypto");
const { Client } = require("pg");

const client = new Client({ connectionString: process.env.DATABASE_URL });

function hashPassword(password) {
  return crypto.createHash("sha256").update(`${password}erp_salt_2024`).digest("hex");
}

(async () => {
  await client.connect();
  await client.query(`
    create table if not exists users (
      id serial primary key,
      name varchar(255) not null,
      email varchar(255) not null unique,
      password_hash text not null,
      role varchar(100) not null default 'user',
      avatar text,
      phone varchar(50),
      created_at timestamp not null default now(),
      updated_at timestamp not null default now()
    )
  `);

  const passwordHash = hashPassword("admin123");
  await client.query(
    `
      insert into users (name, email, password_hash, role)
      values ($1, $2, $3, $4)
      on conflict (email) do update
      set name = excluded.name,
          password_hash = excluded.password_hash,
          role = excluded.role,
          updated_at = now()
    `,
    ["Administrator", "admin@elitemek.com", passwordHash, "admin"],
  );

  const result = await client.query(
    "select id, name, email, role, created_at, updated_at from users where email = $1",
    ["admin@elitemek.com"],
  );
  console.table(result.rows);
  await client.end();
})().catch(async (error) => {
  console.error(error);
  try {
    await client.end();
  } catch {}
  process.exit(1);
});
