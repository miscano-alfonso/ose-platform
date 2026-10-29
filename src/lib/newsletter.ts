import "server-only";
import { isTestMode } from "./test-mode";
import { createHmac, randomBytes } from "node:crypto";
import { isDemoSchool, withSchool } from "./db";
import { sendHtml } from "./email";

// The newsletter: footer sign-up with double opt-in, the subscribers list, saved emails built from blocks,
// sending and scheduling through Brevo, and opens/clicks. A port of the Giles website's newsletter section.
// Families who ticked "send me news and offers" join the list automatically (source "Parent account").

type Q = <R = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<R[]>;
export class NlError extends Error { constructor(msg: string, public status = 400) { super(msg); } }
const fail = (msg: string, status = 400): never => { throw new NlError(msg, status); };
const normEmail = (s: unknown) => String(s ?? "").trim().toLowerCase();
const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200;
const salt = () => process.env.NEWSLETTER_SALT || process.env.DATABASE_URL || "ose";
export const hashOf = (s: string) => createHmac("sha256", salt()).update(s).digest("hex").slice(0, 16);

async function kvGet<T>(key: string, q?: Q): Promise<T | null> {
  const run = async (qq: Q) => (await qq<{ value: T }>(`select value from newsletter_kv where key = $1`, [key]))[0]?.value ?? null;
  return q ? run(q) : withSchool(run);
}
async function kvSet(key: string, value: unknown, q?: Q) {
  const run = (qq: Q) => value === null ? qq(`delete from newsletter_kv where key = $1`, [key])
    : qq(`insert into newsletter_kv (school_id, key, value) values (current_school(), $1, $2::jsonb) on conflict (school_id, key) do update set value = excluded.value, updated_at = now()`, [key, JSON.stringify(value)]);
  if (q) await run(q); else await withSchool(run);
}

// ---------- branded pages and short emails ----------
/** The school's own look for these pages and emails: its name, header colour, logo (when it may have one) and footer line. */
export type SchoolLook = { school: string; color: string; logoUrl: string; footer: string };
export async function schoolLook(): Promise<SchoolLook> {
  const { emailDesign } = await import("./email");
  const d = await emailDesign().catch(() => null);
  const school = d?.school || "OH-SO ED";
  return { school, color: d?.color || "#0F1747", logoUrl: d?.logo === false ? "" : d?.logoUrl ?? "", footer: (d?.footer ?? "").split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 3).join(" · ") || school };
}
export function simplePage(base: string, title: string, text: string, btn: string, url: string, doc = true, look?: SchoolLook): string {
  const e = (v: string) => v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  const L = look ?? { school: "OH-SO ED", color: "#0F1747", logoUrl: base + "/brand/logo", footer: "OH-SO ED Online School · Oh-so Educate Ltd" };
  const head = L.logoUrl ? `<img src="${e(L.logoUrl)}" width="150" alt="${e(L.school)}" style="display:block;border:0;width:150px;height:auto">`
    : `<span style="font:700 18px Helvetica,Arial,sans-serif;letter-spacing:.06em;color:#ffffff">${e(L.school.toUpperCase())}</span>`;
  const body = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4FA"><tr><td align="center" style="padding:32px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff">`
    + `<tr><td style="background:${e(L.color)};padding:22px 32px">${head}</td></tr>`
    + `<tr><td style="padding:34px 32px 38px"><h1 style="margin:0 0 14px;font:600 30px/1.15 Jost,Helvetica,Arial,sans-serif;color:#0F1747">${e(title)}</h1><p style="margin:0 0 26px;font:400 16px/1.55 Helvetica,Arial,sans-serif;color:#171B2B">${e(text)}</p>`
    + `<a href="${e(url)}" style="display:inline-block;background:#E3CD4B;color:#0F1747;text-decoration:none;font:700 15px/1 Helvetica,Arial,sans-serif;padding:14px 26px;border-radius:999px">${e(btn)}</a></td></tr>`
    + `<tr><td style="background:#0A1033;padding:20px 32px;font:400 12px/1.5 Helvetica,Arial,sans-serif;color:#C9CDE4">${e(L.footer)}</td></tr></table></td></tr></table>`;
  return doc ? `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${e(title)} · ${e(L.school)}</title></head><body style="margin:0">${body}</body></html>` : body;
}

