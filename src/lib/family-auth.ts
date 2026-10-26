import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { withSchool } from "./db";
import { sendOne } from "./email";

// Parent and student sign-in by emailed link. The link works once, for 30 minutes; the session lasts 30 days.
export const FAMILY_COOKIE = "ose_family";
const DAYS = 30;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export type Family = { kind: "parent" | "student"; id: string; parentId: string; first: string; last: string; email: string; viewer: string | null; viewerName: string | null };

/** Email a sign-in link if the address belongs to a parent or a student. Always answers the same way (no account fishing). */
export async function sendSignInLink(email: string, base: string): Promise<string | null> {
  email = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return "Enter your email address.";
  const ip = ((await headers()).get("x-forwarded-for") || "").split(",")[0].trim() || null;
  const r = await withSchool(async (q) => {
    const [f] = await q<{ n: number; m: number }>(`select count(*) filter (where email = $1)::int as n, count(*) filter (where ip = $2)::int as m from sign_in_attempts where created_at > now() - interval '15 minutes'`, [email, ip]);
    if (f.n >= 5 || f.m >= 20) return "busy";
    await q(`insert into sign_in_attempts (school_id, email, ip, ok) values (current_school(), $1, $2, false)`, [email, ip]);
    const p = (await q<{ id: string; first: string }>(`select id, first_name as first from parents where email = $1`, [email]))[0];
    const s = p ? null : (await q<{ id: string; first: string }>(`select id, first_name as first from students where lower(email::text) = $1
      and exists (select 1 from enrolments e where e.student_id = students.id and e.status = 'active')`, [email]))[0];
    if (!p && !s) return null;
    const token = randomBytes(32).toString("base64url");
    await q(`insert into family_links (school_id, parent_id, student_id, token_hash) values (current_school(), $1, $2, $3)`, [p?.id ?? null, s?.id ?? null, sha256(token)]);
    const school = (await q<{ name: string }>(`select name from schools where id = current_school()`))[0]?.name ?? "OH-SO ED";
    return { token, first: (p ?? s)!.first, school };
  });
  if (r === "busy") return "Too many tries. Please wait 15 minutes and try again.";
  if (r) await sendOne([{ name: r.first, email }], `Your ${r.school} sign-in link`,
    `Hello ${r.first},\n\nUse this link to sign in to your ${r.school} account. It works once, for the next 30 minutes:\n\n${base}/account/sign-in?t=${r.token}\n\nIf you didn’t ask for it, you can ignore this email.\n\n${r.school}`, { tag: "sign-in-link" });
  return null;
}

async function startSession(parentId: string | null, studentId: string | null, viewer: string | null, hours: number) {
  const token = randomBytes(32).toString("base64url");
  await withSchool((q) => q(`insert into family_sessions (school_id, parent_id, student_id, viewer_user_id, token_hash, expires_at) values (current_school(), $1, $2, $3, $4, now() + make_interval(hours => $5))`,
    [parentId, studentId, viewer, sha256(token), hours]));
  (await cookies()).set(FAMILY_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: hours * 3600 });
}

/** The emailed link: use it once, start a session, and say where to go. */
export async function redeemSignInLink(token: string): Promise<"parent" | "student" | null> {
  if (!token || token.length > 100) return null;
  const l = (await withSchool((q) => q<{ parent_id: string | null; student_id: string | null }>(`update family_links set used_at = now() where token_hash = $1 and used_at is null and expires_at > now()
    returning parent_id, student_id`, [sha256(token)])))[0];
  if (!l) return null;
  await startSession(l.parent_id, l.student_id, null, DAYS * 24);
  if (l.parent_id) await withSchool((q) => q(`update parents set email_verified_at = coalesce(email_verified_at, now()) where id = $1`, [l.parent_id]));
  return l.parent_id ? "parent" : "student";
}

/** An admin opening the parent or student dashboard as that family (read-only, 8 hours). */
export async function viewAsFamily(adminId: string, kind: "p" | "s", id: string) {
  await startSession(kind === "p" ? id : null, kind === "s" ? id : null, adminId, 8);
}

export async function currentFamily(): Promise<Family | null> {
  const token = (await cookies()).get(FAMILY_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  return (await withSchool((q) => q<Family>(`with s as (update family_sessions set last_seen_at = now() where token_hash = $1 and expires_at > now() returning parent_id, student_id, viewer_user_id)
    select case when s.parent_id is not null then 'parent' else 'student' end as kind, coalesce(s.parent_id, s.student_id) as id, coalesce(p.id, st.parent_id) as "parentId",
      coalesce(p.first_name, st.first_name) as first, coalesce(p.last_name, st.last_name) as last, coalesce(p.email, st.email)::text as email,
      s.viewer_user_id as viewer, u.name as "viewerName"
    from s left join parents p on p.id = s.parent_id left join students st on st.id = s.student_id left join users u on u.id = s.viewer_user_id`, [sha256(token)])))[0] ?? null;
}
export async function requireParent(): Promise<Family> {
  const f = await currentFamily();
  if (!f) redirect("/account");
  if (f.kind !== "parent") redirect("/student");
  return f;
}
export async function requireStudent(): Promise<Family> {
  const f = await currentFamily();
  if (!f) redirect("/account");
  if (f.kind !== "student") redirect("/parent");
  return f;
}
/** For family actions: the signed-in parent, refusing an admin who is only viewing. */
export async function actingParent(): Promise<Family> {
  const f = await requireParent();
  if (f.viewer) throw new Error("viewing");
  return f;
}
export async function actingStudent(): Promise<Family> {
  const f = await requireStudent();
  if (f.viewer) throw new Error("viewing");
  return f;
}
export async function familySignOut() {
  const jar = await cookies(), token = jar.get(FAMILY_COOKIE)?.value;
  if (token) await withSchool((q) => q(`delete from family_sessions where token_hash = $1`, [sha256(token)]));
  jar.delete({ name: FAMILY_COOKIE, path: "/" });
}
