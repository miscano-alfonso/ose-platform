import "server-only";
import { withSchool } from "./db";

// Admin → Data protection, as in the prototype: rights requests (one month to reply), who viewed sensitive data,
// the retention schedule, the breach log and the suppliers that process personal data.
const KINDS = ["access", "erasure", "rectification", "restriction", "objection", "portability"];
export type PrivReq = { id: string; parent_id: string | null; family: string | null; email: string; kind: string; detail: string | null; received: string; due: string; status: string; outcome: string | null };
export type AccessRow = { at: string; who: string | null; what: string; student: string | null; reason: string | null };
export type Retention = { data_kind: string; keep_months: number; after_event: string };
export type Breach = { id: string; found: string; what: string; data: string; risk: string; ico: string | null; told: string | null; closed: string | null };
export type Processor = { id: string; name: string; purpose: string; data: string; location: string; safeguard: string | null; dpa: string | null };

export async function privacyOverview() {
  return withSchool(async (q) => {
    const has = (await q<{ n: number }>(`select count(*)::int as n from retention_policies`))[0].n;
    if (!has) await q(`select default_retention(current_school())`).catch(() => null);
    return {
      requests: await q<PrivReq>(`select r.id, r.parent_id, p.first_name || ' ' || p.last_name as family, r.requester_email::text as email, r.kind, r.detail, r.received_at::date::text as received,
          coalesce(r.extended_to, r.due_on)::text as due, r.status, r.outcome from privacy_requests r left join parents p on p.id = r.parent_id order by r.status <> 'open', coalesce(r.extended_to, r.due_on)`),
      access: await q<AccessRow>(`select to_char(a.viewed_at at time zone 'Europe/London', 'DD Mon HH24:MI') as at, u.name as who, a.what, s.first_name || ' ' || s.last_name as student, a.reason
        from sensitive_access_log a left join users u on u.id = a.viewer_user_id left join students s on s.id = a.student_id order by a.viewed_at desc limit 60`),
      accessCount: (await q<{ n: number }>(`select count(*)::int as n from sensitive_access_log`))[0].n,
      retention: await q<Retention>(`select data_kind, keep_months, after_event from retention_policies order by keep_months, data_kind`),
      breaches: await q<Breach>(`select id, found_at::date::text as found, what_happened as what, data_involved as data, risk, reported_to_ico_at::date::text as ico, people_told_at::date::text as told, closed_at::date::text as closed
        from data_breaches order by found_at desc`),
      processors: await q<Processor>(`select id, name, purpose, data, location, transfer_safeguard as safeguard, dpa_signed_on::text as dpa from processors order by name`),
      families: await q<{ id: string; name: string; email: string }>(`select id, first_name || ' ' || last_name as name, email::text from parents order by last_name, first_name`),
    };
  });
}
const audit = (q: (s: string, p?: unknown[]) => Promise<unknown>, actor: string, action: string, entity: string, id: string | null, d: unknown = {}) =>
  q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, $2, $3, $4, $5)`, [actor, action, entity, id, JSON.stringify(d)]);

export async function addRequest(actorId: string, parentId: string | null, email: string, kind: string, detail: string | null): Promise<string | null> {
  if (!KINDS.includes(kind)) return "Choose the kind of request.";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return "Enter the requester’s email.";
  return withSchool(async (q) => {
    const r = await q<{ id: string }>(`insert into privacy_requests (school_id, parent_id, requester_email, kind, detail) values (current_school(), $1, $2, $3, $4) returning id`, [parentId, email, kind, detail]);
    await audit(q, actorId, "add", "privacy_request", r[0].id, { kind });
    return null;
  });
}
export async function closeRequest(actorId: string, id: string, status: "done" | "refused", outcome: string | null) {
  await withSchool(async (q) => {
    await q(`update privacy_requests set status = $2, outcome = coalesce($3, outcome), completed_at = now() where id = $1`, [id, status, outcome]);
    await audit(q, actorId, status, "privacy_request", id, { outcome });
  });
}
export async function exportFamily(actorId: string, parentId: string): Promise<unknown> {
  return withSchool(async (q) => {
    const r = await q<{ d: unknown }>(`select export_family_data($1, $2) as d`, [parentId, actorId]);
    await audit(q, actorId, "export", "parent", parentId);
    return r[0]?.d ?? null;
  });
}
export async function eraseFamily(actorId: string, requestId: string): Promise<string | null> {
  try {
    return await withSchool(async (q) => {
      const r = (await q<{ parent_id: string | null }>(`select parent_id from privacy_requests where id = $1 and kind = 'erasure' and status = 'open'`, [requestId]))[0];
      if (!r?.parent_id) return "That request isn’t linked to a family.";
      await q(`select erase_family($1, $2)`, [r.parent_id, requestId]);
      await q(`update privacy_requests set status = 'done', outcome = 'Family erased; payment records kept without names for six years', completed_at = now() where id = $1`, [requestId]);
      await audit(q, actorId, "erase", "parent", r.parent_id);
      return null;
    });
  } catch (e) { const m = (e as Error).message; return m.includes("active") ? "This family still has active courses. Erasure waits until they end." : m.includes("owed") ? "This family still owes money. Erasure waits until it’s settled." : "Couldn’t erase this family."; }
}
export async function runRetentionNow(actorId: string) {
  return withSchool(async (q) => {
    const r = await q<{ data_kind: string; removed: number }>(`select * from run_retention(current_school())`);
    await audit(q, actorId, "run", "retention", null, r);
    return r.reduce((a, x) => a + x.removed, 0);
  });
}
export async function setRetention(actorId: string, kind: string, months: number) {
  await withSchool(async (q) => { await q(`update retention_policies set keep_months = $2 where data_kind = $1`, [kind, Math.max(0, Math.min(240, Math.round(months)))]); await audit(q, actorId, "set", "retention", null, { kind, months }); });
}
export async function addBreach(actorId: string, what: string, data: string, risk: string, people: number | null): Promise<string | null> {
  if (!what || !data) return "Say what happened and what data was involved.";
  if (!["unlikely", "risk", "high_risk"].includes(risk)) return "Choose the risk.";
  return withSchool(async (q) => {
    const r = await q<{ id: string }>(`insert into data_breaches (school_id, found_at, what_happened, data_involved, people_affected, risk) values (current_school(), now(), $1, $2, $3, $4) returning id`, [what, data, people, risk]);
    await audit(q, actorId, "add", "data_breach", r[0].id, { risk });
    return null;
  });
}
export async function breachStep(actorId: string, id: string, step: "ico" | "told" | "closed") {
  const col = { ico: "reported_to_ico_at", told: "people_told_at", closed: "closed_at" }[step];
  await withSchool(async (q) => { await q(`update data_breaches set ${col} = coalesce(${col}, now()) where id = $1`, [id]); await audit(q, actorId, step, "data_breach", id); });
}
const USUAL: [string, string, string, string, string][] = [
  ["Vercel", "Hosting the website and admin", "Everything shown on the site", "USA / EU", "UK Extension to the EU-US Data Privacy Framework"],
  ["Neon", "The database", "Families, students, bookings, payments, attendance", "EU (London region where chosen)", "UK IDTA / DPF"],
  ["Stripe", "Card payments", "Parent name, email, card (held by Stripe)", "EU / USA", "UK Extension to the EU-US DPF"],
  ["Brevo", "Emails and the newsletter", "Names and email addresses", "EU (France)", "UK adequacy (EU)"],
  ["Google Workspace", "Classroom, Meet, school email", "Students’ Google accounts, class work, Meet attendance", "EU / USA", "Google Cloud data processing terms"],
  ["Anthropic", "The admin Assistant and Social writing", "Questions typed by staff; school data the Assistant looks up", "USA", "Anthropic data processing addendum"],
];
export async function addProcessor(actorId: string, p: { name: string; purpose: string; data: string; location: string; safeguard: string | null; dpa: string | null } | "usual"): Promise<void> {
  await withSchool(async (q) => {
    const list = p === "usual" ? USUAL.map(([name, purpose, data, location, safeguard]) => ({ name, purpose, data, location, safeguard, dpa: null as string | null })) : [p];
    for (const x of list) {
      if (p === "usual" && (await q(`select 1 from processors where lower(name) = lower($1)`, [x.name])).length) continue;
      await q(`insert into processors (school_id, name, purpose, data, location, transfer_safeguard, dpa_signed_on) values (current_school(), $1, $2, $3, $4, $5, $6::date)`, [x.name, x.purpose, x.data, x.location, x.safeguard, x.dpa]);
    }
    await audit(q, actorId, "add", "processors", null, { n: list.length });
  });
}
export async function setDpa(actorId: string, id: string, on: string | null) {
  await withSchool(async (q) => { await q(`update processors set dpa_signed_on = $2::date where id = $1`, [id, on]); await audit(q, actorId, "dpa", "processor", id, { on }); });
}
