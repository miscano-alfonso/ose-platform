import "server-only";
import { withSchool } from "./db";
import { sendOne, cancelScheduled, emailReady, type Recipient } from "./email";

// Admin → Automations. Each automation is a trigger with an email; the school can switch it off and change the wording and
// timing. A runner (after admin pages load, and from the daily job) finds what's due and sends it once, or schedules it with
// Brevo for the exact minute (Brevo holds scheduled emails up to 72 hours ahead, so timed reminders are booked up to 2 days ahead).

type Q = <T = Record<string, unknown>>(s: string, p?: unknown[]) => Promise<T[]>;
type Cfg = { enabled: boolean; subject: string; body: string; minutes: number | null; to_parent: boolean; to_student: boolean };
export type Timing = { label: string; unit: "minutes" | "hours" | "days"; default: number } | null;
export type AutoDef = { key: string; name: string; when: string; timing: Timing; to_parent: boolean; to_student: boolean; subject: string; body: string; fields: string[] };

export const DEFS: AutoDef[] = [
  { key: "taster_booked", name: "Taster booked: thank you", when: "As soon as a taster lesson is booked (on the website or by the office).", timing: null, to_parent: true, to_student: false,
    fields: ["parent", "child", "class", "date", "time", "teacher", "school"],
    subject: "Thank you for booking {{child}}’s taster lesson",
    body: "Dear {{parent}},\n\nThank you for booking a free taster lesson for {{child}}: {{class}} on {{date}} at {{time}} with {{teacher}}.\n\n{{child}} will get the Google Meet invitation for the lesson by email, and we’ll send the joining link again shortly before it starts.\n\nWe look forward to meeting {{child}}.\n\n{{school}}" },
  { key: "taster_link", name: "Taster: joining link before the lesson", when: "Before the taster lesson starts.", timing: { label: "minutes before the lesson", unit: "minutes", default: 30 }, to_parent: true, to_student: true,
    fields: ["parent", "child", "class", "date", "time", "meet_link", "school"],
    subject: "{{child}}’s taster lesson starts at {{time}}",
    body: "Hello,\n\n{{child}}’s taster lesson, {{class}}, starts today at {{time}}.\n\nJoin here: {{meet_link}}\n\nPlease join a couple of minutes early, signed in with the Google account we have for {{child}}.\n\n{{school}}" },
  { key: "lesson_reminder", name: "Lesson reminder with the Meet link", when: "Before every timetabled lesson, to each student in the class.", timing: { label: "minutes before each lesson", unit: "minutes", default: 15 }, to_parent: false, to_student: true,
    fields: ["child", "class", "time", "teacher", "meet_link", "school"],
    subject: "{{class}} starts at {{time}}",
    body: "Hi {{child}},\n\nYour {{class}} lesson with {{teacher}} starts at {{time}}.\n\nJoin the lesson: {{meet_link}}\n\nSee you there!\n{{school}}" },
  { key: "taster_follow_up", name: "After a taster: invite to book", when: "After a taster lesson the child came to.", timing: { label: "hours after the lesson ends", unit: "hours", default: 2 }, to_parent: true, to_student: false,
    fields: ["parent", "child", "class", "book_link", "school"],
    subject: "How did {{child}}’s taster go?",
    body: "Dear {{parent}},\n\nThank you for bringing {{child}} to the {{class}} taster lesson. We hope they enjoyed it.\n\nIf you’d like {{child}} to join the class, you can book a place here: {{book_link}}\n\nPlaces are limited, so do get in touch if you have any questions.\n\n{{school}}" },
  { key: "waitlist_open", name: "Waiting list: places are open", when: "When a course reaches its waiting-list target and the families on the list can book first.", timing: null, to_parent: true, to_student: false,
    fields: ["parent", "child", "class", "book_link", "hours", "school"],
    subject: "{{class}} is opening: book {{child}}’s place first",
    body: "Dear {{parent}},\n\nGood news: enough families have joined the waiting list, so {{class}} is going ahead.\n\nAs you were on the list, you can book {{child}}’s place before anyone else for the next {{hours}} hours: {{book_link}}\n\n{{school}}" },
  { key: "payment_reminder", name: "Payment reminder", when: "Before each term’s payment is taken from the saved card.", timing: { label: "days before the payment", unit: "days", default: 3 }, to_parent: true, to_student: false,
    fields: ["parent", "amount", "date", "school"],
    subject: "Your next payment of {{amount}} on {{date}}",
    body: "Dear {{parent}},\n\nA reminder that your next termly payment of {{amount}} will be taken from your saved card on {{date}}.\n\nIf your card has changed, please update it before then.\n\n{{school}}" },
  { key: "payment_failed", name: "Payment failed", when: "When a termly payment can’t be taken.", timing: null, to_parent: true, to_student: false,
    fields: ["parent", "amount", "child", "class", "school"],
    subject: "We couldn’t take your payment of {{amount}}",
    body: "Dear {{parent}},\n\nWe tried to take this term’s payment of {{amount}} for {{child}}’s {{class}} course, but it didn’t go through. We’ll try again in 3 days.\n\nPlease check your card, or reply to this email if you’d like to talk about it.\n\n{{school}}" },
  { key: "report_published", name: "Report ready", when: "When a progress report is published.", timing: null, to_parent: true, to_student: false,
    fields: ["parent", "child", "report", "school"],
    subject: "{{child}}’s {{report}} is ready",
    body: "Dear {{parent}},\n\n{{child}}’s {{report}} is ready. Sign in to your account to read it.\n\n{{school}}" },
];

