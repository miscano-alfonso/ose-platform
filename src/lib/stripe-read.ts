import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { withSchool } from "./db";

// Read-only Stripe. The site never charges, refunds or changes anything in Stripe:
//  - it only accepts a RESTRICTED key (rk_…), which the school creates with Read permissions only, so Stripe itself
//    refuses any write; a full secret key (sk_…) is refused here;
//  - it only makes GET requests;
//  - Stripe's notifications (webhooks) are received and checked, never answered with any action.
// Card payments are mirrored into stripe_charges and matched to families' term instalments: exact matches can be
// applied automatically for new payments; the catch-up of past payments is shown to the admin to confirm first.
// Nothing here emails families.

type Q = <T = Record<string, unknown>>(s: string, p?: unknown[]) => Promise<T[]>;
const API = () => (process.env.STRIPE_API_URL || "https://api.stripe.com/v1").replace(/\/$/, "");
export type StripeCfg = { key?: string; webhookSecret?: string; at?: string; by?: string; account?: string; sync?: { at?: string; added?: number; error?: string }; auto?: boolean };

async function kv(q?: Q): Promise<StripeCfg> {
  const run = async (qq: Q) => (await qq<{ value: StripeCfg }>(`select value from meet_kv where key = 'stripe_read'`))[0]?.value ?? {};
  return q ? run(q) : withSchool(run);
}
async function kvPut(c: StripeCfg, q?: Q) {
  const run = (qq: Q) => qq(`insert into meet_kv (school_id, key, value) values (current_school(), 'stripe_read', $1) on conflict (school_id, key) do update set value = excluded.value, updated_at = now()`, [JSON.stringify(c)]);
  await (q ? run(q) : withSchool(run));
}
const keyOf = (c: StripeCfg) => process.env.STRIPE_READ_KEY || c.key || "";
const secretOf = (c: StripeCfg) => process.env.STRIPE_WEBHOOK_SECRET || c.webhookSecret || "";
export const isReadKey = (k: string) => /^rk_(live|test)_[A-Za-z0-9]{20,}$/.test(k);

async function sget<T>(key: string, path: string): Promise<T> {
  const r = await fetch(`${API()}${path}`, { method: "GET", headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(30000) });
  const j = await r.json().catch(() => ({})) as T & { error?: { message?: string; type?: string } };
  if (!r.ok) throw new Error(r.status === 401 ? "Stripe didn’t accept the key." : r.status === 403 ? `The key isn’t allowed to read this (${j.error?.message ?? "permission"}). Give it Read access to Charges, Customers and Payment Intents.` : `Stripe answered ${r.status}: ${j.error?.message ?? ""}`);
  return j;
}

export type StripeStatus = { connected: boolean; mode: "live" | "test" | null; fromEnv: boolean; at: string | null; by: string | null; account: string | null; webhook: boolean; sync: StripeCfg["sync"]; auto: boolean };
export async function stripeStatus(): Promise<StripeStatus> {
  const c = await kv(), k = keyOf(c);
  return { connected: !!k, mode: k ? (k.startsWith("rk_live_") ? "live" : "test") : null, fromEnv: !!process.env.STRIPE_READ_KEY, at: c.at ?? null, by: c.by ?? null,
    account: c.account ?? null, webhook: !!secretOf(c), sync: c.sync ?? {}, auto: c.auto !== false };
}
/** Save the restricted key (checked: it must be a read-only restricted key and able to read charges). */
export async function connectStripe(by: string, key: string, webhookSecret: string): Promise<string | null> {
  key = key.trim(); webhookSecret = webhookSecret.trim();
  const c = await kv();
  if (key) {
    if (/^sk_/.test(key)) return "That’s a full secret key (sk_…), which can move money. Create a restricted key (rk_…) with Read permissions only.";
    if (!isReadKey(key)) return "Paste a restricted key: it starts rk_live_ (or rk_test_ to try it out).";
    try {
      await sget(key, "/charges?limit=1");
      const acct = await sget<{ settings?: { dashboard?: { display_name?: string } }; business_profile?: { name?: string } }>(key, "/account").catch(() => null);
      c.account = acct?.settings?.dashboard?.display_name || acct?.business_profile?.name || undefined;
    } catch (e) { return (e as Error).message; }
    c.key = key; c.at = new Date().toISOString(); c.by = by;
  }
  if (webhookSecret) { if (!/^whsec_[A-Za-z0-9]{20,}$/.test(webhookSecret)) return "The signing secret starts whsec_."; c.webhookSecret = webhookSecret; }
  await kvPut(c);
  return null;
}
export async function disconnectStripe() { const c = await kv(); delete c.key; delete c.webhookSecret; delete c.account; await kvPut(c); }
export async function setStripeAuto(on: boolean) { const c = await kv(); c.auto = on; await kvPut(c); }

