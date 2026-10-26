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
      `select id, password_hash from users where email = $1 and role in ('school_admin', 'teacher') and disabled_at is null`, [email]);
    const ok = await checkPassword(password, u[0]?.password_hash ?? null);
    await q(`insert into sign_in_attempts (school_id, email, ip, ok) values (current_school(), $1, $2, $3)`, [email, ip, ok]);
    if (!ok) return "bad";
    const token = randomBytes(32).toString("base64url");
    await q(`insert into staff_sessions (school_id, user_id, token_hash, expires_at, ip, user_agent)
             values (current_school(), $1, $2, now() + make_interval(hours => $3), $4, $5)`, [u[0].id, sha256(token), SESSION_HOURS, ip, ua]);
    await q(`update users set last_sign_in_at = now() where id = $1`, [u[0].id]);
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
    select u.id, u.name, u.email::text, u.role::text from s join users u on u.id = s.user_id
    where u.role in ('school_admin', 'teacher') and u.disabled_at is null`, [sha256(token)]));
  return rows[0] ?? null;
}

/** For admin pages and actions: the signed-in admin, or a redirect (teachers go to their own page). */
export async function requireStaff(): Promise<Staff> {
  const s = await currentStaff();
  if (!s) redirect("/admin/login");
  if (s.role !== "school_admin") redirect("/admin/teacher");
  return s;
}
/** Any signed-in member of staff (admin or teacher). */
export async function requireSignedIn(): Promise<Staff> {
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

// ---------- invitations ----------
const INVITE_DAYS = 7;
export type InviteInfo = { id: string; name: string; email: string; role: string; expired: boolean; used: boolean };

/** Creates an invite and returns the one-time token for the link (shown to the inviting admin once). */
export async function createInvite(by: string, name: string, email: string, role: "school_admin" | "teacher", teacherId: string | null): Promise<{ token?: string; error?: string }> {
  return withSchool(async (q) => {
    const existing = await q<{ role: string; has_pw: boolean; disabled: boolean }>(
      `select role::text, password_hash is not null as has_pw, disabled_at is not null as disabled from users where email = $1`, [email]);
    if (existing[0]?.has_pw && !existing[0].disabled && (existing[0].role === role || existing[0].role === "school_admin"))
      return { error: "That person already has an account with this access." };
    await q(`update staff_invites set revoked_at = now() where email = $1 and accepted_at is null and revoked_at is null`, [email]);
    const token = randomBytes(32).toString("base64url");
    await q(`insert into staff_invites (school_id, email, name, role, teacher_id, token_hash, invited_by, expires_at)
             values (current_school(), $1, $2, $3::user_role, $4, $5, $6, now() + make_interval(days => $7))`,
      [email, name, role, teacherId, sha256(token), by, INVITE_DAYS]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, detail) values (current_school(), $1, 'invite', 'user', $2)`,
      [by, JSON.stringify({ email, role })]);
    return { token };
  });
}

export async function getInvite(token: string): Promise<InviteInfo | null> {
  if (!token || token.length > 100) return null;
  const r = await withSchool((q) => q<InviteInfo>(`select id, name, email::text, role::text, expires_at < now() as expired,
      (accepted_at is not null or revoked_at is not null) as used from staff_invites where token_hash = $1`, [sha256(token)]));
  return r[0] ?? null;
}

/** Accepting an invite: sets the password on the person's account (creating it if needed). */
export async function acceptInvite(token: string, password: string): Promise<{ email?: string; error?: string }> {
  if (password.length < MIN_PASSWORD) return { error: `Use a password of at least ${MIN_PASSWORD} characters.` };
  const hash = await hashPassword(password);
  return withSchool(async (q) => {
    const inv = (await q<{ id: string; name: string; email: string; role: string; teacher_id: string | null; ok: boolean }>(
      `select id, name, email::text, role::text, teacher_id, (expires_at > now() and accepted_at is null and revoked_at is null) as ok
       from staff_invites where token_hash = $1 for update`, [sha256(token)]))[0];
    if (!inv || !inv.ok) return { error: "This invitation link has expired or has already been used. Ask for a new one." };
    let userId: string | undefined;
    if (inv.teacher_id) {   // an existing teacher record: give its user account this email and password
      userId = (await q<{ id: string }>(`update users u set email = $2, name = $3, password_hash = $4, disabled_at = null,
          role = case when u.role = 'school_admin' then u.role else $5::user_role end
        from teachers t where t.id = $1 and u.id = t.user_id returning u.id`, [inv.teacher_id, inv.email, inv.name, hash, inv.role]))[0]?.id;
    }
    if (!userId) {
      userId = (await q<{ id: string }>(`update users set password_hash = $2, disabled_at = null, name = $3,
          role = case when role = 'school_admin' then role else $4::user_role end where email = $1 returning id`, [inv.email, hash, inv.name, inv.role]))[0]?.id;
    }
    if (!userId) {
      userId = (await q<{ id: string }>(`insert into users (school_id, email, name, role, password_hash) values (current_school(), $1, $2, $3::user_role, $4) returning id`,
        [inv.email, inv.name, inv.role, hash]))[0].id;
    }
    if (inv.role === "teacher" && !inv.teacher_id) {
      await q(`insert into teachers (school_id, user_id) select current_school(), $1 where not exists (select 1 from teachers where user_id = $1)`, [userId]);
    }
    await q(`update staff_invites set accepted_at = now() where id = $1`, [inv.id]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id) values (current_school(), $1, 'invite_accepted', 'user', $1)`, [userId]);
    return { email: inv.email };
  });
}

// ---------- "Viewing as": an admin can see the teacher area exactly as one teacher sees it ----------
export const VIEWAS_COOKIE = "ose_viewas";
export type Viewer = Staff & { viewing?: boolean; realName?: string; realEmail?: string };
/** For teacher-area pages: the signed-in teacher, or the teacher an admin is viewing as. */
export async function requireViewer(): Promise<Viewer> {
  const me = await requireSignedIn();
  if (me.role !== "school_admin") return me;
  const v = (await cookies()).get(VIEWAS_COOKIE)?.value ?? "";
  const id = v.startsWith("t:") ? v.slice(2) : "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return me;
  const t = (await withSchool((q) => q<Staff>(`select u.id, u.name, u.email::text, 'teacher' as role from users u join teachers t on t.user_id = u.id
    where u.id = $1 and u.disabled_at is null and t.archived_at is null`, [id])))[0];
  return t ? { ...t, viewing: true, realName: me.name, realEmail: me.email } : me;
}