// ---------- Brevo ----------
type BrevoCfg = { key?: string; account?: string; senderName?: string; senderEmail?: string; replyTo?: string; copyTo?: string; listId?: number; listName?: string; lastSync?: string };
const BREVO = () => (process.env.BREVO_API_BASE || "https://api.brevo.com/v3/").replace(/\/?$/, "/");
export const brevoCfg = async (): Promise<BrevoCfg> => (await kvGet<BrevoCfg>("brevo").catch(() => null)) ?? {};
const keyOf = (c: BrevoCfg) => c.key || process.env.BREVO_API_KEY || "";
export const brevoOn = (c: BrevoCfg) => !!(keyOf(c) && c.senderEmail && c.listId);
type BrevoRes = Record<string, any> & { __error?: string; __code?: number }; // eslint-disable-line @typescript-eslint/no-explicit-any
async function brevo(method: string, path: string, body: unknown = null, soft = false, key?: string): Promise<BrevoRes> {
  const k = (await isDemoSchool()) ? "" : key ?? keyOf(await brevoCfg());   // the demo school never talks to Brevo
  if (!k) { if (soft) return { __error: "Brevo isn’t connected." }; fail("Brevo isn’t connected yet. Add your API key under Newsletter › Sending.", 503); }
  let res: Response;
  try {
    res = await fetch(BREVO() + path.replace(/^\//, ""), { method, headers: { "api-key": k, accept: "application/json", ...(body !== null ? { "content-type": "application/json" } : {}) },
      body: body !== null ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(40000) });
  } catch (e) { if (soft) return { __error: "Couldn’t reach Brevo: " + String((e as Error).message) }; return fail("Couldn’t reach Brevo: " + String((e as Error).message), 502); }
  const raw = await res.text(); let j: BrevoRes = {};
  try { j = raw ? JSON.parse(raw) : {}; } catch { j = {}; }
  if (res.status >= 400) { const msg = String(j.message ?? j.code ?? "error"); if (soft) return { __error: msg, __code: res.status }; fail("Brevo: " + msg, res.status === 401 ? 400 : 502); }
  return j;
}
/** Keep one subscriber in step with the Brevo list (best effort, never blocks). */
async function brevoContact(m: { email: string; name: string; status: string }) {
  const c = await brevoCfg(); if (!brevoOn(c)) return; const lid = Number(c.listId);
  if (m.status === "subscribed") await brevo("POST", "contacts", { email: m.email, attributes: m.name ? { FIRSTNAME: m.name } : {}, listIds: [lid], updateEnabled: true, emailBlacklisted: false }, true);
  else if (m.status === "unsubscribed") await brevo("PUT", "contacts/" + encodeURIComponent(m.email), { emailBlacklisted: true, unlinkListIds: [lid] }, true);
}
export async function brevoStatus() {
  const c = await brevoCfg(); const k = keyOf(c);
  return { connected: brevoOn(c), hasKey: !!k, keyHint: k ? "…" + k.slice(-4) : "", fromEnv: !c.key && !!process.env.BREVO_API_KEY, account: c.account ?? "", senderName: c.senderName ?? (await schoolLook()).school,
    senderEmail: c.senderEmail ?? "", replyTo: c.replyTo ?? "", copyTo: c.copyTo ?? "", listId: c.listId ?? null, listName: c.listName ?? "", lastSync: c.lastSync ?? "", canEdit: true };
}
export async function brevoSave(b: Record<string, unknown>) {
  let c = await brevoCfg();
  if (b.disconnect) { await kvSet("brevo", null); return; }
  const newKey = String(b.key ?? "").trim();
  if (newKey) {
    if (!/^xkeysib-[A-Za-z0-9-]{20,}$/.test(newKey)) fail("That doesn’t look like a Brevo API key. It starts with xkeysib-.");
    const acc = await brevo("GET", "account", null, true, newKey);
    if (acc.__error) fail("Brevo didn’t accept that key: " + acc.__error);
    if (c.key !== newKey) c = { key: newKey }; // a different account: start fresh
    c.account = [acc.companyName, acc.email].filter(Boolean).join(" · ");
  }
  const key = keyOf(c); if (!key) fail("Add your Brevo API key first.");
  if (b.senderEmail !== undefined) { const se = normEmail(b.senderEmail); if (se && !validEmail(se)) fail("Choose a sender email."); c.senderEmail = se; }
  if (b.replyTo !== undefined) { const r = normEmail(b.replyTo); if (r && !validEmail(r)) fail("The reply-to address doesn’t look right."); c.replyTo = r || undefined; }
  if (b.copyTo !== undefined) { const list = [...new Set(String(b.copyTo).split(/[,;\s]+/).map(normEmail).filter(Boolean))]; const bad = list.find((e) => !validEmail(e)); if (bad) fail(`“${bad}” doesn’t look like an email address.`); if (list.length > 5) fail("Up to 5 copy addresses."); c.copyTo = list.join(", ") || undefined; }
  const schoolName = (await schoolLook()).school;
  if (b.senderName !== undefined) c.senderName = String(b.senderName).trim().slice(0, 60) || schoolName;
  if (!c.listId) { // our own list in Brevo, created once
    const name = `${schoolName} website subscribers`;
    const lists = await brevo("GET", "contacts/lists?limit=50&offset=0", null, false, key);
    for (const l of lists.lists ?? []) if (l.name === name) { c.listId = Number(l.id); c.listName = name; }
    if (!c.listId) {
      const f = await brevo("GET", "contacts/folders?limit=10&offset=0", null, false, key);
      let fid = Number(f.folders?.[0]?.id ?? 0);
      if (!fid) fid = Number((await brevo("POST", "contacts/folders", { name: schoolName }, false, key)).id ?? 0);
      const nl = await brevo("POST", "contacts/lists", { name, folderId: fid }, false, key);
      c.listId = Number(nl.id ?? 0); c.listName = name;
    }
  }
  await kvSet("brevo", c);
}
export async function brevoSenders() {
  const r = await brevo("GET", "senders");
  return (r.senders ?? []).map((x: { name?: string; email?: string; active?: boolean }) => ({ name: x.name ?? "", email: x.email ?? "", active: !!x.active }));
}