type Charge = { id: string; payment_intent?: string | null; created: number; amount: number; amount_refunded: number; currency: string; status: string; description?: string | null;
  receipt_email?: string | null; billing_details?: { email?: string | null }; customer?: string | { id: string; email?: string | null } | null };
async function saveCharge(q: Q, ch: Charge) {
  const cust = typeof ch.customer === "object" && ch.customer ? ch.customer : null;
  const email = (ch.billing_details?.email || ch.receipt_email || cust?.email || "").toLowerCase() || null;
  const parent = email ? (await q<{ id: string }>(`select id from parents where email = $1 union select parent_id from guardians where email = $1 limit 1`, [email]))[0]?.id ?? null : null;
  const r = await q(`insert into stripe_charges (id, school_id, payment_intent, created_at, amount_pence, refunded_pence, currency, status, email, customer, description, parent_id)
      values ($1, current_school(), $2, to_timestamp($3), $4, $5, $6, $7, $8, $9, $10, $11)
    on conflict (id) do update set refunded_pence = excluded.refunded_pence, status = excluded.status, email = coalesce(excluded.email, stripe_charges.email),
      parent_id = coalesce(stripe_charges.parent_id, excluded.parent_id), synced_at = now() returning (xmax = 0) as added`,
    [ch.id, ch.payment_intent ?? null, ch.created, ch.amount, ch.amount_refunded ?? 0, ch.currency, ch.status, email, cust?.id ?? (typeof ch.customer === "string" ? ch.customer : null), ch.description?.slice(0, 300) ?? null, parent]);
  return (r[0] as { added?: boolean } | undefined)?.added ?? false;
}

/** Copy card payments from Stripe (read only): from the start of the school year, or since the last copy. */
export async function syncStripe(): Promise<{ added: number; error?: string }> {
  const c = await kv(), key = keyOf(c);
  if (!key) return { added: 0, error: "Connect Stripe first." };
  if (!isReadKey(key)) return { added: 0, error: "Only a restricted read-only key (rk_…) can be used." };
  let added = 0;
  try {
    await withSchool(async (q) => {
      const y = (await q<{ s: string }>(`select extract(epoch from (min(starts_on) - interval '120 days'))::bigint::text as s from academic_years where ends_on >= current_date`))[0]?.s;
      const since = c.sync?.at && !c.sync.error ? Math.floor(Date.parse(c.sync.at) / 1000) - 3 * 86400 : Number(y ?? Math.floor(Date.now() / 1000) - 400 * 86400);
      let after = "", expand = "&expand[]=data.customer";
      for (let i = 0; i < 40; i++) {
        let page: { data: Charge[]; has_more: boolean };
        try { page = await sget(key, `/charges?limit=100&created[gte]=${since}${expand}${after ? `&starting_after=${after}` : ""}`); }
        catch (e) {
          // without Customers access, read the charges alone: the email on the payment itself is used instead
          if (!expand || !/customer_read|Customers Read/i.test((e as Error).message)) throw e;
          expand = ""; i--; continue;
        }
        for (const ch of page.data) if (await saveCharge(q, ch)) added++;
        if (!page.has_more || !page.data.length) break;
        after = page.data[page.data.length - 1].id;
      }
    });
    c.sync = { at: new Date().toISOString(), added }; await kvPut(c);
    return { added };
  } catch (e) { c.sync = { at: new Date().toISOString(), error: (e as Error).message }; await kvPut(c); return { added, error: (e as Error).message }; }
}

