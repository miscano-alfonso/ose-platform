import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { withSchool } from "./db";

// Termly payments taken by the site (11 Nov). Each family pays each term by Bacs Direct Debit (the default) or, when the
// office allows it, by card. The bank account or card is set up on Stripe's own secure page (Checkout, set-up mode), so
// bank and card details never reach this site. On each due date the site asks Stripe to collect that term's total for the
// family in one payment (card: straight away; Direct Debit: Bacs takes about 3 working days). Stripe sends the Direct
// Debit confirmation and advance notices itself.
//
// SAFETY: until the school leaves TechSaga this only accepts a Stripe TEST key (rk_test_…), so no real money can move,
// and with test mode on it only works for families on the test list. The read-only Stripe connection (stripe-read.ts)
// is separate and unchanged.

type Q = <T = Record<string, unknown>>(s: string, p?: unknown[]) => Promise<T[]>;
const API = () => (process.env.STRIPE_API_URL || "https://api.stripe.com/v1").replace(/\/$/, "");
export type PayCfg = { key?: string; webhookSecret?: string; at?: string; by?: string; collect?: boolean; everyone?: boolean; last?: { at: string; made: number; skipped: number; problems: string[] } };
export const isTestPayKey = (k: string) => /^rk_test_[A-Za-z0-9]{20,}$/.test(k);
const LIVE_ALLOWED = false;   // switched on in code at the TechSaga switch-over, together with a live key

async function cfg(q?: Q): Promise<PayCfg> {
  const run = async (qq: Q) => (await qq<{ value: PayCfg }>(`select value from meet_kv where key = 'stripe_pay'`))[0]?.value ?? {};
  return q ? run(q) : withSchool(run);
}
async function cfgPut(c: PayCfg, q?: Q) {
  const run = (qq: Q) => qq(`insert into meet_kv (school_id, key, value) values (current_school(), 'stripe_pay', $1) on conflict (school_id, key) do update set value = excluded.value, updated_at = now()`, [JSON.stringify(c)]);
  await (q ? run(q) : withSchool(run));
}
const usable = (c: PayCfg) => !!c.key && (isTestPayKey(c.key) || LIVE_ALLOWED);

// ---------- talking to Stripe ----------
/** Stripe's form encoding, nested: { a: { b: 1 }, c: ["x"] } → a[b]=1&c[0]=x */
function form(o: Record<string, unknown>, pre = "", out: string[] = []): string {
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null) continue;
    const key = pre ? `${pre}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((x, i) => typeof x === "object" ? form(x as Record<string, unknown>, `${key}[${i}]`, out) : out.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(x))}`));
    else if (typeof v === "object") form(v as Record<string, unknown>, key, out);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out.join("&");
}
type StripeErr = { error?: { message?: string; code?: string; decline_code?: string; payment_intent?: { id: string; status: string } } };
async function call<T>(key: string, method: "GET" | "POST", path: string, body?: Record<string, unknown>, idem?: string): Promise<{ ok: boolean; status: number; j: T & StripeErr }> {
  const r = await fetch(API() + path, { method, signal: AbortSignal.timeout(20000),
    headers: { authorization: `Bearer ${key}`, "stripe-version": "2024-06-20", ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}), ...(idem ? { "idempotency-key": idem } : {}) },
    body: body ? form(body) : undefined });
  const j = (await r.json().catch(() => ({}))) as T & StripeErr;
  return { ok: r.ok, status: r.status, j };
}

