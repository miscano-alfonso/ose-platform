import "server-only";
import { randomBytes, createHash, createHmac } from "node:crypto";
import { cookies, headers } from "next/headers";
import { withSchool, runAsSchool, SCHOOL_COOKIE } from "./db";
import { hashPassword, signIn, MIN_PASSWORD } from "./auth";
import { sendHtml } from "./email";

// OH-SO EdTech self-serve trials (Solo and Growth; School is on request).
//  1. /osedtech/trial: name, email, school name and plan. Saved in edtech_trials with a one-time link, emailed to them.
//  2. /osedtech/start?t=…: they choose a password and their school is made (create_trial_school, db/062), then they're
//     signed in to its dashboard. 30 days, then the dashboard shows "your trial has ended" until Alfonso moves the date.
//  3. /osedtech/login: signing in again later (and "forgotten password" by email).
// Trial schools never use OH-SO ED's Brevo or Stripe keys (see isPlatformSchool), so nothing is sent or read as OH-SO ED.

export const TRIAL_DAYS = 30;
const CONFIRM_HOURS = 48, RESET_HOURS = 2;
const NOTIFY = () => process.env.EDTECH_NOTIFY_EMAIL || "alfonso@ohsoed.co.uk";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RESERVED = new Set(["ohsoed", "oh-so-ed", "demo", "demo-academy", "admin", "osedtech", "ohsoedtech", "www", "api", "app", "test"]);

async function origin(): Promise<string> {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  const h = await headers(), host = h.get("x-forwarded-host") || h.get("host") || "ose.miscano.co.uk";
  return `${h.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https")}://${host}`;
}

function mail(title: string, lines: string[], button: [string, string], small: string) {
  return `<div style="background:#f6f3ec;padding:28px 12px;font:16px/1.55 Arial,Helvetica,sans-serif;color:#12162f"><div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:28px">
    <p style="margin:0 0 18px;font-weight:700;letter-spacing:.08em;font-size:13px">OH–SO ED&nbsp;TECH</p>
    <h1 style="font-size:22px;line-height:1.25;margin:0 0 14px">${esc(title)}</h1>${lines.map((l) => `<p style="margin:0 0 12px">${l}</p>`).join("")}
    <p style="margin:22px 0"><a href="${esc(button[1])}" style="display:inline-block;background:#12162f;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:999px">${esc(button[0])}</a></p>
    <p style="margin:0;font-size:13.5px;color:#5b6078">${small}</p></div></div>`;
}

export type TrialAsk = { name: string; email: string; business: string; plan: "solo" | "growth"; google: string; teachers: string; students: string; subjects: string; video: string };
/** Step 1: save the request and email the one-time link. Returns an error for the form, or null. */
export async function requestTrialAccount(t: TrialAsk): Promise<string | null> {
  if (!t.name || !EMAIL.test(t.email) || !t.business) return "Fill in your name, email and school name.";
  const [{ n, total }] = await withSchool((q) => q<{ n: number; total: number }>(`select count(*) filter (where email = $1)::int as n, count(*)::int as total
    from edtech_trials where self_serve and created_at > now() - interval '1 day'`, [t.email]));
  if (n >= 3) return "We’ve already sent you a link today. Check your inbox (and junk folder), or sign in if you’ve set up your school.";
  if (total >= 60) return "Lots of people are starting trials today. Please try again tomorrow, or email us and we’ll set you up.";
  const token = randomBytes(24).toString("base64url");
  const [{ id }] = await withSchool((q) => q<{ id: string }>(`insert into edtech_trials (school_id, name, email, business, plan, google, teachers, students, subjects, self_serve, token_hash, token_kind, token_expires, video)
    values (current_school(), $1, $2, $3, $4, $5, $6, $7, $8, true, $9, 'confirm', now() + make_interval(hours => $10), $11) returning id`,
    [t.name, t.email, t.business, t.plan, t.google, t.teachers, t.students, t.subjects, sha(token), CONFIRM_HOURS, t.video]));
  const link = `${await origin()}/osedtech/start?t=${token}`;
  const r = await sendHtml("Confirm your email to open your OH-SO EdTech trial", mail(`Your ${t.business} trial is nearly ready`,
    [`Hi ${esc(t.name.split(" ")[0])},`, `Confirm your email and choose a password, and your school opens straight away on the ${t.plan === "solo" ? "Solo" : "Growth"} plan. It’s free for ${TRIAL_DAYS} days, with no card needed.`],
    ["Confirm and open my school", link], `The link works for ${CONFIRM_HOURS} hours. If you didn’t ask for this, you can ignore this email.`), [t.email], "edtech-account", { account: true, fromName: "OH-SO EdTech" });
  if (!r.ok) {   // not sent: forget the request, so trying again isn't counted against them
    console.error("trial email", r.error); await withSchool((q) => q(`delete from edtech_trials where id = $1`, [id])).catch(() => undefined);
    return "We couldn’t send the email just now. Please try again in a few minutes.";
  }
  await sendHtml(`OH-SO EdTech: ${t.business} is starting a ${t.plan} trial`, `<div style="font:15px/1.5 Arial,sans-serif;color:#12162f"><p><b>${esc(t.name)}</b> (${esc(t.email)}) asked for a ${t.plan} trial for <b>${esc(t.business)}</b>. They’ve been sent the link to open it.</p>
    <p>${[t.teachers && `Teachers: ${esc(t.teachers)}`, t.students && `Students: ${esc(t.students)}`, t.google && `Google: ${esc(t.google)}`, t.subjects && `Teaches: ${esc(t.subjects)}`, t.video && `Video: ${esc(t.video)}`].filter(Boolean).join("<br>")}</p>
    <p>It’s in Admin → Settings → EdTech trials.</p></div>`, [NOTIFY()], "edtech-trial").catch(() => undefined);
  return null;
}