// ---------- matching payments to terms ----------
// A payment belongs to the term whose payment date is nearest to when it was paid (a term isn't paid months early),
// with the same total. If that term is already recorded as paid (e.g. TechSaga's paid terms, set when the schedules
// were made), the payment is only linked to it: nothing changes. Several terms together (a full year) also match.
type TermRow = { term_id: string; number: number; name: string; due_on: string; total: number; open_ids: string[]; paid: boolean };
async function yearTerms(q: Q, parentId: string): Promise<TermRow[]> {
  return q<TermRow>(`select i.term_id, t.number, t.name, min(i.due_on)::text as due_on, sum(i.amount_pence)::int as total,
      coalesce(array_agg(i.id) filter (where i.status in ('scheduled', 'failed') and i.stripe_payment_intent_id is null), '{}') as open_ids,
      bool_and(i.status in ('paid', 'part_refunded', 'waived') or i.stripe_payment_intent_id is not null) as paid
    from instalments i join enrolments e on e.id = i.enrolment_id join students s on s.id = e.student_id join terms t on t.id = i.term_id join academic_years y on y.id = t.academic_year_id
    where s.parent_id = $1 and y.ends_on >= current_date and i.status not in ('cancelled', 'refunded')
    group by i.term_id, t.number, t.name order by min(i.due_on)`, [parentId]);
}
const near = (a: number, b: number) => Math.abs(a - b) <= 2;   // pennies
const daysBetween = (due: string, paid: string) => Math.round((Date.parse(due + "T12:00:00Z") - Date.parse(paid)) / 864e5);
const dm = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
type Match = { terms: TermRow[]; already: boolean; why: string } | null;
/** The term(s) a payment was for, or null. `used`: terms already taken by other payments in this pass. */
function matchTerms(all: TermRow[], amount: number, paidAt: string, desc: string | null, used: Set<string>): Match {
  const terms = all.filter((t) => !used.has(t.term_id));
  const named = Number((desc ?? "").match(/\bterm\s*([1-6])\b/i)?.[1] ?? 0);
  // one term: same total, payment date no more than 6 weeks before its payment date (or any time after)
  const singles = terms.filter((t) => near(t.total, amount) && daysBetween(t.due_on, paidAt) <= 42)
    .sort((a, b) => (named ? Number(b.number === named) - Number(a.number === named) : 0) || Math.abs(daysBetween(a.due_on, paidAt)) - Math.abs(daysBetween(b.due_on, paidAt)));
  if (singles.length) { const t = singles[0];
    return { terms: [t], already: t.paid, why: `${t.name} (payment date ${dm(t.due_on)})${named === t.number ? ", named on the payment" : ""}${t.paid ? ": already recorded as paid" : ""}` }; }
  // several terms in one payment (e.g. the whole year), starting with the term due around the payment date
  const start = terms.findIndex((t) => daysBetween(t.due_on, paidAt) >= -42);
  if (start >= 0) { let sum = 0; for (let k = start; k < terms.length; k++) { sum += terms[k].total; if (k > start && near(sum, amount)) {
    const pick = terms.slice(start, k + 1); return { terms: pick, already: pick.every((t) => t.paid), why: `${pick[0].name} to ${pick[pick.length - 1].name} together${pick.every((t) => t.paid) ? ": already recorded as paid" : ""}` }; } } }
  return null;
}
export type Suggestion = { charge: { id: string; created_at: string; amount: number; refunded: number; email: string | null; description: string | null };
  family: { id: string; name: string } | null; terms: { term_id: string; number: number; name: string; total: number; due_on: string }[];
  sure: boolean; already: boolean; options: { term_id: string; number: number; name: string; total: number; due_on: string }[]; why: string };
/** For each payment not yet matched: the family (by email) and the term(s) it most likely paid. */
export async function suggestions(): Promise<Suggestion[]> {
  return withSchool(async (q) => {
    const rows = await q<{ id: string; created_at: string; amount_pence: number; refunded_pence: number; email: string | null; description: string | null; parent_id: string | null; family: string | null }>(`
      select c.id, c.created_at::text, c.amount_pence, c.refunded_pence, c.email::text, c.description, c.parent_id, p.first_name || ' ' || p.last_name as family
      from stripe_charges c left join parents p on p.id = c.parent_id where c.matched_at is null and not c.ignored and c.status = 'succeeded' and c.refunded_pence < c.amount_pence order by c.created_at`);
    const taken = new Map<string, Set<string>>(), cache = new Map<string, TermRow[]>(), out: Suggestion[] = [];
    for (const r of rows) {
      const ch = { id: r.id, created_at: r.created_at, amount: r.amount_pence - r.refunded_pence, refunded: r.refunded_pence, email: r.email, description: r.description };
      if (!r.parent_id) { out.push({ charge: ch, family: null, terms: [], sure: false, already: false, options: [], why: r.email ? "No family with this email" : "No email on the payment" }); continue; }
      const used = taken.get(r.parent_id) ?? new Set<string>(); taken.set(r.parent_id, used);
      if (!cache.has(r.parent_id)) cache.set(r.parent_id, await yearTerms(q, r.parent_id));
      const all = cache.get(r.parent_id)!, m = matchTerms(all, ch.amount, r.created_at, r.description, used);
      for (const t of m?.terms ?? []) used.add(t.term_id);
      const open = all.filter((t) => !t.paid && !used.has(t.term_id));
      out.push({ charge: ch, family: { id: r.parent_id, name: r.family ?? r.email ?? "" }, terms: (m?.terms ?? []).map(({ open_ids: _o, paid: _p, ...t }) => t), sure: !!m, already: !!m?.already,
        why: m?.why ?? (open.length ? "The amount and date don’t match a term: choose one, or set it aside" : "Nothing unpaid for this family this year"),
        options: open.map((t) => ({ term_id: t.term_id, number: t.number, name: t.name, total: t.total, due_on: t.due_on })) });
    }
    // matched oldest first (so earlier payments claim earlier terms), shown newest first
    return out.reverse();
  });
}
/** Record a Stripe payment against the chosen terms (in this site only; nothing is sent to Stripe or to families).
 *  Unpaid instalments of those terms are marked paid; terms already recorded as paid are just linked to the payment. */