// ---------- settings ----------
export type PayStatus = { connected: boolean; test: boolean; at?: string; by?: string; collect: boolean; everyone: boolean; hasSecret: boolean; last?: PayCfg["last"] };
export async function payStatus(): Promise<PayStatus> {
  const c = await cfg();
  return { connected: usable(c), test: !!c.key && isTestPayKey(c.key), at: c.at, by: c.by, collect: !!c.collect, everyone: !!c.everyone, hasSecret: !!c.webhookSecret, last: c.last };
}
export async function connectPay(by: string, key: string, secret: string): Promise<string | null> {
  key = key.trim(); secret = secret.trim();
  if (/^(sk|rk)_live_/.test(key) && !LIVE_ALLOWED) return "Only a Stripe TEST key for now (it starts rk_test_). The live key is added when the school leaves TechSaga.";
  if (/^sk_/.test(key)) return "Please use a restricted key (it starts rk_test_), not the secret key.";
  if (!isTestPayKey(key)) return "That doesn’t look like a Stripe restricted test key (rk_test_…).";
  if (secret && !/^whsec_[A-Za-z0-9]{20,}$/.test(secret)) return "The signing secret starts whsec_.";
  const r = await call<{ data?: unknown[] }>(key, "GET", "/customers?limit=1").catch(() => null);
  if (!r) return "Couldn’t reach Stripe.";
  if (!r.ok) return `Stripe said: ${r.j.error?.message ?? r.status}. The key needs Write on Customers, Checkout Sessions, SetupIntents and PaymentIntents.`;
  const c = await cfg();
  await cfgPut({ ...c, key, webhookSecret: secret || c.webhookSecret, at: new Date().toISOString(), by });
  return null;
}
export async function disconnectPay() { const c = await cfg(); await cfgPut({ ...c, key: undefined, webhookSecret: undefined, collect: false }); }
export async function setPaySwitch(which: "collect" | "everyone", on: boolean) {
  const c = await cfg();
  if (which === "everyone" && on && isTestPayKey(c.key ?? "")) return;   // never shown to every family on a test key
  await cfgPut({ ...c, [which]: on });
}

/** Families who can see "How you pay": with a test key only those on the test list (Settings → Test mode). */
async function onTestList(email: string, q?: Q): Promise<boolean> {
  const run = async (qq: Q) => { const v = (await qq<{ value: { allow?: string[] } }>(`select value from meet_kv where key = 'test_mode'`))[0]?.value;
    return (v?.allow ?? []).map((x) => String(x).toLowerCase().trim()).includes(email.toLowerCase().trim()); };
  return q ? run(q) : withSchool(run);
}
export async function payAccess(parentEmail: string): Promise<boolean> {
  const c = await cfg(); if (!usable(c)) return false;
  return (c.everyone && !isTestPayKey(c.key!)) || await onTestList(parentEmail);
}

// ---------- each family's way of paying ----------
export type PayMethod = { method: "bacs" | "card"; card_allowed: boolean; status: "none" | "pending" | "active" | "inactive"; label: string | null; set_up_at: string | null; livemode: boolean };
export async function payMethod(parentId: string): Promise<PayMethod> {
  const r = (await withSchool((q) => q<PayMethod>(`select method, card_allowed, status, label, set_up_at::text, livemode from family_pay_methods where parent_id = $1`, [parentId])))[0];
  return r ?? { method: "bacs", card_allowed: false, status: "none", label: null, set_up_at: null, livemode: false };
}
export async function allowCard(parentId: string, on: boolean) {
  await withSchool((q) => q(`insert into family_pay_methods (parent_id, school_id, card_allowed) values ($1, current_school(), $2)
    on conflict (parent_id) do update set card_allowed = excluded.card_allowed, updated_at = now()`, [parentId, on]));
}

/** Start setting up Direct Debit (or a card, if allowed): returns Stripe's secure page to send the parent to. */
export async function startSetup(parentId: string, kind: "bacs" | "card", base: string): Promise<{ url?: string; error?: string }> {
  const c = await cfg(); if (!usable(c)) return { error: "Online payments aren’t set up yet." };
  const p = (await withSchool((q) => q<{ email: string; name: string; customer: string | null; card_allowed: boolean | null }>(`select p.email::text, p.first_name || ' ' || p.last_name as name,
      m.stripe_customer as customer, m.card_allowed from parents p left join family_pay_methods m on m.parent_id = p.id where p.id = $1`, [parentId])))[0];
  if (!p) return { error: "Family not found." };
  if (kind === "card" && !p.card_allowed) return { error: "Please set up Direct Debit. If you need to pay by card, ask us." };
  let customer = p.customer;
  if (!customer) {
    const r = await call<{ id: string }>(c.key!, "POST", "/customers", { email: p.email, name: p.name, metadata: { parent_id: parentId } }, `ose-cust-${parentId}`);
    if (!r.ok) return { error: `Stripe said: ${r.j.error?.message ?? r.status}` };
    customer = r.j.id;
    await withSchool((q) => q(`insert into family_pay_methods (parent_id, school_id, stripe_customer) values ($1, current_school(), $2)
      on conflict (parent_id) do update set stripe_customer = excluded.stripe_customer, updated_at = now()`, [parentId, customer]));
  }
  const s = await call<{ id: string; url: string }>(c.key!, "POST", "/checkout/sessions", {
    mode: "setup", customer, currency: "gbp", payment_method_types: [kind === "bacs" ? "bacs_debit" : "card"],
    success_url: `${base}/parent/payments/method?session={CHECKOUT_SESSION_ID}`, cancel_url: `${base}/parent/payments?err=${encodeURIComponent("Nothing was set up. You can try again any time.")}`,
    metadata: { parent_id: parentId, kind } });
  if (!s.ok || !s.j.url) return { error: `Stripe said: ${s.j.error?.message ?? s.status}` };
  return { url: s.j.url };
}

