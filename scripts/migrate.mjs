// Applies the database files in db/ once each, in order, and records them in _migrations.
// Runs automatically before every Vercel build. Without DATABASE_URL it does nothing.
// Rule: never edit a file that has already been applied; add a new numbered file instead.
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("migrate: DATABASE_URL not set, skipping");
  process.exit(0);
}

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "db");
// test_db.sql is the test suite: it runs only against a throwaway database, never a real one.
const files = readdirSync(dir).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();

const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url) || url.includes("host=/");
const client = new pg.Client({ connectionString: url, ssl: local ? false : { rejectUnauthorized: true } });
await client.connect();
try {
  await client.query("create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())");
  const done = new Set((await client.query("select name from _migrations")).rows.map((r) => r.name));
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = readFileSync(join(dir, f), "utf8");
    console.log(`migrate: applying ${f}`);
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into _migrations (name) values ($1)", [f]);
      await client.query("commit");
    } catch (e) {
      await client.query("rollback");
      throw new Error(`migrate: ${f} failed: ${e.message}`);
    }
  }
  console.log("migrate: up to date");
} finally {
  await client.end();
}