export type AutoRow = AutoDef & { enabled: boolean; minutes: number | null; custom: boolean; sent7: number; scheduled: number; failed7: number };
export type SendRow = { key: string; to: string; at: string; status: string; ref: string; error: string | null };
export async function automations(): Promise<{ rows: AutoRow[]; ready: boolean; recent: SendRow[] }> {
  const { saved, stats, recent } = await withSchool(async (q) => ({
    saved: await q<Cfg & { key: string }>(`select key, enabled, subject, body, minutes, to_parent, to_student from automations`),
    stats: await q<{ key: string; sent7: number; scheduled: number; failed7: number }>(`select key, count(*) filter (where status = 'sent' and created_at > now() - interval '7 days')::int as sent7,
      count(*) filter (where status = 'scheduled' and scheduled_for > now())::int as scheduled, count(*) filter (where status = 'failed' and created_at > now() - interval '7 days')::int as failed7
      from automation_sends group by key`),
    recent: await q<SendRow>(`select key, to_email::text as to, to_char(coalesce(scheduled_for, created_at) at time zone 'Europe/London', 'DD Mon HH24:MI') as at, status, ref, error
      from automation_sends order by created_at desc limit 40`),
  }));
  return { ready: await emailReady(), recent, rows: DEFS.map((d) => { const r = saved.find((x) => x.key === d.key), st = stats.find((x) => x.key === d.key);
    return { ...d, enabled: r?.enabled ?? false, subject: r?.subject ?? d.subject, body: r?.body ?? d.body, minutes: r ? r.minutes : d.timing?.default ?? null,
      to_parent: r?.to_parent ?? d.to_parent, to_student: r?.to_student ?? d.to_student, custom: !!r, sent7: st?.sent7 ?? 0, scheduled: st?.scheduled ?? 0, failed7: st?.failed7 ?? 0 }; }) };
}