// ---------- subscribers ----------
export type Subscriber = { email: string; name: string; status: string; source: string; created: string; confirmed: string | null; left: string | null };
const SUB_COLS = `email, name, status, source, created_at::text as created, confirmed_at::text as confirmed, left_at::text as "left"`;
/** Families who agreed to news and offers in their account join the list (once; their own unsubscribe is respected). */
async function syncParents(q: Q) {
  await q(`insert into newsletter_subscribers (school_id, email, name, status, source, confirmed_at)
    select distinct on (lower(email)) current_school(), lower(email), left(name, 80), 'subscribed', 'Parent account (agreed to news and offers)', now()
    from marketing_audience where email is not null order by lower(email)
    on conflict (school_id, email) do nothing`);
}
export const listSubscribers = () => withSchool(async (q) => { await syncParents(q); return q<Subscriber>(`select ${SUB_COLS} from newsletter_subscribers order by coalesce(confirmed_at, created_at) desc`); });
/** When someone leaves the list, a family account stops getting news and offers too. */
async function parentOptOut(q: Q, email: string) {
  await q(`update parents set marketing_opt_in = false where lower(email::text) = $1`, [email]).catch(() => {});
  await q(`update guardians set marketing_requested = false where lower(email::text) = $1`, [email]).catch(() => {});
}
export async function subscribe(body: Record<string, unknown>, ip: string, base: string) {
  if (String(body.website ?? "").trim()) return { ok: true }; // filled-in hidden field: a bot
  const e = normEmail(body.email);
  if (!validEmail(e)) fail("Please enter a valid email address.");
  const ipHash = hashOf("ip:" + ip);
  const res = await withSchool(async (q) => {
    const n = (await q<{ n: number }>(`select count(*)::int as n from newsletter_subscribers where ip_hash = $1 and asked_at > now() - interval '1 hour'`, [ipHash]))[0].n;
    if (n >= 5) fail("Too many sign-ups from here. Please try again later.", 429);
    const cur = (await q<{ status: string }>(`select status from newsletter_subscribers where email = $1`, [e]))[0];
    if (cur?.status === "subscribed") return { already: true, token: "" };
    const token = randomBytes(16).toString("hex");
    await q(`insert into newsletter_subscribers (school_id, email, status, source, token, ip_hash, asked_at) values (current_school(), $1, 'pending', 'Website footer', $2, $3, now())
      on conflict (school_id, email) do update set status = 'pending', token = excluded.token, ip_hash = excluded.ip_hash, asked_at = now()`, [e, token, ipHash]);
    return { already: false, token };
  });
  if (res.already) return { ok: true, already: true };
  const link = `${base}/newsletter/confirm?t=${res.token}`;
  const look = await schoolLook();
  const r = await sendHtml(`Please confirm your subscription to ${look.school}`, simplePage(base, "Confirm your subscription", `Thanks for signing up to hear about space in our classes, new courses and workshops from ${look.school}. Please confirm it’s you. If you didn’t sign up, just ignore this email and you won’t hear from us.`, "Yes, subscribe me", link, true, look), [e], "newsletter-confirm");
  if (!r.ok) fail("We couldn’t send the confirmation email just now. Please try again later.", 503);
  return { ok: true };
}
export async function confirmToken(t: string): Promise<boolean> {
  if (!/^[a-f0-9]{32}$/.test(t)) return false;
  const row = await withSchool(async (q) => (await q<{ email: string; name: string; status: string }>(`update newsletter_subscribers set status = 'subscribed', confirmed_at = coalesce(confirmed_at, now()), left_at = null
    where token = $1 and status in ('pending', 'subscribed') returning email, name, status`, [t]))[0]);
  if (row) await brevoContact(row).catch(() => {});
  return !!row;
}
export async function unsubscribeToken(t: string) {
  if (!/^[a-f0-9]{32}$/.test(t)) return;
  const row = await withSchool(async (q) => {
    const r = (await q<{ email: string; name: string; status: string }>(`update newsletter_subscribers set status = 'unsubscribed', left_at = now() where token = $1 returning email, name, status`, [t]))[0];
    if (r) await parentOptOut(q, r.email);
    return r;
  });
  if (row) await brevoContact(row).catch(() => {});
}
export async function addSubscriber(b: Record<string, unknown>, by: string) {
  const e = normEmail(b.email); if (!validEmail(e)) fail("Enter a valid email address.");
  const name = String(b.name ?? "").trim().slice(0, 80);
  const row = await withSchool(async (q) => (await q<{ email: string; name: string; status: string }>(`insert into newsletter_subscribers (school_id, email, name, status, source, confirmed_at)
    values (current_school(), $1, $2, 'subscribed', $3, now())
    on conflict (school_id, email) do update set status = 'subscribed', left_at = null, name = coalesce(nullif($2, ''), newsletter_subscribers.name), confirmed_at = coalesce(newsletter_subscribers.confirmed_at, now())
    returning email, name, status`, [e, name, "Added in the admin by " + by]))[0]);
  await brevoContact(row).catch(() => {});
}
export async function setSubscriber(email: string, act: string) {
  const e = normEmail(email);
  if (!["unsubscribe", "resubscribe", "delete"].includes(act)) fail("Unknown action.");
  const row = await withSchool(async (q) => {
    if (act === "delete") { await q(`delete from newsletter_subscribers where email = $1`, [e]); await parentOptOut(q, e); return null; }
    const r = (await q<{ email: string; name: string; status: string }>(`update newsletter_subscribers set status = $2, left_at = case when $2 = 'unsubscribed' then now() else null end where email = $1 returning email, name, status`, [e, act === "unsubscribe" ? "unsubscribed" : "subscribed"]))[0];
    if (r?.status === "unsubscribed") await parentOptOut(q, e);
    return r;
  });
  if (row) await brevoContact(row).catch(() => {});
  if (act === "delete") { const c = await brevoCfg(); if (brevoOn(c)) await brevo("POST", `contacts/lists/${c.listId}/contacts/remove`, { emails: [e] }, true); }
}
export async function brevoSync() {
  const c = await brevoCfg(); if (!brevoOn(c)) fail("Connect Brevo first.");
  const lid = Number(c.listId);
  // 1) anyone who unsubscribed through a Brevo email
  const gone: string[] = [];
  for (let off = 0; off < 20000; off += 500) {
    const r = await brevo("GET", `contacts/lists/${lid}/contacts?limit=500&offset=${off}`);
    for (const x of r.contacts ?? []) if (x.emailBlacklisted) gone.push(normEmail(x.email));
    if ((r.contacts ?? []).length < 500) break;
  }
  const rows = await withSchool(async (q) => {
    await syncParents(q);
    let n = 0;
    if (gone.length) {
      const r = await q<{ email: string }>(`update newsletter_subscribers set status = 'unsubscribed', left_at = now(), source = left(source || ' · unsubscribed in Brevo', 200)
        where status = 'subscribed' and email = any($1::text[]) returning email`, [gone]);
      n = r.length; for (const x of r) await parentOptOut(q, x.email);
    }
    return { all: await q<{ email: string; name: string }>(`select email, name from newsletter_subscribers where status = 'subscribed'`), gone: n };
  });
  // 2) everyone subscribed here (Brevo updates existing contacts)
  for (let i = 0; i < rows.all.length; i += 500)
    await brevo("POST", "contacts/import", { jsonBody: rows.all.slice(i, i + 500).map((m) => ({ email: m.email, attributes: m.name ? { FIRSTNAME: m.name } : {} })), listIds: [lid], updateExistingContacts: true, emailBlacklist: false });
  c.lastSync = new Date().toISOString(); await kvSet("brevo", c);
  return { ok: true, pushed: rows.all.length, unsubscribed: rows.gone, lastSync: c.lastSync };
}