type Row = { id: string; name: string; email: string; business: string; plan: string; school_slug: string | null; video: string };
async function byToken(token: string, kind: "confirm" | "reset"): Promise<Row | null> {
  if (!/^[\w-]{20,64}$/.test(token)) return null;
  return (await withSchool((q) => q<Row>(`select id, name, email::text, business, plan, school_slug, video from edtech_trials
    where token_hash = $1 and token_kind = $2 and token_expires > now()`, [sha(token), kind])))[0] ?? null;
}
export async function confirmInfo(token: string) { const r = await byToken(token, "confirm"); return r && { name: r.name, email: r.email, business: r.business, plan: r.plan as "solo" | "growth", done: !!r.school_slug }; }
export async function resetInfo(token: string) { const r = await byToken(token, "reset"); return r && { email: r.email }; }

function slugFrom(name: string): string {
  const s = name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30).replace(/-+$/, "");
  return s.length >= 3 && !RESERVED.has(s) ? s : `school-${randomBytes(3).toString("hex")}`;
}

/** Signs this browser in to a customer school's dashboard: its staff sign-in, the school chosen on /admin, and the signed
 *  cookie that lets it past the private-preview password (checked in middleware). */
async function enter(slug: string, email: string, password: string): Promise<string | null> {
  const err = await runAsSchool(slug, () => signIn(email, password));
  if (err) return err;
  await trialCookies(slug);
  return null;
}
/** The school chosen on /admin, and the signed cookie that lets this browser past the private-preview password for it. */
export async function trialCookies(slug: string) {
  const jar = await cookies(), secure = process.env.NODE_ENV === "production", maxAge = 30 * 86400;
  jar.set(SCHOOL_COOKIE, slug, { httpOnly: true, secure, sameSite: "lax", path: "/admin", maxAge });
  const key = process.env.SITE_PASSWORD || process.env.ADMIN_SETUP_KEY || "";
  if (key) jar.set("ose_trial", `${slug}.${createHmac("sha256", key).update(`ose-trial:${slug}`).digest("base64url")}`, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge });
}

/** A staff invitation in a customer school (Growth: a login for each teacher). The link goes through /osedtech/join. */
export async function joinInvite(slug: string, token: string): Promise<boolean> {
  if (!/^[a-z0-9-]{2,40}$/.test(slug) || !/^[\w-]{20,100}$/.test(token)) return false;
  const ok = await withSchool((q) => q<{ slug: string }>(`select slug from trial_school_list() where slug = $1`, [slug])).then((r) => r.length > 0).catch(() => false);
  if (!ok) return false;
  const { getInvite } = await import("./auth");
  const inv = await runAsSchool(slug, () => getInvite(token)).catch(() => null);
  if (!inv || inv.used || inv.expired) return false;
  await trialCookies(slug);
  return true;
}

/** Step 2: choose a password; the school is made and they're signed in. Returns an error, or null (then go to /admin). */
export async function openTrialSchool(token: string, password: string): Promise<string | null> {
  const r = await byToken(token, "confirm");
  if (!r) return "This link has expired or has already been used. Sign in, or start again from the trial page.";
  if (r.school_slug) return "Your school is already open. Sign in with your email and password.";
  if (password.length < MIN_PASSWORD) return `Choose a password of at least ${MIN_PASSWORD} characters.`;
  if (password.toLowerCase().includes(r.email.split("@")[0].toLowerCase()) && r.email.split("@")[0].length > 3) return "Choose a password that doesn’t contain your email address.";
  const hash = await hashPassword(password);
  let slug = slugFrom(r.business), made = false;
  for (let i = 0; i < 4 && !made; i++) {
    try {
      await withSchool((q) => q(`select create_trial_school($1, $2, $3, $4, $5, $6, $7)`, [slug, r.business, r.plan === "growth" ? "growth" : "solo", r.email, r.name, hash, TRIAL_DAYS]));
      made = true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/too many trials/.test(msg)) return "Lots of people are starting trials today. Please try again tomorrow, or email us and we’ll set you up.";
      if (!/duplicate key|schools_slug_key/.test(msg)) { console.error("trial school", e); return "Your school couldn’t be made just now. Please try again in a minute."; }
      slug = `${slugFrom(r.business).slice(0, 33)}-${randomBytes(2).toString("hex")}`;
    }
  }
  if (!made) return "Your school couldn’t be made just now. Please try again in a minute.";
  // the video tool they teach with: Join buttons and reminders use each class's link; attendance from Meet, Zoom or check-ins
  const { VIDEO_TOOLS } = await import("./video"), { saveVideoSettings } = await import("./checkins");
  const tool = VIDEO_TOOLS.find((v) => v.id === r.video)?.id ?? "meet";
  await runAsSchool(slug, () => saveVideoSettings({ tool, checkins: tool !== "meet" && tool !== "zoom" })).catch((e) => console.error("trial video", e));
  await withSchool((q) => q(`update edtech_trials set status = 'trial', school_slug = $2, token_hash = null, token_kind = null, token_expires = null,
    note = trim(note || ' Opened ' || to_char(now() at time zone 'Europe/London', 'DD Mon YYYY HH24:MI') || '.') where id = $1`, [r.id, slug]));
  await sendHtml(`OH-SO EdTech: ${r.business} opened its ${r.plan} trial`, `<div style="font:15px/1.5 Arial,sans-serif;color:#12162f"><p><b>${esc(r.name)}</b> (${esc(r.email)}) has opened <b>${esc(r.business)}</b> on the ${r.plan} plan. The trial ends in ${TRIAL_DAYS} days.</p></div>`, [NOTIFY()], "edtech-trial").catch(() => undefined);
  return enter(slug, r.email, password);
}

