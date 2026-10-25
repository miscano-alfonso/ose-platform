import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { withSchool } from "./db";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;

export const SESSION_COOKIE = "ose_admin";
const SESSION_HOURS = 12;
const MAX_FAILS_PER_EMAIL = 5;     // in 15 minutes
const MAX_FAILS_PER_IP = 20;       // in 15 minutes
export const MIN_PASSWORD = 12;

// ---------- passwords: scrypt, random salt, constant-time compare ----------
const N = 16384, R = 8, P = 1, LEN = 64;
export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw.normalize("NFKC"), salt, LEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}
export async function checkPassword(pw: string, stored: string | null): Promise<boolean> {
  // always do the work, so a missing account takes as long as a wrong password
  const parts = (stored || "").split("$");
  const ok = parts.length === 6 && parts[0] === "scrypt";
  const salt = ok ? Buffer.from(parts[4], "base64") : randomBytes(16);
  const want = ok ? Buffer.from(parts[5], "base64") : randomBytes(LEN);
  const got = await scrypt(pw.normalize("NFKC"), salt, want.length, ok ? { N: +parts[1], r: +parts[2], p: +parts[3] } : { N, r: R, p: P });
  return ok && timingSafeEqual(got, want);
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
async function clientInfo() {
  const h = await headers();
  return { ip: (h.get("x-forwarded-for") || "").split(",")[0].trim() || null, ua: (h.get("user-agent") || "").slice(0, 300) };
}

export type Staff = { id: string; name: string; email: string; role: string };

/** Signs a member of staff in. Returns an error message for the form, or null on success. */
export async function signIn(email: string, password: string): Promise<string | null> {
  const { ip, ua } = await clientInfo();
  const result = await withSchool(async (q) => {
    const fails = await q<{ by_email: number; by_ip: number }>(`
      select count(*) filter (where email = $1)::int as by_email, count(*) filter (where ip = $2)::int as by_ip
      from sign_in_attempts where not ok and created_at > now() - interval '15 minutes'`, [email, ip]);
    if (fails[0].by_email >= MAX_FAILS_PER_EMAIL || fails[0].by_ip >= MAX_FAILS_PER_IP) return "locked";
    const u = await q<{ id: string; password_hash: string | null }>(
      `select id, password_hash from users where email = $1 and role = 'school_admin'`, [email]);
    const ok = await checkPassword(password, u[0]?.password_hash ?? null);
    await q(`insert into sign_in_attempts (school_id, email, ip, ok) values (current_school(), $1, $2, $3)`, [email, ip, ok]);
    if (!ok) return "bad";
    const token = randomBytes(32).toString("base64url");
    await q(`insert into staff_sessions (school_id, user_id, token_hash, expires_at, ip, user_agent)
             values (current_school(), $1, $2, now() + make_interval(hours => $3), $4, $5)`, [u[0].id, sha256(token), SESSION_HOURS, ip, ua]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id) values (current_school(), $1, 'sign_in', 'user', $1)`, [u[0].id]);
    return { token };
  });
  if (result === "locked") return "Too many attempts. Please wait 15 minutes and try again.";
  if (result === "bad") return "That email and password don’t match.";
  (await cookies()).set(SESSION_COOKIE, result.token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/admin", maxAge: SESSION_HOURS * 3600,
  });
  return null;
}

/** The signed-in member of staff, or null. */
export async function currentStaff(): Promise<Staff | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const rows = await withSchool((q) => q<Staff>(`
    with s as (update staff_sessions set last_seen_at = now() where token_hash = $1 and expires_at > now() returning user_id)
    select u.id, u.name, u.email::text, u.role::text from s join users u on u.id = s.user_id where u.role = 'school_admin'`, [sha256(token)]));
  return rows[0] ?? null;
}

/** For admin pages and actions: the signed-in staff member, or a redirect to the sign-in page. */
export async function requireStaff(): Promise<Staff> {
  const s = await currentStaff();
  if (!s) redirect("/admin/login");
  return s;
}

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await withSchool((q) => q(`delete from staff_sessions where token_hash = $1`, [sha256(token)]));
  jar.delete({ name: SESSION_COOKIE, path: "/admin" });
}

/** True until the school's first admin password has been set. */
export async function needsSetup(): Promise<boolean> {
  const r = await withSchool((q) => q<{ n: number }>(`select count(*)::int as n from users where role = 'school_admin' and password_hash is not null`));
  return r[0].n === 0;
}

/** First-time setup: creates (or claims) the school admin account. Needs the ADMIN_SETUP_KEY set in Vercel. */
export async function setUpFirstAdmin(key: string, name: string, email: string, password: string): Promise<string | null> {
  const want = process.env.ADMIN_SETUP_KEY || "";
  if (want.length < 16) return "Setup is switched off. Add an ADMIN_SETUP_KEY (16 characters or more) in Vercel first.";
  const a = Buffer.from(sha256(key)), b = Buffer.from(sha256(want));
  if (!timingSafeEqual(a, b)) return "That setup key isn’t right.";
  if (password.length < MIN_PASSWORD) return `Use a password of at least ${MIN_PASSWORD} characters.`;
  const hash = await hashPassword(password);
  return withSchool(async (q) => {
    const done = await q<{ n: number }>(`select count(*)::int as n from users where role = 'school_admin' and password_hash is not null`);
    if (done[0].n > 0) return "An admin account already exists. Sign in instead.";
    const claimed = await q<{ id: string }>(`
      update users set name = $1, email = $2, password_hash = $3
      where id = (select id from users where role = 'school_admin' order by created_at limit 1) returning id`, [name, email, hash]);
    const id = claimed[0]?.id ?? (await q<{ id: string }>(`insert into users (school_id, email, name, role, password_hash)
      values (current_school(), $2, $1, 'school_admin', $3) returning id`, [name, email, hash]))[0].id;
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id) values (current_school(), $1, 'admin_setup', 'user', $1)`, [id]);
    return null;
  });
}

/** Changing your own password signs out every other session. */
export async function changePassword(userId: string, current: string, next: string): Promise<string | null> {
  if (next.length < MIN_PASSWORD) return `Use a password of at least ${MIN_PASSWORD} characters.`;
  const hash = await hashPassword(next);
  const token = (await cookies()).get(SESSION_COOKIE)?.value || "";
  return withSchool(async (q) => {
    const u = await q<{ password_hash: string }>(`select password_hash from users where id = $1`, [userId]);
    if (!(await checkPassword(current, u[0]?.password_hash ?? null))) return "Your current password isn’t right.";
    await q(`update users set password_hash = $2 where id = $1`, [userId, hash]);
    await q(`delete from staff_sessions where user_id = $1 and token_hash <> $2`, [userId, sha256(token)]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id) values (current_school(), $1, 'password_changed', 'user', $1)`, [userId]);
    return null;
  });
}