export async function saveAutomation(actorId: string, key: string, d: { enabled: boolean; subject: string; body: string; minutes: number | null; to_parent: boolean; to_student: boolean }): Promise<string | null> {
  const def = DEFS.find((x) => x.key === key); if (!def) return "Unknown automation.";
  if (!d.subject.trim() || !d.body.trim()) return "Write a subject and a message.";
  if (!d.to_parent && !d.to_student) return "Choose who it goes to.";
  const minutes = def.timing ? Math.max(0, Math.min(def.timing.unit === "days" ? 14 : def.timing.unit === "hours" ? 72 : 1440, Math.round(d.minutes ?? def.timing.default))) : null;
  await withSchool(async (q) => {
    await q(`insert into automations (school_id, key, enabled, subject, body, minutes, to_parent, to_student, updated_by) values (current_school(), $1, $2, $3, $4, $5, $6, $7, $8)
      on conflict (school_id, key) do update set enabled = excluded.enabled, subject = excluded.subject, body = excluded.body, minutes = excluded.minutes,
        to_parent = excluded.to_parent, to_student = excluded.to_student, updated_at = now(), updated_by = excluded.updated_by`, [key, d.enabled, d.subject.trim(), d.body.trim(), minutes, d.to_parent, d.to_student, actorId]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'save', 'automation', null, $2)`, [actorId, JSON.stringify({ key, enabled: d.enabled })]);
  });
  return null;
}

const fill = (t: string, v: Record<string, string>) => t.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => v[k] ?? m);
const gbp = (p: number) => "£" + (p / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: string) => new Date(d.length === 10 ? d + "T12:00:00Z" : d).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" });
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

type Job = { ref: string; to: Recipient[]; vars: Record<string, string>; at?: Date };

/** Claim, then send or schedule, one email per recipient. Returns how many went. */
async function deliver(q: Q, key: string, cfg: Cfg, job: Job, budget: { n: number }): Promise<void> {
  for (const r of job.to) {
    if (budget.n <= 0) return;
    const claim = await q<{ id: number }>(`insert into automation_sends (school_id, key, ref, to_email, scheduled_for, status) values (current_school(), $1, $2, $3, $4, $5)
      on conflict (school_id, key, ref, to_email) do nothing returning id`, [key, job.ref, r.email, job.at?.toISOString() ?? null, job.at ? "scheduled" : "sent"]);
    if (!claim.length) continue;
    budget.n--;
    const vars = { ...job.vars, child: job.vars.child ?? "", parent: job.vars.parent ?? r.name };
    const res = await sendOne([r], fill(cfg.subject, vars), fill(cfg.body, vars), { tag: `auto-${key}`, scheduledAt: job.at?.toISOString() });
    await q(`update automation_sends set status = $2, message_id = $3, error = $4 where id = $1`, [claim[0].id, res.ok ? (job.at ? "scheduled" : "sent") : "failed", res.ids[0] ?? null, res.error ?? null]);
  }
}

/** Find everything due and send it (or book it with Brevo for the right minute). Safe to run as often as you like. */
export async function runAutomations(limit = 150): Promise<{ sent: number }> {
  if (!(await emailReady())) return { sent: 0 };
  const budget = { n: limit };
  await withSchool(async (q) => {
    const saved = await q<Cfg & { key: string }>(`select key, enabled, subject, body, minutes, to_parent, to_student from automations where enabled`);
    const cfg = (key: string) => saved.find((s) => s.key === key) ?? null;
    const [sc] = await q<{ name: string; base: string | null }>(`select name, (select value #>> '{}' from social_kv where key = 'base') as base from schools where id = current_school()`).catch(() => [{ name: "OH-SO ED", base: null }]);
    const school = sc?.name ?? "OH-SO ED", base = (process.env.SITE_URL || sc?.base || "").replace(/\/$/, ""), book = base ? `${base}/courses` : "our website";
    const now = Date.now(), horizon = 48 * 3600e3;

    // lesson reminders: every student in the class, the set number of minutes before each lesson
    let c = cfg("lesson_reminder");
    if (c) {
      const m = c.minutes ?? 15;
      const rows = await q<{ ev: string; starts: string; class: string; teacher: string | null; meet: string | null; sid: string; child: string; semail: string | null; parent: string; pemail: string }>(`
        select e.id as ev, ((e.lesson_date + s.starts_at) at time zone sc.timezone)::text as starts, l.name || ' ' || sj.name as class, u.name as teacher, g.meet_url as meet,
          st.id as sid, st.first_name as child, st.email::text as semail, p.first_name as parent, p.email::text as pemail
        from lesson_events e join lesson_slots s on s.id = e.slot_id join course_groups g on g.id = e.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
        join schools sc on sc.id = e.school_id left join teachers t on t.id = e.teacher_id left join users u on u.id = t.user_id
        join enrolments x on x.group_id = g.id and x.status = 'active' and not x.is_taster join students st on st.id = x.student_id join parents p on p.id = st.parent_id
        where e.status = 'scheduled' and e.lesson_date between current_date and current_date + 3
          and not exists (select 1 from absence_notices a where a.lesson_event_id = e.id and a.student_id = st.id and a.cancelled_at is null)
        order by e.lesson_date, s.starts_at`);
      for (const r of rows) {
        const at = Date.parse(r.starts) - m * 60e3; if (at < now + 60e3 || at > now + horizon) continue;
        const to = [...(c.to_student && r.semail ? [{ name: r.child, email: r.semail }] : []), ...(c.to_parent ? [{ name: r.parent, email: r.pemail }] : [])];
        await deliver(q, "lesson_reminder", c, { ref: `${r.ev}:${r.sid}`, to, at: new Date(at), vars: { child: r.child, parent: r.parent, class: r.class, time: fmtTime(r.starts), teacher: r.teacher ?? "your teacher",
          meet_link: r.meet ?? "the Google Meet link in your class’s Google Classroom", school } }, budget);
      }
    }

    // tasters: thank-you now, joining link before the lesson, invitation to book after it
    const tasters = await q<{ id: string; status: string; starts: string; ends: string; class: string; teacher: string | null; meet: string | null; child: string; cemail: string; parent: string; pemail: string; created: string }>(`
      select b.id, b.status::text, ((e.lesson_date + s.starts_at) at time zone sc.timezone)::text as starts, ((e.lesson_date + s.ends_at) at time zone sc.timezone)::text as ends,
        l.name || ' ' || sj.name as class, u.name as teacher, g.meet_url as meet, r.child_name as child, r.child_email::text as cemail, r.parent_first_name as parent, r.parent_email::text as pemail, b.created_at::text as created
      from taster_bookings b join taster_requests r on r.id = b.request_id join lesson_events e on e.id = b.lesson_event_id join lesson_slots s on s.id = e.slot_id
      join course_groups g on g.id = e.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id join schools sc on sc.id = b.school_id
      left join teachers t on t.id = e.teacher_id left join users u on u.id = t.user_id
      where e.lesson_date between current_date - 14 and current_date + 60 and b.status <> 'cancelled'`);
    for (const t of tasters) {
      const first = t.child.split(" ")[0];
      const vars = { child: first, parent: t.parent, class: t.class, date: fmtDate(t.starts), time: fmtTime(t.starts), teacher: t.teacher ?? "one of our teachers",
        meet_link: t.meet ?? "the Google Meet invitation sent to " + t.cemail, book_link: book, school };
      const who = (cf: Cfg) => [...(cf.to_parent ? [{ name: t.parent, email: t.pemail }] : []), ...(cf.to_student ? [{ name: first, email: t.cemail }] : [])];
      c = cfg("taster_booked");
      if (c && t.status === "booked" && Date.parse(t.starts) > now && Date.parse(t.created) > now - 7 * 864e5) await deliver(q, "taster_booked", c, { ref: t.id, to: who(c), vars }, budget);
      c = cfg("taster_link");
      if (c && t.status === "booked") { const at = Date.parse(t.starts) - (c.minutes ?? 30) * 60e3; if (at > now + 60e3 && at < now + horizon) await deliver(q, "taster_link", c, { ref: t.id, to: who(c), vars, at: new Date(at) }, budget); }
      c = cfg("taster_follow_up");
      if (c && t.status === "attended") { const at = Date.parse(t.ends) + (c.minutes ?? 2) * 3600e3;
        if (at < now + horizon) { await deliver(q, "taster_follow_up", c, { ref: t.id, to: who(c), vars, at: at > now + 60e3 ? new Date(at) : undefined }, budget); await q(`update taster_bookings set followed_up_at = coalesce(followed_up_at, now()) where id = $1`, [t.id]); } }
    }

    // waiting list: places open for the families on the list
    c = cfg("waitlist_open");
    if (c) {
      const rows = await q<{ id: string; parent: string; child: string; email: string; class: string; hours: number }>(`select w.id, w.parent_name as parent, w.child_name as child, w.email::text,
          l.name || ' ' || sj.name as class, g.priority_hours as hours from waitlist_entries w join course_groups g on g.id = w.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
        where w.emailed_at > now() - interval '7 days' and w.enrolled_at is null and g.status = 'priority'`);
      for (const r of rows) await deliver(q, "waitlist_open", c, { ref: r.id, to: [{ name: r.parent, email: r.email }], vars: { parent: r.parent.split(" ")[0], child: r.child.split(" ")[0], class: r.class, hours: String(r.hours), book_link: book, school } }, budget);
    }

    // payments: a reminder before each charge, and a note when one fails
    c = cfg("payment_reminder");
    if (c) {
      const days = c.minutes ?? 3;
      const rows = await q<{ parent_id: string; parent: string; email: string; due: string; amount: number }>(`select p.id as parent_id, p.first_name as parent, p.email::text, i.due_on::text as due, sum(i.amount_pence)::int as amount
        from instalments i join enrolments e on e.id = i.enrolment_id join students s on s.id = e.student_id join parents p on p.id = s.parent_id
        where i.status = 'scheduled' and i.due_on > current_date and i.due_on <= current_date + $1::int group by p.id, i.due_on`, [days]);
      for (const r of rows) await deliver(q, "payment_reminder", c, { ref: `${r.parent_id}:${r.due}`, to: [{ name: r.parent, email: r.email }], vars: { parent: r.parent, amount: gbp(r.amount), date: fmtDate(r.due), school } }, budget);
    }
    c = cfg("payment_failed");
    if (c) {
      const rows = await q<{ id: string; parent: string; email: string; amount: number; child: string; class: string }>(`select i.id, p.first_name as parent, p.email::text, i.amount_pence as amount, s.first_name as child,
          l.name || ' ' || sj.name as class from instalments i join enrolments e on e.id = i.enrolment_id join students s on s.id = e.student_id join parents p on p.id = s.parent_id
          join course_groups g on g.id = e.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
        where i.status = 'failed' and i.due_on > current_date - 30`);
      for (const r of rows) await deliver(q, "payment_failed", c, { ref: r.id, to: [{ name: r.parent, email: r.email }], vars: { parent: r.parent, amount: gbp(r.amount), child: r.child, class: r.class, school } }, budget);
    }

    // reports: tell parents when a report round is published
    c = cfg("report_published");
    if (c) {
      const rows = await q<{ cycle: string; name: string; sid: string; child: string; parent: string; email: string }>(`select distinct c.id as cycle, c.name, s.id as sid, s.first_name as child, p.first_name as parent, p.email::text
        from report_cycles c join report_entries e on e.cycle_id = c.id and e.status = 'approved' join students s on s.id = e.student_id join parents p on p.id = s.parent_id
        where c.status = 'published' and c.published_at > now() - interval '14 days'`);
      for (const r of rows) await deliver(q, "report_published", c, { ref: `${r.cycle}:${r.sid}`, to: [{ name: r.parent, email: r.email }], vars: { parent: r.parent, child: r.child, report: r.name, school } }, budget);
    }
    // take back booked reminders that no longer apply: lesson cancelled, absence reported, left the class, taster cancelled
    const stale = await q<{ id: number; message_id: string | null }>(`select a.id, a.message_id from automation_sends a
      where a.status = 'scheduled' and a.scheduled_for > now() and (
        (a.key = 'lesson_reminder' and exists (select 1 from lesson_events e where e.id::text = split_part(a.ref, ':', 1) and (e.status = 'cancelled'
          or exists (select 1 from absence_notices n where n.lesson_event_id = e.id and n.student_id::text = split_part(a.ref, ':', 2) and n.cancelled_at is null)
          or not exists (select 1 from enrolments x where x.group_id = e.group_id and x.student_id::text = split_part(a.ref, ':', 2) and x.status = 'active'))))
        or (a.key in ('taster_link', 'taster_follow_up') and exists (select 1 from taster_bookings b where b.id::text = a.ref and b.status in ('cancelled', 'booked_course'))))`);
    for (const r of stale) { if (r.message_id) await cancelScheduled(r.message_id); await q(`update automation_sends set status = 'cancelled' where id = $1`, [r.id]); }
  });
  return { sent: limit - budget.n };
}

/** A cancelled lesson: take back the reminders already booked with Brevo. */
export async function cancelLessonReminders(eventId: string) {
  const rows = await withSchool((q) => q<{ id: number; message_id: string | null }>(`select id, message_id from automation_sends where key in ('lesson_reminder') and ref like $1 || ':%' and status = 'scheduled'`, [eventId]));
  for (const r of rows) {
    if (r.message_id) await cancelScheduled(r.message_id);
    await withSchool((q) => q(`update automation_sends set status = 'cancelled' where id = $1`, [r.id]));
  }
}

/** Send a test of one automation to the signed-in admin, with example details. */
export async function testAutomation(key: string, to: Recipient, d: { subject: string; body: string }) {
  const school = (await withSchool((q) => q<{ name: string }>(`select name from schools where id = current_school()`)))[0]?.name ?? "OH-SO ED";
  const vars = { parent: to.name.split(" ")[0], child: "Sam", class: "KS3 Maths", date: fmtDate(new Date(Date.now() + 864e5).toISOString().slice(0, 10)), time: "16:00", teacher: "Becky",
    meet_link: "https://meet.google.com/abc-defg-hij", book_link: (process.env.SITE_URL || "") + "/courses", amount: "£150.00", hours: "48", report: "Term 1 Progress Report", school };
  return sendOne([to], `[Test] ${fill(d.subject, vars)}`, fill(d.body, vars), { tag: `auto-test-${key}` });
}

let last = 0;
/** After admin pages load: run at most every 10 minutes per server. */
export async function automationsBackground() {
  if (Date.now() - last < 10 * 60e3) return;
  last = Date.now();
  await runAutomations().catch((e) => console.error("automations", e));
}
