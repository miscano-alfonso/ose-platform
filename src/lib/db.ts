import "server-only";
import { Pool, type PoolClient } from "pg";

// One pool per server instance. On Vercel use Neon's *pooled* connection string.
const g = globalThis as unknown as { __osePool?: Pool };
function pool(): Pool {
  if (!g.__osePool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url) || url.includes("host=/");
    g.__osePool = new Pool({ connectionString: url, ssl: local ? false : { rejectUnauthorized: true }, max: 5 });
  }
  return g.__osePool;
}

/**
 * Runs queries for one school inside a transaction with row-level security switched on:
 * the session becomes app_user and app.school_id is set, so every query only sees that
 * school's rows even if a query forgets to filter.
 */
export async function withSchool<T>(fn: (q: <R = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<R[]>) => Promise<T>): Promise<T> {
  const client: PoolClient = await pool().connect();
  try {
    await client.query("begin");
    const slug = process.env.SCHOOL_SLUG || "ohsoed";
    const s = await client.query("select id from schools where slug = $1", [slug]);
    if (!s.rows[0]) throw new Error(`school "${slug}" not found`);
    await client.query("set local role app_user");
    await client.query("select set_config('app.school_id', $1, true)", [s.rows[0].id]);
    const q = async <R,>(sql: string, params: unknown[] = []) => (await client.query(sql, params)).rows as R[];
    const out = await fn(q);
    await client.query("commit");
    return out;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
