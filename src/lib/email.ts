import "server-only";
import { gate } from "./test-mode";
import { isDemoSchool, withSchool } from "./db";
import { emailHtml, defaultFooter, type EmailDesign } from "./email-layout";
import { siteBase } from "./social";

// Sending email through Brevo (transactional API). The account is either set in the environment (BREVO_API_KEY and
// BREVO_SENDER_EMAIL) or connected in Admin → Newsletter (key and verified sender kept in the database).
type Creds = { key: string; email: string; name: string; replyTo?: string; copyTo?: string };
async function creds(): Promise<Creds | null> {
  if (await isDemoSchool()) return null;   // the demo school never sends email
  if (process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL) return { key: process.env.BREVO_API_KEY, email: process.env.BREVO_SENDER_EMAIL, name: process.env.BREVO_SENDER_NAME || "OH-SO ED", replyTo: process.env.BREVO_REPLY_TO || undefined, copyTo: process.env.BREVO_COPY_TO || undefined };
  const c = await withSchool((q) => q<{ value: { key?: string; senderEmail?: string; senderName?: string; replyTo?: string; copyTo?: string } }>(`select value from newsletter_kv where key = 'brevo'`)).then((r) => r[0]?.value).catch(() => undefined);
  return c?.key && c.senderEmail ? { key: c.key, email: c.senderEmail, name: c.senderName || "OH-SO ED", replyTo: c.replyTo || undefined, copyTo: c.copyTo || undefined } : null;
}
/** The name emails are sent from (shown in families' inboxes). */
export async function senderName(): Promise<string> { return (await creds())?.name ?? (await withSchool((q) => q<{ name: string }>(`select name from schools where id = current_school()`)))[0]?.name ?? "OH-SO ED"; }
/** True when email can be sent (Brevo set up in the environment, or connected under Newsletter). */
export const emailReady = async () => !!(await creds());
const SMTP_URL = () => process.env.BREVO_API_URL || (process.env.BREVO_API_BASE ? process.env.BREVO_API_BASE.replace(/\/?$/, "/") + "smtp/email" : "https://api.brevo.com/v3/smtp/email");

export type Recipient = { name: string; email: string };

/** "Keep a copy": ONE copy of each send goes to the copy address (e.g. ose@), saying who it went to, however many people it was sent to.
 *  Newsletters are not copied (they have their own stats). A failed copy never affects the real send. */
async function keepCopy(c: Creds, subject: string, htmlContent: string, textContent: string, to: { email: string; name?: string }[], note?: string) {
  if (!c.copyTo || !to.length) return;
  const copies = c.copyTo.split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean).slice(0, 5); if (!copies.length) return;
  const others = to.filter((r) => !copies.includes(r.email.toLowerCase())); if (!others.length) return;
  const shown = others.slice(0, 40).map((r) => r.name ? `${r.name} <${r.email}>` : r.email);
  const who = `Sent to ${others.length === 1 ? shown[0] : `${others.length} people: ${shown.join(", ")}${others.length > 40 ? ` and ${others.length - 40} more` : ""}`}${note ? ` · ${note}` : ""}`;
  const banner = `<div style="font:13px/1.4 Arial,sans-serif;background:#fff6d6;border:1px solid #e3cd4b;color:#5a4a00;padding:10px 14px;margin:0 0 14px">Copy for your records. ${who.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]!))}</div>`;
  await fetch(SMTP_URL(), {
    method: "POST", headers: { "api-key": c.key, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sender: { email: c.email, name: c.name }, messageVersions: copies.map((email) => ({ to: [{ email }] })), subject: `[Sent] ${subject}`.slice(0, 250),
      htmlContent: banner + htmlContent, textContent: `Copy for your records. ${who}\n\n${textContent}`, tags: ["copy"] }),
  }).catch(() => undefined);
}

/** Test mode: a copy of each held email goes to the monitoring address (e.g. testing@), marked with who it was for. */
async function monitorCopies(c: Creds, mon: string | null, copy: { email: string; name?: string }[], subject: string, htmlContent: string, textContent: string, tag: string, scheduledAt?: string) {
  if (!mon || !copy.length) return;
  const e = (x: string) => x.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]!));
  for (const r of copy) {
    const who = r.name ? `${r.name} <${r.email}>` : r.email;
    const banner = `<div style="font:13px/1.45 Arial,sans-serif;background:#e8f0ff;border:1px solid #9db5f0;color:#14306e;padding:10px 14px;margin:0 0 14px"><b>Test mode: not sent.</b> This would have gone to ${e(who)} (${e(tag)}). Nobody else received it.</div>`;
    await fetch(SMTP_URL(), {
      method: "POST", headers: { "api-key": c.key, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ sender: { email: c.email, name: c.name }, messageVersions: [{ to: [{ email: mon }] }], subject: `[Test → ${r.name || r.email}] ${subject}`.slice(0, 250),
        htmlContent: banner + htmlContent, textContent: `Test mode: not sent. This would have gone to ${who} (${tag}).\n\n${textContent}`, tags: ["test-mode-copy", tag], ...(scheduledAt ? { scheduledAt } : {}) }),
    }).catch(() => undefined);
  }
}
export type Audience = { value: string; label: string; group?: string };