type PM = { id: string; type: string; bacs_debit?: { last4?: string; sort_code?: string }; card?: { brand?: string; last4?: string } };
type Session = { id: string; mode: string; status?: string; livemode?: boolean; metadata?: Record<string, string>; customer?: string;
  setup_intent?: { id: string; status: string; mandate?: string | null; payment_method?: PM | string | null } | string | null };
/** After Stripe's page: save the bank account or card. Checks the session belongs to this family. */
export async function finishSetup(sessionId: string, parentId: string | null): Promise<string | null> {
  if (!/^cs_[A-Za-z0-9_]{6,200}$/.test(sessionId)) return "That link isn’t right.";
  const c = await cfg(); if (!usable(c)) return "Online payments aren’t set up yet.";
  const r = await call<Session>(c.key!, "GET", `/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=setup_intent.payment_method`);
  if (!r.ok) return `Stripe said: ${r.j.error?.message ?? r.status}`;
  const s = r.j, owner = s.metadata?.parent_id ?? null;
  if (!owner || (parentId && owner !== parentId)) return "That set-up belongs to another account.";
  const si = typeof s.setup_intent === "object" ? s.setup_intent : null;
  const pm = si && typeof si.payment_method === "object" ? si.payment_method : null;
  if (!si || !pm || !["succeeded", "processing"].includes(si.status)) return "Stripe hasn’t finished setting it up. Please try again.";
  const bacs = pm.type === "bacs_debit";
  const label = bacs ? `Bank account •••• ${pm.bacs_debit?.last4 ?? "????"}` : `${(pm.card?.brand ?? "Card").replace(/^\w/, (x) => x.toUpperCase())} •••• ${pm.card?.last4 ?? "????"}`;
  await withSchool((q) => q(`insert into family_pay_methods (parent_id, school_id, method, stripe_customer, payment_method, mandate, status, label, livemode, set_up_at)
      values ($1, current_school(), $2, $3, $4, $5, $6, $7, $8, now())
    on conflict (parent_id) do update set method = excluded.method, stripe_customer = coalesce(excluded.stripe_customer, family_pay_methods.stripe_customer), payment_method = excluded.payment_method,
      mandate = excluded.mandate, status = excluded.status, label = excluded.label, livemode = excluded.livemode, set_up_at = now(), updated_at = now()`,
    [owner, bacs ? "bacs" : "card", s.customer ?? null, pm.id, bacs ? si.mandate ?? null : null, bacs ? "pending" : "active", label, !!s.livemode]));
  return null;
}

