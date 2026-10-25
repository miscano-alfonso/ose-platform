import "server-only";
import { withSchool } from "./db";

// Sending email through Brevo (transactional API). Needs BREVO_API_KEY and a sender verified in Brevo.
export const emailReady = () => !!(process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL);
const SENDER = () => ({ email: process.env.BREVO_SENDER_EMAIL!, name: process.env.BREVO_SENDER_NAME || "OH-SO ED" });

export type Recipient = { name: string; email: string };
export type Audience = { value: string; label: string };

export async function audiences(): Promise<Audience[]> {
  return withSchool(async (q) => {
    const groups = await q<{ id: string; label: string }>(`select g.id, l.name || ' ' || sj.name || ' (' || g.code || ')' as label from course_groups g
      join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id join academic_years y on y.id = g.academic_year_id
      where y.ends_on >= current_date and exists (select 1 from enrolments e where e.group_id = g.id and e.status = 'active') order by l.sort_order, sj.name`);
    const levels = await q<{ id: string; name: string }>(`select id, name from levels order by sort_order`);
    return [{ value: "families", label: "All current families" }, ...levels.map((l) => ({ value: `level:${l.id}`, label: `${l.name} families` })),
      ...groups.map((g) => ({ value: `class:${g.id}`, label: g.label })), { value: "teachers", label: "All teachers" }];
  });
}

/** Who an audience reaches: account holders, plus a second guardian who asked for school emails. One email per address. */
export async function recipients(audience: string): Promise<Recipient[]> {
  return withSchool(async (q) => {
    if (audience === "marketing") return q<Recipient>(`select distinct on (lower(email)) name, email::text from marketing_audience order by lower(email)`);
    if (audience === "teachers") return q<Recipient>(`select u.name, u.email::text from teachers t join users u on u.id = t.user_id where t.archived_at is null`);
    const [kind, id] = audience.split(":");
    const where = kind === "class" ? "g.id = $1::uuid" : kind === "level" ? "g.level_id = $1::uuid" : "true";
    return q<Recipient>(`select distinct on (lower(p.email)) p.first_name || ' ' || p.last_name as name, p.email::text
      from parents p join students s on s.parent_id = p.id join enrolments e on e.student_id = s.id join course_groups g on g.id = e.group_id
      join academic_years y on y.id = g.academic_year_id
      where e.status = 'active' and not e.is_taster and y.ends_on >= current_date and ${where} order by lower(p.email)`, kind === "class" || kind === "level" ? [id] : []);
  });
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
function html(body: string, marketing: boolean) {
  const paras = body.trim().split(/\n\s*\n/).map((p) => `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  const foot = marketing ? "You’re receiving this because you agreed to hear from OH-SO ED. To stop these emails, reply with UNSUBSCRIBE." : "OH-SO ED Online School";
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#171b2b;max-width:600px">
    <div style="background:#0f1747;color:#fff;padding:14px 18px;font-weight:bold;letter-spacing:.04em">OH–SO ED</div>
    <div style="padding:18px">${paras}</div><div style="padding:0 18px 18px;font-size:12px;color:#5c6378">${foot}</div></div>`;
}

/** Sends one email per recipient (nobody sees anyone else's address), in batches. Returns how many were accepted by Brevo. */
export async function sendBatch(subject: string, body: string, to: Recipient[], marketing: boolean): Promise<{ sent: number; failed: number; error?: string }> {
  if (!emailReady()) return { sent: 0, failed: to.length, error: "Brevo isn’t connected yet." };
  let sent = 0, failed = 0, error: string | undefined;
  for (let i = 0; i < to.length; i += 500) {
    const chunk = to.slice(i, i + 500);
    const res = await fetch(process.env.BREVO_API_URL || "https://api.brevo.com/v3/smtp/email", {
      method: "POST", headers: { "api-key": process.env.BREVO_API_KEY!, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ sender: SENDER(), subject, htmlContent: html(body, marketing), textContent: body,
        messageVersions: chunk.map((r) => ({ to: [{ email: r.email, name: r.name }] })), tags: [marketing ? "marketing" : "admin-message"] }),
    }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }) as Response);
    if (res.ok) sent += chunk.length; else { failed += chunk.length; error = `Brevo said ${res.status}: ${(await res.text()).slice(0, 200)}`; }
  }
  return { sent, failed, error };
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