export async function audiences(): Promise<Audience[]> {
  return withSchool(async (q) => {
    const groups = await q<{ id: string; label: string }>(`select g.id, l.name || ' ' || sj.name || ' (' || g.code || ')' as label from course_groups g
      join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id join academic_years y on y.id = g.academic_year_id
      where y.ends_on >= current_date and exists (select 1 from enrolments e where e.group_id = g.id and e.status = 'active') order by l.sort_order, sj.name`);
    const levels = await q<{ id: string; name: string }>(`select id, name from levels order by sort_order`);
    return [{ value: "families", label: "All enrolled parents", group: "Everyone" }, { value: "students", label: "All enrolled students (their Google accounts)", group: "Everyone" },
      { value: "everyone", label: "All enrolled parents and students", group: "Everyone" },
      ...levels.map((l) => ({ value: `level:${l.id}`, label: `${l.name} parents`, group: "By level" })),
      ...groups.map((g) => ({ value: `class:${g.id}`, label: `${g.label} · parents`, group: "A class: parents" })),
      ...groups.map((g) => ({ value: `classstu:${g.id}`, label: `${g.label} · students`, group: "A class: students" })),
      { value: "waiting", label: "Waiting list" }, { value: "enquiries", label: "Enquired, not booked" }, { value: "lowatt", label: "Parents: attendance below 50% this term" }, { value: "twocourses", label: "Parents: a child on 2 courses (a third gives 10% off)" },
      { value: "oneoff", label: "1:1 and workshop families, no course" }, { value: "teachers", label: "All teachers" }];
  });
}