// ---------- collecting each term ----------
const londonToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
const addDays = (d: string, n: number) => new Date(Date.parse(d + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
export type CollectRun = { made: number; skipped: number; problems: string[]; off?: string };

/** Ask Stripe for every family payment due today (or due again after a failure). Safe to run as often as you like. */
export async function collectDue(force = false): Promise<CollectRun> {
  const c = await cfg();
  if (!usable(c)) return { made: 0, skipped: 0, problems: [], off: "No Stripe key for payments yet." };
  if (!c.collect && !force) return { made: 0, skipped: 0, problems: [], off: "Taking termly payments is switched off." };
  const run: CollectRun = { made: 0, skipped: 0, problems: [] };
  const today = londonToday();
  await withSchool(async (q) => {
    // what's due: scheduled terms on or before today that nobody has asked Stripe for, and failed terms whose retry day has come
    const due = await q<{ parent_id: string; email: string; due_on: string; ids: string[]; amount: number; terms: string; retry: boolean }>(`
      select s.parent_id, p.email::text, i.due_on::text, array_agg(i.id) as ids, sum(i.amount_pence - i.refunded_pence)::int as amount,
        string_agg(distinct t.name, ', ') as terms, bool_or(i.status = 'failed') as retry
      from instalments i join enrolments e on e.id = i.enrolment_id join students s on s.id = e.student_id join parents p on p.id = s.parent_id join terms t on t.id = i.term_id
      where ((i.status = 'scheduled' and i.stripe_payment_intent_id is null and i.due_on <= $1::date and i.due_on >= $1::date - 14)
          or (i.status = 'failed' and i.next_attempt_on is not null and i.next_attempt_on <= $1::date))
        and i.amount_pence > 0
      group by s.parent_id, p.email, i.due_on order by i.due_on limit 300`, [today]);
    for (const d of due) {
      // with a test key: only families on the test list
      if (isTestPayKey(c.key!) && !(await onTestList(d.email, q))) { run.skipped++; continue; }
      const m = (await q<{ method: "bacs" | "card"; customer: string | null; pm: string | null; mandate: string | null; status: string; livemode: boolean }>(`select method, stripe_customer as customer,
          payment_method as pm, mandate, status, livemode from family_pay_methods where parent_id = $1`, [d.parent_id]))[0];
      if (!m?.pm || !m.customer || !["active", "pending"].includes(m.status)) { run.skipped++; continue; }
      const attempt = ((await q<{ n: number }>(`select coalesce(max(attempt), 0)::int as n from pay_collections where parent_id = $1 and due_on = $2::date`, [d.parent_id, d.due_on]))[0]?.n ?? 0) + 1;
      if (attempt > 2) { run.skipped++; continue; }   // once and one retry; after that the office follows it up
      const [col] = await q<{ id: string }>(`insert into pay_collections (school_id, parent_id, due_on, attempt, method, amount_pence, instalment_ids, livemode)
        values (current_school(), $1, $2::date, $3, $4, $5, $6::uuid[], $7) on conflict (parent_id, due_on, attempt) do nothing returning id`,
        [d.parent_id, d.due_on, attempt, m.method, d.amount, d.ids, m.livemode]);
      if (!col) continue;   // another run got there first
      const r = await call<{ id?: string; status?: string; last_payment_error?: { message?: string } }>(c.key!, "POST", "/payment_intents", {
        amount: d.amount, currency: "gbp", customer: m.customer, payment_method: m.pm, payment_method_types: [m.method === "bacs" ? "bacs_debit" : "card"],
        ...(m.method === "bacs" && m.mandate ? { mandate: m.mandate } : {}), confirm: true, off_session: true,
        description: `OH-SO ED · ${d.terms}`, metadata: { ose_collection: col.id, parent_id: d.parent_id } }, `ose-collect-${col.id}`)
        .catch((e): { ok: boolean; status: number; j: { id?: string; status?: string; last_payment_error?: { message?: string } } & StripeErr } => ({ ok: false, status: 0, j: { error: { message: `Couldn’t reach Stripe (${String(e).slice(0, 80)})` } } }));
      const pi = r.j?.id ?? r.j?.error?.payment_intent?.id ?? null;
      await q(`update pay_collections set payment_intent = $2, updated_at = now() where id = $1`, [col.id, pi]);
      await q(`update instalments set stripe_payment_intent_id = $2 where id = any($1::uuid[]) and status in ('scheduled', 'failed')`, [d.ids, pi ?? `ose-collect-${col.id}`]);
      if (r.ok && r.j.status === "succeeded") await settle(q, col.id, true, null);
      else if (r.ok && r.j.status === "processing") {
        await q(`update pay_collections set status = 'processing', updated_at = now() where id = $1`, [col.id]);
        await q(`update instalments set status = 'processing' where id = any($1::uuid[]) and status in ('scheduled', 'failed')`, [d.ids]);
      }
      else await settle(q, col.id, false, r.j?.error?.message ?? r.j?.last_payment_error?.message ?? `Stripe answered ${r.status} (${r.j?.status ?? "no payment"})`);
      run.made++;
    }
  });
  const c2 = await cfg(); await cfgPut({ ...c2, last: { at: new Date().toISOString(), made: run.made, skipped: run.skipped, problems: run.problems.slice(0, 5) } });
  return run;
}

/** A collection finished: mark the family's terms paid (with ledger entries), or failed (one retry: card after 3 days, Direct Debit after 5). */
async function settle(q: Q, collectionId: string, ok: boolean, error: string | null) {
  const col = (await q<{ id: string; parent_id: string; method: string; attempt: number; amount_pence: number; instalment_ids: string[]; payment_intent: string | null; status: string; due_on: string }>(
    `select id, parent_id, method, attempt, amount_pence, instalment_ids, payment_intent, status, due_on::text from pay_collections where id = $1`, [collectionId]))[0];
  if (!col || col.status === "succeeded" || (!ok && col.status === "failed")) return;
  const ref = col.payment_intent ?? `ose-collect-${col.id}`;
  if (ok) {
    await q(`update pay_collections set status = 'succeeded', error = null, updated_at = now() where id = $1`, [col.id]);
    const ids = await q<{ id: string; amount_pence: number }>(`update instalments set status = 'paid', paid_at = now(), stripe_payment_intent_id = $2, next_attempt_on = null
      where id = any($1::uuid[]) and status in ('scheduled', 'processing', 'failed') returning id, amount_pence`, [col.instalment_ids, ref]);
    for (const x of ids) await q(`insert into ledger_entries (school_id, parent_id, kind, amount_pence, instalment_id, stripe_object_id) values (current_school(), $1, 'charge', $2, $3, $4) on conflict (stripe_object_id) do nothing`,
      [col.parent_id, x.amount_pence, x.id, `${ref}:${x.id}`]);
    await q(`update stripe_charges set matched_at = coalesce(matched_at, now()), matched_by = 'collection', instalment_ids = $2::uuid[], parent_id = coalesce(parent_id, $3) where payment_intent = $1`, [ref, col.instalment_ids, col.parent_id]).catch(() => null);
  } else {
    const retryOn = col.attempt === 1 ? addDays(londonToday(), col.method === "bacs" ? 5 : 3) : null;
    await q(`update pay_collections set status = 'failed', error = $2, updated_at = now() where id = $1`, [col.id, (error ?? "Didn’t go through").slice(0, 300)]);
    await q(`update instalments set status = 'failed', attempts = attempts + 1, next_attempt_on = $2::date, stripe_payment_intent_id = null where id = any($1::uuid[]) and status in ('scheduled', 'processing')`, [col.instalment_ids, retryOn]);
    await q(`insert into ledger_entries (school_id, parent_id, kind, amount_pence, stripe_object_id) values (current_school(), $1, 'failed_charge', $2, $3) on conflict (stripe_object_id) do nothing`,
      [col.parent_id, col.amount_pence, `${ref}:failed:${col.attempt}`]);
  }
}

// ---------- Stripe's notifications for payments the site took ----------
type Ev = { type: string; livemode?: boolean; data: { object: { id: string; object?: string; status?: string; mode?: string; metadata?: Record<string, string>; payment_intent?: string;
  last_payment_error?: { message?: string } } } };
/** True when the notification was signed with the payments secret (then it has been handled here). */
export async function payWebhook(raw: string, sigHeader: string | null): Promise<boolean> {
  const c = await cfg(); if (!c.webhookSecret || !usable(c)) return false;
  const t = Number(/(?:^|,)t=(\d+)/.exec(sigHeader ?? "")?.[1]), v1 = (sigHeader ?? "").split(",").filter((x) => x.startsWith("v1=")).map((x) => x.slice(3));
  if (!t || Math.abs(Date.now() / 1000 - t) > 600) return false;
  const want = createHmac("sha256", c.webhookSecret).update(`${t}.${raw}`).digest("hex");
  if (!v1.some((s) => s.length === want.length && timingSafeEqual(Buffer.from(s), Buffer.from(want)))) return false;
  const ev = JSON.parse(raw) as Ev, o = ev.data.object;
  await withSchool(async (q) => {
    if (ev.type === "checkout.session.completed" && o.mode === "setup") { await finishSetup(o.id, null); return; }
    if (ev.type === "mandate.updated" && o.status) {
      await q(`update family_pay_methods set status = $2, updated_at = now() where mandate = $1`, [o.id, o.status === "active" ? "active" : o.status === "pending" ? "pending" : "inactive"]); return; }
    const colId = o.metadata?.ose_collection ?? (o.payment_intent ? (await q<{ id: string }>(`select id from pay_collections where payment_intent = $1`, [o.payment_intent]))[0]?.id : null);
    if (!colId) return;
    if (ev.type === "payment_intent.succeeded") await settle(q, colId, true, null);
    else if (ev.type === "payment_intent.payment_failed") await settle(q, colId, false, o.last_payment_error?.message ?? "Didn’t go through");
    else if (ev.type === "payment_intent.processing") await q(`update pay_collections set status = 'processing', updated_at = now() where id = $1 and status = 'creating'`, [colId]);
    else if (ev.type === "charge.dispute.created") await q(`update pay_collections set error = 'Disputed or reclaimed through the bank', updated_at = now() where id = $1`, [colId]);
  });
  return true;
}

// ---------- the office's view ----------
export type FamilyPayRow = { parent_id: string; family: string; email: string; method: string; card_allowed: boolean; status: string; label: string | null; next_due: string | null; next_amount: number; test: boolean };
export async function payOverview(): Promise<{ families: FamilyPayRow[]; recent: { id: string; family: string; due_on: string; attempt: number; method: string; amount_pence: number; status: string; error: string | null; at: string }[] }> {
  return withSchool(async (q) => {
    const allow = new Set(((await q<{ value: { allow?: string[] } }>(`select value from meet_kv where key = 'test_mode'`))[0]?.value?.allow ?? []).map((x) => String(x).toLowerCase().trim()));
    const fam = await q<Omit<FamilyPayRow, "test">>(`select p.id as parent_id, p.first_name || ' ' || p.last_name as family, p.email::text as email,
        coalesce(m.method, 'bacs') as method, coalesce(m.card_allowed, false) as card_allowed, coalesce(m.status, 'none') as status, m.label,
        (select min(i.due_on)::text from instalments i join enrolments e on e.id = i.enrolment_id join students s on s.id = e.student_id where s.parent_id = p.id and i.status in ('scheduled', 'failed') and i.due_on >= current_date - 14) as next_due,
        coalesce((select sum(i.amount_pence)::int from instalments i join enrolments e on e.id = i.enrolment_id join students s on s.id = e.student_id where s.parent_id = p.id and i.status in ('scheduled', 'failed')
          and i.due_on = (select min(i2.due_on) from instalments i2 join enrolments e2 on e2.id = i2.enrolment_id join students s2 on s2.id = e2.student_id where s2.parent_id = p.id and i2.status in ('scheduled', 'failed') and i2.due_on >= current_date - 14)), 0) as next_amount
      from parents p left join family_pay_methods m on m.parent_id = p.id
      where exists (select 1 from enrolments e join students s on s.id = e.student_id where s.parent_id = p.id and e.status in ('active', 'pending'))
      order by p.last_name, p.first_name`);
    const recent = await q<{ id: string; family: string; due_on: string; attempt: number; method: string; amount_pence: number; status: string; error: string | null; at: string }>(`select c.id, p.first_name || ' ' || p.last_name as family,
        c.due_on::text, c.attempt, c.method, c.amount_pence, c.status, c.error, c.updated_at::text as at from pay_collections c join parents p on p.id = c.parent_id order by c.created_at desc limit 40`);
    return { families: fam.map((f) => ({ ...f, test: allow.has(f.email.toLowerCase()) })), recent };
  });
}

let last = 0;
/** After admin pages load and from the daily job: at most every 30 minutes, from 8am London time. */
export async function collectBackground() {
  if (Date.now() - last < 30 * 60e3) return;
  const hour = Number(new Date().toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Europe/London" }));
  if (hour < 8) return;
  last = Date.now();
  await collectDue().catch((e) => console.error("termly collection", e));
}
