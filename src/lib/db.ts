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
    const slug = (await adminSchool()) || process.env.SCHOOL_SLUG || "ohsoed";
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

/** The school picked with the admin's School switcher (a cookie on /admin only); null means this site's own school. */
export const SCHOOL_COOKIE = "ose_school";
async function adminSchool(): Promise<string | null> {
  try {
    const { cookies } = await import("next/headers");
    const v = (await cookies()).get(SCHOOL_COOKIE)?.value;
    return v && /^[a-z0-9-]{2,40}$/.test(v) ? v : null;
  } catch { return null; } // not in a request (background jobs): the site's own school
}
/** Every school on the platform, for the School switcher. */
export async function listSchools(): Promise<{ slug: string; name: string }[]> {
  const client = await pool().connect();
  try { return (await client.query("select slug, name from schools order by name")).rows; } finally { client.release(); }
}
export const siteSchool = () => process.env.SCHOOL_SLUG || "ohsoed";
/** The schools a person can switch to: where their email has an admin account (always including this site's school). */
export async function schoolsFor(email: string): Promise<{ slug: string; name: string }[]> {
  const client = await pool().connect();
  try {
    return (await client.query(`select s.slug, s.name from schools s where s.slug = $2 or exists (select 1 from users u where u.school_id = s.id
      and lower(u.email::text) = lower($1) and u.role in ('school_admin','platform_admin') and u.disabled_at is null) order by s.name`, [email, siteSchool()])).rows;
  } finally { client.release(); }
}