export async function applyMatch(q: Q, chargeId: string, termIds: string[], by: string): Promise<number> {
  const ch = (await q<{ parent_id: string | null; created_at: string; payment_intent: string | null; matched_at: string | null }>(`select parent_id, created_at::text, payment_intent, matched_at::text from stripe_charges where id = $1`, [chargeId]))[0];
  if (!ch?.parent_id || ch.matched_at || !termIds.length) return 0;
  const ids = await q<{ id: string; amount_pence: number }>(`update instalments i set status = 'paid', paid_at = $3::timestamptz, stripe_payment_intent_id = $4
    from enrolments e, students s where e.id = i.enrolment_id and s.id = e.student_id and s.parent_id = $1 and i.term_id = any($2::uuid[]) and i.status in ('scheduled', 'failed') and i.stripe_payment_intent_id is null
    returning i.id, i.amount_pence`, [ch.parent_id, termIds, ch.created_at, ch.payment_intent ?? chargeId]);
  for (const x of ids) await q(`insert into ledger_entries (school_id, parent_id, kind, amount_pence, instalment_id, stripe_object_id, created_at) values (current_school(), $1, 'charge', $2, $3, $4, $5::timestamptz) on conflict (stripe_object_id) do nothing`,
    [ch.parent_id, x.amount_pence, x.id, `${chargeId}:${x.id}`, ch.created_at]);
  const linked = ids.length ? ids.map((x) => x.id) : (await q<{ id: string }>(`select i.id from instalments i join enrolments e on e.id = i.enrolment_id join students s on s.id = e.student_id
    where s.parent_id = $1 and i.term_id = any($2::uuid[]) and i.status in ('paid', 'part_refunded', 'waived')`, [ch.parent_id, termIds])).map((x) => x.id);
  if (!linked.length) return 0;
  await q(`update stripe_charges set instalment_ids = $2::uuid[], matched_at = now(), matched_by = $3 where id = $1`, [chargeId, linked, ids.length ? by : `${by} (already paid)`]);
  return ids.length;
}
export async function confirmMatches(by: string, picks: { charge: string; terms: string[] }[], ignore: string[]): Promise<{ terms: number; payments: number; linked: number }> {
  return withSchool(async (q) => {
    let terms = 0, payments = 0, linked = 0;
    for (const p of picks) { const n = await applyMatch(q, p.charge, p.terms, by); if (n) { terms += n; payments++; } else linked++; }
    for (const id of ignore) await q(`update stripe_charges set ignored = true where id = $1 and matched_at is null`, [id]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) select current_school(), null, 'stripe_match', 'school', current_school(), $1`, [JSON.stringify({ by, payments, terms })]).catch(() => {});
    return { terms, payments, linked };
  });
}

/** Undo a recorded match: the terms it marked paid go back to unpaid (terms that were already paid before stay paid). */
export async function undoMatch(chargeId: string, by: string): Promise<boolean> {
  return withSchool(async (q) => {
    const ch = (await q<{ instalment_ids: string[]; payment_intent: string | null; matched_at: string | null }>(`select instalment_ids, payment_intent, matched_at::text from stripe_charges where id = $1`, [chargeId]))[0];
    if (!ch?.matched_at) return false;
    await q(`update instalments set status = 'scheduled', paid_at = null, stripe_payment_intent_id = null where id = any($1::uuid[]) and stripe_payment_intent_id = $2 and status = 'paid'`, [ch.instalment_ids, ch.payment_intent ?? chargeId]);
    // the money ledger is append-only, so its record of the payment stays; only the match to terms is undone
    await q(`update stripe_charges set instalment_ids = '{}', matched_at = null, matched_by = null, ignored = false where id = $1`, [chargeId]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) select current_school(), null, 'stripe_unmatch', 'school', current_school(), $1`, [JSON.stringify({ by, charge: chargeId })]).catch(() => {});
    return true;
  });
}