/** /osedtech/login: tries each customer school where this email has a staff login. */
export async function signInCustomer(email: string, password: string): Promise<string | null> {
  email = email.trim().toLowerCase();
  if (!EMAIL.test(email) || !password) return "Enter your email and password.";
  const schools = await withSchool((q) => q<{ slug: string }>(`select slug from trial_schools_for($1)`, [email])).catch(() => []);
  let last: string | null = "That email and password don’t match.";
  for (const s of schools) { const e = await enter(s.slug, email, password); if (!e) return null; if (/Too many/.test(e)) last = e; }
  return last;
}

/** Forgotten password: emails a link to the person who opened the trial (teachers ask their school's admin). Always says it's sent. */
export async function requestReset(email: string): Promise<void> {
  email = email.trim().toLowerCase(); if (!EMAIL.test(email)) return;
  const token = randomBytes(24).toString("base64url");
  const r = (await withSchool((q) => q<{ id: string; name: string }>(`update edtech_trials set token_hash = $2, token_kind = 'reset', token_expires = now() + make_interval(hours => $3)
    where id = (select id from edtech_trials where email = $1 and self_serve and school_slug is not null order by created_at desc limit 1)
      and not (token_kind = 'reset' and token_expires > now() + make_interval(hours => $3) - interval '5 minutes')   -- one email per 5 minutes
    returning id, name`, [email, sha(token), RESET_HOURS])))[0];
  if (!r) return;
  await sendHtml("Reset your OH-SO EdTech password", mail("Choose a new password", [`Hi ${esc(r.name.split(" ")[0])},`, "Someone (hopefully you) asked to reset the password for your OH-SO EdTech school."],
    ["Choose a new password", `${await origin()}/osedtech/login/reset?t=${token}`], `The link works for ${RESET_HOURS} hours. If you didn’t ask, you can ignore this email and your password stays the same.`),
    [email], "edtech-account", { account: true, fromName: "OH-SO EdTech" }).catch(() => undefined);
}
export async function resetPassword(token: string, password: string): Promise<string | null> {
  const r = await byToken(token, "reset");
  if (!r?.school_slug) return "This link has expired. Ask for a new one.";
  if (password.length < MIN_PASSWORD) return `Choose a password of at least ${MIN_PASSWORD} characters.`;
  const hash = await hashPassword(password);
  const n = await runAsSchool(r.school_slug, () => withSchool(async (q) => {
    const u = await q<{ id: string }>(`update users set password_hash = $2 where lower(email::text) = $1 and role = 'school_admin' returning id`, [r.email.toLowerCase(), hash]);
    if (u[0]) await q(`delete from staff_sessions where user_id = $1`, [u[0].id]);
    return u.length;
  }));
  await withSchool((q) => q(`update edtech_trials set token_hash = null, token_kind = null, token_expires = null where id = $1`, [r.id]));
  if (!n) return "This link has expired. Ask for a new one.";
  return enter(r.school_slug, r.email, password);
}

/** Settings → EdTech trials: the schools opened from trials, with their end dates. */
export async function trialSchools(): Promise<Record<string, { name: string; plan: string; ends: string | null }>> {
  const rows = await withSchool((q) => q<{ slug: string; name: string; plan: string; ends: string | null }>(`select slug, name, plan, trial_ends_at::text as ends from trial_school_list()`)).catch(() => []);
  return Object.fromEntries(rows.map((r) => [r.slug, r]));
}
export async function setTrialEnd(slug: string, days: number) {
  await withSchool((q) => q(`select set_trial_end($1, now() + make_interval(days => $2))`, [slug, Math.max(0, Math.min(days, 365))]));
}