/** Who an audience reaches: account holders, plus a second guardian who asked for school emails. One email per address. */
export async function recipients(audience: string): Promise<Recipient[]> {
  return withSchool(async (q) => {
    if (audience === "marketing") return q<Recipient>(`select distinct on (lower(email)) name, email::text from marketing_audience order by lower(email)`);
    if (audience === "teachers") return q<Recipient>(`select u.name, u.email::text from teachers t join users u on u.id = t.user_id where t.archived_at is null`);
    if (audience === "students") return q<Recipient>(`select distinct on (lower(s.email)) s.first_name || ' ' || s.last_name as name, s.email::text from students s join enrolments e on e.student_id = s.id
      join course_groups g on g.id = e.group_id join academic_years y on y.id = g.academic_year_id where e.status = 'active' and not e.is_taster and y.ends_on >= current_date and s.email is not null order by lower(s.email)`);
    if (audience === "everyone") {
      const seen = new Set<string>(), out: Recipient[] = [];
      for (const r of [...await recipients("families"), ...await recipients("students")]) if (!seen.has(r.email.toLowerCase())) { seen.add(r.email.toLowerCase()); out.push(r); }
      return out;
    }
    if (audience.startsWith("classstu:")) return q<Recipient>(`select distinct on (lower(s.email)) s.first_name || ' ' || s.last_name as name, s.email::text from students s join enrolments e on e.student_id = s.id
      where e.group_id = $1::uuid and e.status = 'active' and not e.is_taster and s.email is not null order by lower(s.email)`, [audience.slice(9)]);
    if (audience === "waiting") return q<Recipient>(`select distinct on (lower(email)) parent_name as name, email::text from waitlist_entries where enrolled_at is null order by lower(email)`);
    if (audience === "enquiries") return q<Recipient>(`select distinct on (lower(q.email)) q.name, q.email::text from enquiries q where q.created_at > now() - interval '12 months'
      and not exists (select 1 from parents p join students s on s.parent_id = p.id join enrolments e on e.student_id = s.id where p.email = q.email and e.status = 'active') order by lower(q.email)`);
    if (audience === "twocourses") return q<Recipient>(`select distinct on (lower(p.email)) p.first_name || ' ' || p.last_name as name, p.email::text from parents p join students s on s.parent_id = p.id
      where (select count(*) from enrolments e join course_groups g on g.id = e.group_id join academic_years y on y.id = g.academic_year_id
        where e.student_id = s.id and e.status = 'active' and not e.is_taster and y.ends_on >= current_date) = 2 order by lower(p.email)`);
    if (audience === "lowatt") return q<Recipient>(`select distinct on (lower(p.email)) p.first_name || ' ' || p.last_name as name, p.email::text from student_term_attendance a join students s on s.id = a.student_id
      join parents p on p.id = s.parent_id where a.term_id = (select id from terms where current_date between starts_on and ends_on limit 1) and a.attendance_pct < 50 order by lower(p.email)`);
    if (audience === "oneoff") return q<Recipient>(`select distinct on (lower(p.email)) p.first_name || ' ' || p.last_name as name, p.email::text from parents p
      where (exists (select 1 from tutoring_bookings b where b.parent_id = p.id) or exists (select 1 from workshop_bookings w where w.parent_id = p.id))
        and not exists (select 1 from students s join enrolments e on e.student_id = s.id where s.parent_id = p.id and e.status = 'active') order by lower(p.email)`);
    const [kind, id] = audience.split(":");
    const where = kind === "class" ? "g.id = $1::uuid" : kind === "level" ? "g.level_id = $1::uuid" : "true";
    return q<Recipient>(`select distinct on (lower(p.email)) p.first_name || ' ' || p.last_name as name, p.email::text
      from parents p join students s on s.parent_id = p.id join enrolments e on e.student_id = s.id join course_groups g on g.id = e.group_id
      join academic_years y on y.id = g.academic_year_id
      where e.status = 'active' and not e.is_taster and y.ends_on >= current_date and ${where} order by lower(p.email)`, kind === "class" || kind === "level" ? [id] : []);
  });
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
/** The school's email design (logo, colour, footer), with defaults from the school and its website. */
export async function emailDesign(): Promise<EmailDesign & { saved: boolean }> {
  const [row, sc, base] = await Promise.all([
    withSchool((q) => q<{ value: Partial<EmailDesign> }>(`select value from meet_kv where key = 'email_design'`)).then((r) => r[0]?.value ?? null).catch(() => null),
    withSchool((q) => q<{ name: string; brand: { primary?: string } }>(`select name, brand from schools where id = current_school()`)).then((r) => r[0]),
    siteBase(),
  ]);
  const school = sc?.name ?? "OH-SO ED", site = (process.env.SITE_URL || base || "").replace(/\/$/, "");
  return { school, logo: row?.logo ?? true, color: row?.color || sc?.brand?.primary || "#0f1747", footer: row?.footer ?? defaultFooter(school, site),
    logoUrl: site ? `${site}/brand/logo` : "", saved: !!row };
}
export async function saveEmailDesign(d: { logo: boolean; color: string; footer: string }) {
  await withSchool((q) => q(`insert into meet_kv (school_id, key, value) values (current_school(), 'email_design', $1) on conflict (school_id, key) do update set value = excluded.value, updated_at = now()`,
    [JSON.stringify({ logo: d.logo, color: /^#[0-9a-f]{6}$/i.test(d.color) ? d.color : "#0f1747", footer: d.footer.slice(0, 1000) })]));
}
const html = async (body: string, marketing: boolean) => emailHtml(body, marketing, await emailDesign());

/** Sends one email per recipient (nobody sees anyone else's address), in batches. Returns how many were accepted by Brevo. */
export async function sendBatch(subject: string, body: string, to: Recipient[], marketing: boolean): Promise<{ sent: number; failed: number; error?: string; held?: number }> {
  const c = await creds();
  if (!c) return { sent: 0, failed: to.length, error: "Brevo isn’t connected yet." };
  const g = await gate(to, { subject, body, tag: marketing ? "marketing" : "admin-message" });
  to = g.send;
  await monitorCopies(c, g.monitor, g.copy, subject, await html(body, marketing), body, marketing ? "marketing" : "admin-message");
  let sent = 0, failed = 0, error: string | undefined;
  for (let i = 0; i < to.length; i += 500) {
    const chunk = to.slice(i, i + 500);
    const res = await fetch(SMTP_URL(), {
      method: "POST", headers: { "api-key": c.key, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ sender: { email: c.email, name: c.name }, ...(c.replyTo ? { replyTo: { email: c.replyTo } } : {}), subject, htmlContent: await html(body, marketing), textContent: body,
        messageVersions: chunk.map((r) => ({ to: [{ email: r.email, name: r.name }] })), tags: [marketing ? "marketing" : "admin-message"] }),
    }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }) as Response);
    if (res.ok) sent += chunk.length; else { failed += chunk.length; error = `Brevo said ${res.status}: ${(await res.text()).slice(0, 200)}`; }
  }
  if (sent) await keepCopy(c, subject, await html(body, marketing), body, to, failed ? `${failed} failed` : undefined);
  return { sent, failed, error, held: g.held.length };
}

export async function logCampaign(actorId: string, d: { kind: string; audience: string; label: string; subject: string; body: string; recipients: number; sent: number; failed: number; error?: string }) {
  await withSchool((q) => q(`insert into email_campaigns (school_id, kind, audience, audience_label, subject, body, recipients, sent, failed, error, sent_by)
    values (current_school(), $1, $2, $3, $4, $5, $6::int, $7::int, $8::int, $9, $10)`, [d.kind, d.audience, d.label, d.subject, d.body, d.recipients, d.sent, d.failed, d.error ?? null, actorId]));
}

export async function history(kind: string) {
  return withSchool((q) => q<{ id: string; created_at: string; audience_label: string; subject: string; recipients: number; sent: number; failed: number; error: string | null; by: string | null }>(`
    select c.id, c.created_at::text, c.audience_label, c.subject, c.recipients, c.sent, c.failed, c.error, u.name as by
    from email_campaigns c left join users u on u.id = c.sent_by where c.kind = $1 order by c.created_at desc limit 50`, [kind]));
}

/** Sends a ready-made HTML email (one per address). Used by Social's weekly report. */
export async function sendHtml(subject: string, htmlContent: string, to: string[], tag?: string): Promise<{ ok: boolean; error?: string; held?: number }> {
  const c = await creds();
  if (!c) return { ok: false, error: "Brevo isn’t connected yet." };
  if (!to.length) return { ok: false, error: "No one to send it to." };
  const textContent0 = htmlContent.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
  const g = await gate(to.map((email) => ({ email })), { subject, body: textContent0, tag: tag || "social-report" });
  to = g.send.map((r) => r.email);
  await monitorCopies(c, g.monitor, g.copy, subject, htmlContent, textContent0, tag || "social-report");
  if (!to.length) return { ok: true, held: g.held.length };
  const textContent = htmlContent.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim().slice(0, 5000);
  const res = await fetch(SMTP_URL(), {
    method: "POST", headers: { "api-key": c.key, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sender: { email: c.email, name: c.name }, ...(c.replyTo ? { replyTo: { email: c.replyTo } } : {}), subject, htmlContent, textContent, messageVersions: to.map((email) => ({ to: [{ email }] })), tags: [tag || "social-report"] }),
  }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }) as Response);
  if (res.ok && tag !== "newsletter-test" && tag !== "edtech-trial") await keepCopy(c, subject, htmlContent, textContent, to.map((email) => ({ email })));   // tests aren’t copied
  return res.ok ? { ok: true } : { ok: false, error: `Brevo said ${res.status}: ${(await res.text()).slice(0, 200)}` };
}