// ---------- saved emails ----------
type Brevo = { campaignId: number; status: string; at: string; by: string };
export type NlEmail = { id: string; name: string; subject: string; preheader: string; template: string; blocks: Record<string, unknown>[]; updated: string; created: string; by: string; brevo: Brevo | null };
const EM_COLS = `id, name, subject, preheader, template, blocks, brevo, updated_at::text as updated, created_at::text as created, updated_by as by`;
export const listEmails = () => withSchool((q) => q(`select id, name, subject, template, updated_at::text as updated, brevo from newsletter_emails order by updated_at desc`));
export async function getEmail(id: string) {
  const r = (await withSchool((q) => q<NlEmail>(`select ${EM_COLS} from newsletter_emails where id = $1`, [id])))[0];
  if (!r) fail("That email has been deleted.", 404);
  return r;
}
export async function saveEmail(inp: Record<string, unknown>, by: string) {
  if (!inp || !Array.isArray(inp.blocks)) fail("Nothing to save.");
  if (JSON.stringify(inp).length > 400000) fail("This email is too large to save.");
  let id = String(inp.id ?? ""); if (!/^[a-z0-9]{6,20}$/.test(id)) id = randomBytes(6).toString("hex");
  const blocks = (inp.blocks as unknown[]).filter((b) => b && typeof b === "object");
  const r = (await withSchool((q) => q<{ updated: string }>(`insert into newsletter_emails (id, school_id, name, subject, preheader, template, blocks, updated_by)
    values ($1, current_school(), $2, $3, $4, $5, $6::jsonb, $7)
    on conflict (id) do update set name = excluded.name, subject = excluded.subject, preheader = excluded.preheader, template = excluded.template, blocks = excluded.blocks, updated_at = now(), updated_by = excluded.updated_by
    returning updated_at::text as updated`, [id, String(inp.name ?? "").slice(0, 120), String(inp.subject ?? "").slice(0, 200), String(inp.preheader ?? "").slice(0, 250), String(inp.template ?? "").slice(0, 30), JSON.stringify(blocks), by])))[0];
  return { ok: true, id, updated: r.updated };
}
export const deleteEmail = (id: string) => withSchool((q) => q(`delete from newsletter_emails where id = $1`, [id]));
export async function testSend(userId: string, myEmail: string, subject: string, html: string, me = true, extra: unknown = []): Promise<string[]> {
  const others = [...new Set((Array.isArray(extra) ? extra : []).map(normEmail).filter(Boolean))];
  const bad = others.find((e) => !validEmail(e)); if (bad) fail(`“${bad}” doesn’t look like an email address.`);
  if (others.length > 5) fail("Up to 5 other addresses for a test.");
  const to = [...new Set([...(me ? [normEmail(myEmail)] : []), ...others])];
  if (me && !validEmail(normEmail(myEmail))) fail("Your account has no email address.");
  if (!to.length) fail("Choose who gets the test.");
  if (!html || html.length > 600000) fail("Nothing to send.");
  const key = "tests:" + userId;
  const times = ((await kvGet<number[]>(key)) ?? []).filter((t) => t > Date.now() - 3600000);
  if (times.length >= 10) fail("That’s 10 tests this hour. Try again later.", 429);
  await kvSet(key, [...times, Date.now()]);
  const r = await sendHtml("[Test] " + subject.replace(/[\r\n]+/g, " ").slice(0, 150), html, to, "newsletter-test");
  if (!r.ok) fail("The test couldn’t be sent: " + (r.error ?? "") + " Use Download and open the file to check it instead.", 500);
  return to;
}
export async function sendEmail(b: Record<string, unknown>, by: string) {
  const c = await brevoCfg(); if (!brevoOn(c)) fail("Connect Brevo first.");
  if (await isTestMode()) fail("Test mode is on, so newsletters aren’t sent. Send yourself a test instead, or switch test mode off in Settings → Test mode.");
  const id = String(b.id ?? ""), html = String(b.html ?? ""), when = String(b.when ?? "");
  if (!html || html.length > 900000) fail("Nothing to send.");
  if (!html.includes("{{ unsubscribe }}")) fail("The email needs a footer with the unsubscribe link before it can be sent.");
  const doc = await getEmail(id);
  if (!doc.subject.trim()) fail("Add a subject line first.");
  if (doc.brevo?.campaignId && ["sent", "scheduled", "sending"].includes(doc.brevo.status)) fail(`This email has already been ${doc.brevo.status}. Duplicate it to send it again.`);
  // make sure Brevo has everyone who's on the list here
  await brevoSync().catch(() => {});
  let at: string | null = null;
  if (when && when !== "now") { const ts = Date.parse(when); if (!ts || ts < Date.now() + 300000) fail("Pick a time at least 5 minutes from now."); at = new Date(ts).toISOString(); }
  const day = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const body: Record<string, unknown> = { name: ((doc.name || doc.subject) + " · " + day).slice(0, 150), subject: doc.subject, sender: { name: c.senderName || (await schoolLook()).school, email: c.senderEmail }, ...(c.replyTo ? { replyTo: c.replyTo } : {}),
    htmlContent: html, recipients: { listIds: [Number(c.listId)] }, inlineImageActivation: false };
  if (doc.preheader) body.previewText = doc.preheader.slice(0, 200);
  if (at) body.scheduledAt = at;
  const r = await brevo("POST", "emailCampaigns", body);
  const cid = Number(r.id ?? 0); if (!cid) fail("Brevo didn’t create the campaign.");
  if (!at) await brevo("POST", `emailCampaigns/${cid}/sendNow`);
  const info: Brevo = { campaignId: cid, status: at ? "scheduled" : "sending", at: at ?? new Date().toISOString(), by };
  await withSchool((q) => q(`update newsletter_emails set brevo = $2::jsonb where id = $1`, [id, JSON.stringify(info)]));
  return { ok: true, brevo: info };
}
export async function cancelEmail(id: string) {
  const doc = await getEmail(id);
  const cid = doc.brevo?.campaignId; if (!cid || doc.brevo?.status !== "scheduled") fail("This email isn’t scheduled.");
  await brevo("PUT", `emailCampaigns/${cid}/status`, { status: "suspended" });
  await withSchool((q) => q(`update newsletter_emails set brevo = null where id = $1`, [id]));
}

