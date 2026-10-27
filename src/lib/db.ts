import "server-only";
import { Pool, type PoolClient } from "pg";
import { AsyncLocalStorage } from "node:async_hooks";

// Code that must run as a particular school (setting up the demo school) sets it here; otherwise the admin's School switcher decides.
const forced = new AsyncLocalStorage<string>();
export const runAsSchool = <T,>(slug: string, fn: () => Promise<T>) => forced.run(slug, fn);

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
    const slug = forced.getStore() || (await adminSchool()) || process.env.SCHOOL_SLUG || "ohsoed";
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
    const { cookies, headers } = await import("next/headers");
    // the demo school's public website (set by middleware only, from a signed demo cookie; never trusted from the browser)
    const site = (await headers()).get("x-ose-site");
    if (site && /^[a-z0-9-]{2,40}$/.test(site)) return site;
    const jar = await cookies();
    // ose_school is sent on /admin; the family pages get their own while an admin views a demo-school family
    const v = jar.get(SCHOOL_COOKIE)?.value || jar.get(SCHOOL_COOKIE + "_p")?.value || jar.get(SCHOOL_COOKIE + "_s")?.value;
    return v && /^[a-z0-9-]{2,40}$/.test(v) ? v : null;
  } catch { return null; } // not in a request (background jobs): the site's own school
}
/** Every school on the platform, for the School switcher. */
export async function listSchools(): Promise<{ slug: string; name: string }[]> {
  const client = await pool().connect();
  try { return (await client.query("select slug, name from schools order by name")).rows; } finally { client.release(); }
}
export const siteSchool = () => process.env.SCHOOL_SLUG || "ohsoed";
/** The school this request works in. */
export async function activeSchool(): Promise<string> { return forced.getStore() || (await adminSchool()) || siteSchool(); }
/** The schools a person can switch to: where their email has an admin account (always including this site's school). */
export async function schoolsFor(email: string): Promise<{ slug: string; name: string }[]> {
  const client = await pool().connect();
  try {
    return (await client.query(`select s.slug, s.name from schools s where s.slug = $2 or exists (select 1 from users u where u.school_id = s.id
      and lower(u.email::text) = lower($1) and u.role in ('school_admin','platform_admin') and u.disabled_at is null)
      or (s.is_demo and exists (select 1 from users u join schools h on h.id = u.school_id where h.slug = $2 and lower(u.email::text) = lower($1) and u.role in ('school_admin','platform_admin') and u.disabled_at is null))
      order by s.is_demo, s.name`, [email, siteSchool()])).rows;
  } finally { client.release(); }
}

/** The school whose public website this request shows: its name, and whether it's the made-up demo school. */
export async function siteInfo(): Promise<{ name: string; demo: boolean; primary: string; accent: string }> {
  const d = { name: "OH-SO ED", demo: false, primary: "#0f1747", accent: "#e3cd4b" };
  return withSchool((q) => q<{ name: string; demo: boolean; primary: string | null; accent: string | null }>(`select name, is_demo as demo, brand->>'primary' as primary, brand->>'accent' as accent from schools where id = current_school()`))
    .then((r) => r[0] ? { name: r[0].name, demo: r[0].demo, primary: /^#[0-9a-f]{6}$/i.test(r[0].primary ?? "") ? r[0].primary! : d.primary, accent: /^#[0-9a-f]{6}$/i.test(r[0].accent ?? "") ? r[0].accent! : d.accent } : d).catch(() => d);
}

/** True in the demo school: nothing is ever emailed, charged or posted from it. */
export async function isDemoSchool(): Promise<boolean> {
  return withSchool((q) => q<{ d: boolean }>(`select is_demo as d from schools where id = current_school()`)).then((r) => !!r[0]?.d).catch(() => false);
}