/** One email (to one or more people, each sent separately), optionally scheduled with Brevo up to 72 hours ahead. Returns Brevo's message id(s). */
export async function sendOne(to: Recipient[], subject: string, body: string, opts: { tag: string; scheduledAt?: string } ): Promise<{ ok: boolean; ids: string[]; error?: string; held?: number }> {
  const c = await creds();
  if (!c) return { ok: false, ids: [], error: "Brevo isn’t connected yet." };
  if (!to.length) return { ok: false, ids: [], error: "No one to send it to." };
  const g = await gate(to, { subject, body, tag: opts.tag });
  to = g.send;
  await monitorCopies(c, g.monitor, g.copy, subject, await html(body, false), body, opts.tag, opts.scheduledAt);
  if (!to.length) return { ok: true, ids: [], held: g.held.length };
  const res = await fetch(SMTP_URL(), {
    method: "POST", headers: { "api-key": c.key, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sender: { email: c.email, name: c.name }, ...(c.replyTo ? { replyTo: { email: c.replyTo } } : {}), subject, htmlContent: await html(body, false), textContent: body,
      messageVersions: to.map((r) => ({ to: [{ email: r.email, name: r.name }] })), tags: [opts.tag], ...(opts.scheduledAt ? { scheduledAt: opts.scheduledAt } : {}) }),
  }).catch((e) => ({ ok: false, status: 0, text: async () => String(e), json: async () => ({}) }) as Response);
  if (!res.ok) return { ok: false, ids: [], error: `Brevo said ${res.status}: ${(await res.text()).slice(0, 200)}` };
  const j = await res.json().catch(() => ({})) as { messageId?: string; messageIds?: string[] };
  await keepCopy(c, subject, await html(body, false), body, to, opts.scheduledAt ? `scheduled for ${new Date(opts.scheduledAt).toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" })}` : undefined);
  return { ok: true, ids: j.messageIds ?? (j.messageId ? [j.messageId] : []) };
}
/** Cancels an email scheduled with Brevo (e.g. the lesson was cancelled). */
export async function cancelScheduled(messageId: string): Promise<boolean> {
  const c = await creds(); if (!c) return false;
  const base = SMTP_URL();
  const r = await fetch(`${base}/${encodeURIComponent(messageId)}`, { method: "DELETE", headers: { "api-key": c.key, accept: "application/json" } }).catch(() => null);
  return !!r && (r.status === 204 || r.ok);
}