// ---------- tracking and stats ----------
export async function recordEvent(kind: "o" | "c", emailId: string, sid: string, whoFallback: string, label: string) {
  if (!/^[a-z0-9]{6,20}$/.test(emailId)) return;
  const who = /^[A-Za-z0-9_-]{4,40}$/.test(sid) ? "s:" + sid : "i:" + whoFallback;
  await withSchool((q) => q(`insert into newsletter_events (school_id, email_id, kind, reader, link) values (current_school(), $1, $2, $3, $4)`,
    [emailId, kind, hashOf(who).slice(0, 12), label.replace(/[\x00-\x1F]/g, "").slice(0, 80)])).catch(() => {});
}
export async function emailStats() {
  const [emails, ev] = await Promise.all([
    withSchool((q) => q<{ id: string; name: string; subject: string; brevo: Brevo | null }>(`select id, name, subject, brevo from newsletter_emails`)),
    withSchool((q) => q<{ email_id: string; kind: string; reader: string; link: string; at: string }>(`select email_id, kind, reader, link, at::text from newsletter_events where at > now() - interval '400 days' order by at`)),
  ]);
  const names = new Map(emails.map((m) => [m.id, m]));
  type Agg = { opens: number; clicks: number; uo: Set<string>; uc: Set<string>; links: Map<string, { n: number; u: Set<string> }>; days: Map<string, { o: number; c: number }>; last: string };
  const agg = new Map<string, Agg>();
  for (const r of ev) {
    let a = agg.get(r.email_id); if (!a) agg.set(r.email_id, a = { opens: 0, clicks: 0, uo: new Set(), uc: new Set(), links: new Map(), days: new Map(), last: "" });
    const d = r.at.slice(0, 10); const day = a.days.get(d) ?? { o: 0, c: 0 }; a.days.set(d, day);
    if (r.kind === "o") { a.opens++; a.uo.add(r.reader); day.o++; }
    else { a.clicks++; a.uc.add(r.reader); a.uo.add(r.reader); day.c++; const l = a.links.get(r.link) ?? { n: 0, u: new Set<string>() }; l.n++; l.u.add(r.reader); a.links.set(r.link, l); }
    if (r.at > a.last) a.last = r.at;
  }
  const out: Record<string, unknown>[] = [];
  for (const [id, a] of agg) {
    const links = [...a.links].map(([l, v]) => ({ l, n: v.n, u: v.u.size })).sort((x, y) => y.u - x.u || y.n - x.n);
    const days = [...a.days].sort(([x], [y]) => x.localeCompare(y)).slice(-45).map(([d, v]) => ({ d, o: v.o, c: v.c }));
    out.push({ id, name: names.get(id)?.name ?? "", subject: names.get(id)?.subject ?? "", opens: a.opens, clicks: a.clicks, uopens: a.uo.size, uclicks: a.uc.size, links, days, last: a.last });
  }
  // Brevo's own figures for emails sent through it (cached for 10 minutes)
  const c = await brevoCfg();
  if (brevoOn(c)) {
    const cache = (await kvGet<Record<string, { at: number; status: string; sentDate: string; g: Record<string, number> }>>("brevo_stats")) ?? {};
    const byId = new Map(out.map((o, i) => [o.id as string, i]));
    for (const m of emails) {
      const cid = m.brevo?.campaignId; if (!cid || m.brevo?.status === "cancelled") continue;
      let hit = cache[cid];
      if (!hit || hit.at < Date.now() - 600000) {
        const r = await brevo("GET", `emailCampaigns/${cid}?statistics=globalStats`, null, true);
        if (!r.__error) { const g = r.statistics?.globalStats ?? {}; hit = { at: Date.now(), status: r.status ?? "", sentDate: r.sentDate ?? "", g: { sent: g.sent ?? 0, delivered: g.delivered ?? 0, opened: g.uniqueViews ?? 0, clicked: g.uniqueClicks ?? 0, bounced: (g.hardBounces ?? 0) + (g.softBounces ?? 0), unsubscribed: g.unsubscriptions ?? 0, complaints: g.complaints ?? 0 } }; cache[cid] = hit; }
      }
      if (!hit) continue;
      const row = { brevo: hit.g, brevoStatus: hit.status, sentDate: hit.sentDate };
      const i = byId.get(m.id);
      if (i !== undefined) Object.assign(out[i], row);
      else out.push({ id: m.id, name: m.name, subject: m.subject, opens: 0, clicks: 0, uopens: 0, uclicks: 0, links: [], days: [], last: hit.sentDate || m.brevo?.at || "", ...row });
      if (hit.status === "sent" && m.brevo?.status !== "sent") await withSchool((q) => q(`update newsletter_emails set brevo = jsonb_set(brevo, '{status}', '"sent"') where id = $1`, [m.id]));
    }
    await kvSet("brevo_stats", cache);
  }
  out.sort((x, y) => String(y.last).localeCompare(String(x.last)));
  return { campaigns: out, brevo: brevoOn(c) };
}
/** Where a tracked click may go: this site and our own social pages only. */
export function clickTarget(u: string, base: string): string {
  try {
    const url = new URL(u); const h = url.hostname.toLowerCase();
    const own = new URL(base).hostname.toLowerCase();
    const ok = [own, "ohsoed.co.uk", "www.ohsoed.co.uk", "www.facebook.com", "facebook.com", "www.linkedin.com", "linkedin.com", "www.tutorsandexams.uk"];
    return url.protocol === "https:" && ok.includes(h) ? url.toString() : base + "/";
  } catch { return base + "/"; }
}