// ---------- Stripe's notifications (webhooks): received and checked; nothing is ever sent back ----------
export async function stripeWebhook(raw: string, sigHeader: string | null): Promise<{ status: number; body: string }> {
  const c = await kv(), secret = secretOf(c);
  if (!secret) return { status: 400, body: "Not set up" };
  const parts = Object.fromEntries((sigHeader ?? "").split(",").map((x) => x.split("=") as [string, string]));
  const t = Number(parts.t), v1 = (sigHeader ?? "").split(",").filter((x) => x.startsWith("v1=")).map((x) => x.slice(3));
  if (!t || Math.abs(Date.now() / 1000 - t) > 600) return { status: 400, body: "Old or missing timestamp" };
  const want = createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  if (!v1.some((s) => s.length === want.length && timingSafeEqual(Buffer.from(s), Buffer.from(want)))) return { status: 400, body: "Bad signature" };
  const ev = JSON.parse(raw) as { type: string; data: { object: Charge } };
  if (!ev.type?.startsWith("charge.")) return { status: 200, body: "ignored" };
  await withSchool(async (q) => {
    await saveCharge(q, ev.data.object);
    const ch = (await q<{ id: string; status: string; amount_pence: number; refunded_pence: number; parent_id: string | null; matched_at: string | null; instalment_ids: string[] }>(
      `select id, status, amount_pence, refunded_pence, parent_id, matched_at::text, instalment_ids from stripe_charges where id = $1`, [ev.data.object.id]))[0];
    if (!ch?.parent_id) return;
    if (ch.status === "succeeded" && !ch.matched_at && ch.refunded_pence === 0 && c.auto !== false) {
      // a new payment that exactly matches one unpaid term (or several together) is recorded straight away
      const m = matchTerms(await yearTerms(q, ch.parent_id), ch.amount_pence, new Date().toISOString(), ev.data.object.description ?? null, new Set());
      if (m) await applyMatch(q, ch.id, m.terms.map((x) => x.term_id), "auto");
    }
    if (ch.status === "failed" && !ch.matched_at) {
      const m = matchTerms((await yearTerms(q, ch.parent_id)).filter((x) => !x.paid), ch.amount_pence, new Date().toISOString(), ev.data.object.description ?? null, new Set());
      if (m && m.terms.length === 1) await q(`update instalments set status = 'failed', attempts = attempts + 1 where id = any($1::uuid[]) and status = 'scheduled'`, [m.terms[0].open_ids]);
    }
    if (ch.matched_at && ch.refunded_pence > 0) {
      const full = ch.refunded_pence >= ch.amount_pence;
      await q(`update instalments set status = $2::text::instalment_status, refunded_pence = case when $3 then amount_pence else refunded_pence end where id = any($1::uuid[]) and status in ('paid', 'part_refunded')`,
        [ch.instalment_ids, full ? "refunded" : "part_refunded", full]);
    }
  });
  return { status: 200, body: "ok" };
}

/** Payments copied from Stripe recently, for the Payments page. */
export async function recentCharges(limit = 30) {
  return withSchool((q) => q<{ id: string; created_at: string; amount_pence: number; refunded_pence: number; status: string; email: string | null; family: string | null; matched_by: string | null; ignored: boolean; terms: string | null }>(`
    select c.id, c.created_at::text, c.amount_pence, c.refunded_pence, c.status, c.email::text, p.first_name || ' ' || p.last_name as family, c.matched_by, c.ignored,
      (select string_agg(distinct t.name, ', ') from instalments i join terms t on t.id = i.term_id where i.id = any(c.instalment_ids)) as terms
    from stripe_charges c left join parents p on p.id = c.parent_id order by c.created_at desc limit $1`, [limit]));
}
