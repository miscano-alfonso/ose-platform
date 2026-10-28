import "server-only";
import { withSchool } from "./db";

// Test mode: the site runs on real data (Google Meet attendance, Classroom, the inbox, Stripe, all read as normal),
// but nothing goes out to families, students or teachers. Every email to someone who isn't on the allowed list
// (the school's admins, plus addresses added on the Test mode page) is held and listed instead of sent. Classroom
// invitations, recording posts and newsletters wait. Inbox replies are still sent: they're written and sent by a person.
// A school with no setting is in test mode, so a new site never surprises anyone.

type Q = <T = Record<string, unknown>>(s: string, p?: unknown[]) => Promise<T[]>;
export type TestCfg = { on: boolean; allow: string[]; at?: string; by?: string };
const KEY = "test_mode";
const norm = (e: string) => e.trim().toLowerCase();

async function cfgQ(q: Q): Promise<TestCfg> {
  const v = (await q<{ value: Partial<TestCfg> }>(`select value from meet_kv where key = $1`, [KEY]))[0]?.value;
  return { on: v?.on !== false, allow: Array.isArray(v?.allow) ? v!.allow.map(String) : [], at: v?.at, by: v?.by };
}
/** The setting, with everyone allowed to receive email while it's on (admins + the extra addresses). */
export async function testMode(): Promise<TestCfg & { admins: string[] }> {
  return withSchool(async (q) => {
    const c = await cfgQ(q);
    const admins = (await q<{ email: string }>(`select lower(email::text) as email from users where role = 'school_admin' and disabled_at is null`)).map((r) => r.email);
    return { ...c, admins };
  });
}
export async function isTestMode(): Promise<boolean> {
  return withSchool((q) => cfgQ(q)).then((c) => c.on).catch(() => true);   // if in doubt, hold
}

/** Split recipients into those who may get the email now and those held by test mode (logged for the Test mode page). */
export async function gate<T extends { email: string; name?: string }>(to: T[], m: { channel?: string; subject: string; body?: string; tag?: string }): Promise<{ send: T[]; held: T[] }> {
  let t: Awaited<ReturnType<typeof testMode>>;
  try { t = await testMode(); } catch { t = { on: true, allow: [], admins: [] }; }
  if (!t.on) return { send: to, held: [] };
  const ok = new Set([...t.admins, ...t.allow.map(norm)]);
  const send = to.filter((r) => ok.has(norm(r.email))), held = to.filter((r) => !ok.has(norm(r.email)));
  if (held.length) await logHeld(held.map((r) => ({ to: r.email, name: r.name ?? null })), { channel: m.channel ?? "email", subject: m.subject, body: m.body, tag: m.tag }).catch(() => {});
  return { send, held };
}
/** Note something test mode stopped (a Classroom invitation, a recording post, a newsletter). */
export async function logHeld(to: { to: string | null; name: string | null }[], m: { channel: string; subject: string; body?: string; tag?: string }) {
  if (!to.length) return;
  await withSchool((q) => q(`insert into held_messages (school_id, channel, to_addr, to_name, subject, body, tag)
      select current_school(), $1, x.to_addr, x.to_name, $2, $3, $4 from jsonb_to_recordset($5::jsonb) as x(to_addr text, to_name text)`,
    [m.channel, m.subject.slice(0, 300), (m.body ?? "").slice(0, 4000), m.tag ?? null, JSON.stringify(to.map((r) => ({ to_addr: r.to, to_name: r.name })))]));
}

export type Held = { id: number; created_at: string; channel: string; to_addr: string | null; to_name: string | null; subject: string | null; body: string | null; tag: string | null };
export async function heldList(limit = 300): Promise<{ rows: Held[]; total: number; byTag: { tag: string; n: number }[] }> {
  return withSchool(async (q) => ({
    rows: await q<Held>(`select id, created_at::text, channel, to_addr, to_name, subject, body, tag from held_messages order by created_at desc, id desc limit $1`, [limit]),
    total: (await q<{ n: number }>(`select count(*)::int as n from held_messages`))[0].n,
    byTag: await q<{ tag: string; n: number }>(`select coalesce(tag, channel) as tag, count(*)::int as n from held_messages group by 1 order by 2 desc`),
  }));
}
export async function clearHeld() { await withSchool((q) => q(`delete from held_messages`)); }

/** Lesson reminders already booked with Brevo for people who aren't allowed: take them back (kept as 'held'). */
export async function holdBooked(): Promise<number> {
  const t = await testMode(); if (!t.on) return 0;
  const ok = [...t.admins, ...t.allow.map(norm)];
  const rows = await withSchool((q) => q<{ id: number; message_id: string | null; key: string; to_email: string }>(`select id, message_id, key, to_email::text from automation_sends
    where status = 'scheduled' and scheduled_for > now() and not (lower(to_email::text) = any($1::text[]))`, [ok]));
  if (!rows.length) return 0;
  const { cancelScheduled } = await import("./email");
  for (const r of rows) {
    if (r.message_id) await cancelScheduled(r.message_id).catch(() => false);
    await withSchool((q) => q(`update automation_sends set status = 'held', error = 'Test mode' where id = $1`, [r.id]));
  }
  await logHeld(rows.map((r) => ({ to: r.to_email, name: null })), { channel: "email", subject: "Booked reminder taken back (test mode)", tag: "auto-booked" }).catch(() => {});
  return rows.length;
}

export async function setTestMode(by: string, on: boolean, allow: string[]): Promise<{ held?: number; released?: number }> {
  const list = [...new Set(allow.map(norm).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))].slice(0, 50);
  await withSchool((q) => q(`insert into meet_kv (school_id, key, value) values (current_school(), $1, $2)
    on conflict (school_id, key) do update set value = excluded.value, updated_at = now()`, [KEY, JSON.stringify({ on, allow: list, at: new Date().toISOString(), by } satisfies TestCfg)]));
  if (on) return { held: await holdBooked() };
  // going live: reminders held for lessons still to come are booked again on the next run; ones whose time has passed stay held
  const released = await withSchool((q) => q(`delete from automation_sends where status = 'held' and scheduled_for > now() returning id`));
  return { released: released.length };
}
