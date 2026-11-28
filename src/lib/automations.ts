import "server-only";
import { holdBooked } from "./test-mode";
import { withSchool } from "./db";
import { sendOne, cancelScheduled, emailReady, type Recipient } from "./email";
import { joinPath, videoSettings } from "./checkins";
import { linkWords } from "./email-layout";
import { classroomUrl } from "./week-timetable";

// Admin → Automations. Each automation is a trigger with an email; the school can switch it off and change the wording and
// timing. A runner (after admin pages load, and from the daily job) finds what's due and sends it once, or schedules it with
// Brevo for the exact minute (Brevo holds scheduled emails up to 72 hours ahead, so timed reminders are booked up to 2 days ahead).

type Q = <T = Record<string, unknown>>(s: string, p?: unknown[]) => Promise<T[]>;
type Cfg = { enabled: boolean; subject: string; body: string; minutes: number | null; to_parent: boolean; to_student: boolean };
export type Timing = { label: string; unit: "minutes" | "hours" | "days"; default: number } | null;
export type AutoDef = { key: string; name: string; when: string; timing: Timing; to_parent: boolean; to_student: boolean; to_teacher?: boolean; parent_only?: boolean; subject: string; body: string; fields: string[]; default_on?: boolean };

export const DEFS: AutoDef[] = [
  { key: "taster_booked", name: "Taster booked: thank you", when: "As soon as a taster lesson is booked (on the website or by the office).", timing: null, to_parent: true, to_student: false,
    fields: ["parent", "child", "class", "date", "time", "teacher", "school"],
    subject: "Thank you for booking {{child}}’s taster lesson",
    body: "Dear {{parent}},\n\nThank you for booking a free taster lesson for {{child}}: {{class}} on {{date}} at {{time}} with {{teacher}}.\n\n{{child}} will get the Google Meet invitation for the lesson by email, and we’ll send the joining link again shortly before it starts.\n\nWe look forward to meeting {{child}}.\n\n{{school}}" },
  // 28 Nov: the child's own email when a taster is booked: the lesson link and the class's Google Classroom
  { key: "taster_student_welcome", name: "Taster booked: the child’s lesson and Classroom links", when: "As soon as a taster lesson is booked, to the child’s Google email.", timing: null, to_parent: false, to_student: true,
    fields: ["child", "class", "date", "time", "teacher", "meet_link", "classroom_link", "school"],
    subject: "Your taster lesson: {{class}} on {{date}}",
    body: "Hi {{child}},\n\nYou’re booked in for a free taster lesson: **{{class}}** on **{{date}} at {{time}}** with {{teacher}}.\n\n👉 [Join the lesson]({{meet_link}})\n\nYou’ll also get an invitation to the class’s Google Classroom. Please open it and press **Join**, so you can see the class’s work: [Open Google Classroom]({{classroom_link}})\n\nPlease use this Google account (the one this email came to) for both. We’ll send you the lesson link again just before it starts.\n\nSee you there!\n{{school}}" },
  { key: "taster_link", name: "Taster: joining link before the lesson", when: "Before the taster lesson starts.", timing: { label: "minutes before the lesson", unit: "minutes", default: 30 }, to_parent: true, to_student: true,
    fields: ["parent", "child", "class", "date", "time", "meet_link", "school"],
    subject: "{{child}}’s taster lesson starts at {{time}}",
    body: "Hello,\n\n{{child}}’s taster lesson, {{class}}, starts today at {{time}}.\n\n👉 [Join Google Meet]({{meet_link}})\n\nPlease join a couple of minutes early, signed in with the Google account we have for {{child}}.\n\n{{school}}" },
  { key: "lesson_reminder", name: "Lesson reminder with the Meet link", when: "Before every timetabled lesson, to each student in the class.", timing: { label: "minutes before each lesson", unit: "minutes", default: 15 }, to_parent: false, to_student: true,
    fields: ["child", "class", "time", "teacher", "meet_link", "school"],
    subject: "{{class}} starts at {{time}}",
    body: "Hi {{child}},\n\nJust a quick reminder that your **{{class}}** lesson with {{teacher}} starts at **{{time}}**.\n\nPlease join a few minutes early so you’re settled in and ready:\n\n👉 [Join Google Meet]({{meet_link}})\n\nSee you there!\n{{school}}" },
  // 27 Nov: sent when the office reschedules or cancels a lesson (Reschedule on the lesson, Timetable, or a teacher's request
  // approved) with "Email the class's parents and students" ticked. Ticked unless this automation is saved as switched off.
  { key: "lesson_moved", name: "Lesson rescheduled: tell the class", default_on: true, when: "When a lesson is moved to a new time (Reschedule), to every parent and student in the class. The lesson reminder then goes before the new time.", timing: null, to_parent: true, to_student: true,
    fields: ["class", "teacher", "old_when", "new_when", "reason", "meet_link", "school"],
    subject: "{{class}}: lesson moved to {{new_when}}",
    body: "Hello,\n\nThe **{{class}}** lesson on {{old_when}} has moved to **{{new_when}}**.{{reason}}\n\nIt uses the class’s usual Google Meet, and the new time is already on your dashboard and in your calendar. We’ll send the usual reminder before it starts.\n\n👉 [Join Google Meet]({{meet_link}})\n\nThank you,\n{{school}}" },
  { key: "lesson_cancelled", name: "Lesson cancelled: tell the class", default_on: true, when: "When a lesson is cancelled, to every parent and student in the class. No reminder is sent for it.", timing: null, to_parent: true, to_student: true,
    fields: ["class", "teacher", "old_when", "reason", "school"],
    subject: "{{class}}: lesson cancelled on {{old_when}}",
    body: "Hello,\n\nThe **{{class}}** lesson on {{old_when}} is cancelled.{{reason}}\n\nWe’re sorry for any inconvenience. If we arrange a replacement lesson, we’ll let you know and it will show on your dashboard and in your calendar.\n\nThank you,\n{{school}}" },
  { key: "taster_follow_up", name: "After a taster: invite to book", when: "After a taster lesson the child came to.", timing: { label: "hours after the lesson ends", unit: "hours", default: 2 }, to_parent: true, to_student: false,
    fields: ["parent", "child", "class", "book_link", "school"],
    subject: "How did {{child}}’s taster go?",
    body: "Dear {{parent}},\n\nThank you for bringing {{child}} to the {{class}} taster lesson. We hope they enjoyed it.\n\nIf you’d like {{child}} to join the class, you can book a place here: [Book a place]({{book_link}})\n\nPlaces are limited, so do get in touch if you have any questions.\n\n{{school}}" },
  { key: "taster_follow_up_final", name: "After a taster: last reminder to book", when: "Once, if the family hasn’t booked a course, joined a waiting list, booked another taster or replied after “After a taster: invite to book”.", timing: { label: "days after the first follow-up", unit: "days", default: 7 }, to_parent: true, to_student: false,
    fields: ["parent", "child", "class", "date", "book_link", "school"],
    subject: "A place in {{class}} for {{child}}?",
    body: "Dear {{parent}},\n\nWe wanted to check in once more after {{child}}’s {{class}} taster lesson on {{date}}.\n\nIf {{child}} would like to join the class, you can book a place here: [Book a place]({{book_link}})\n\nIf you have any questions, or would like to talk it through, just reply to this email.\n\nKind regards,\n{{school}}" },
  { key: "trial_waitlist_invite", name: "After a trial taster: join the waiting list", when: "After a taster lesson in a trial class (a new course that isn’t running yet), instead of “After a taster: invite to book”. The link adds the child to the class’s waiting list in one click.", timing: { label: "hours after the lesson ends", unit: "hours", default: 2 }, to_parent: true, to_student: false,
    fields: ["parent", "child", "class", "needed", "join_link", "school"],
    subject: "Would {{child}} like to join {{class}}?",
    body: "Dear {{parent}},\n\nThank you for bringing {{child}} to the {{class}} taster lesson. We hope they enjoyed it.\n\n{{class}} is a new course, and it will only start once {{needed}} families have signed up for it. If you’d like {{child}} to take part, please add them to the waiting list here:\n\n👉 [Join the waiting list]({{join_link}})\n\nJoining the list is free and doesn’t commit you to anything. As soon as enough families have joined, we’ll email you and you can book {{child}}’s place before anyone else.\n\n{{school}}" },
  { key: "waitlist_joined", name: "Waiting list: you’re on the list", when: "When a family joins a class’s waiting list and the class hasn’t reached its target yet.", timing: null, to_parent: true, to_student: false,
    fields: ["parent", "child", "class", "count", "needed", "school"],
    subject: "{{child}} is on the waiting list for {{class}}",
    body: "Dear {{parent}},\n\nThank you, {{child}} is on the waiting list for {{class}}.\n\nPlease note the course only goes ahead once {{needed}} families have signed up. So far {{count}} have. We’ll email you as soon as it’s going ahead, and you’ll be able to book {{child}}’s place before anyone else. There’s nothing to pay until then.\n\nIf you know anyone else who might be interested, do let them know.\n\n{{school}}" },
  { key: "trial_opened", name: "Trial course opens: tell the taster families", when: "When a trial class opens to everyone (it reached its waiting-list target, or you unticked Trial), to each family whose child had a taster in it, isn’t booked on it and isn’t on its waiting list (they’ve already been told).", timing: null, to_parent: true, to_student: false,
    fields: ["parent", "child", "class", "book_link", "school"],
    subject: "{{class}} is now open for booking",
    body: "Dear {{parent}},\n\nThank you for {{child}} trying {{class}} with us. We’re pleased to say the course is now open, and you can book {{child}}’s place here: [Book {{child}}’s place]({{book_link}})\n\nPlaces are limited, so do get in touch if you have any questions.\n\n{{school}}" },
  { key: "taster_missed", name: "Taster missed: book another date", when: "After a taster lesson the child didn’t join (from Google Meet attendance).", timing: { label: "hours after the lesson ends", unit: "hours", default: 3 }, to_parent: true, to_student: false,
    fields: ["parent", "child", "class", "date", "time", "taster_link", "school"],
    subject: "We missed {{child}} at the taster lesson",
    body: "Dear {{parent}},\n\nWe didn’t see {{child}} at the {{class}} taster lesson on {{date}}. We hope everything is all right.\n\nIf {{child}} would still like to try a lesson, you can book another date here: [Book another taster lesson]({{taster_link}})\n\nIf something went wrong joining, just reply to this email and we’ll help.\n\nKind regards,\n{{school}}" },
  { key: "taster_missed_final", name: "Taster missed: last reminder", when: "Once, if the family hasn’t booked another taster, booked a course or replied after “Taster missed: book another date”.", timing: { label: "days after the first email", unit: "days", default: 7 }, to_parent: true, to_student: false,
    fields: ["parent", "child", "class", "date", "taster_link", "school"],
    subject: "Would {{child}} still like to try {{class}}?",
    body: "Dear {{parent}},\n\nWe’re sorry we missed {{child}} at the {{class}} taster lesson on {{date}}.\n\nThe offer of a free taster still stands: you can choose another date here: [Book another taster lesson]({{taster_link}})\n\nIf something got in the way, or you’d rather talk first, just reply to this email.\n\nKind regards,\n{{school}}" },
  { key: "waitlist_open", name: "Waiting list: places are open", when: "When a course reaches its waiting-list target and the families on the list can book first.", timing: null, to_parent: true, to_student: false,
    fields: ["parent", "child", "class", "book_link", "hours", "school"],
    subject: "{{class}} is opening: book {{child}}’s place first",
    body: "Dear {{parent}},\n\nGood news: enough families have joined the waiting list, so {{class}} is going ahead.\n\nAs you were on the list, you can book {{child}}’s place before anyone else for the next {{hours}} hours:\n\n👉 [Book {{child}}’s place]({{book_link}})\n\n{{school}}" },
  { key: "payment_reminder", name: "Payment reminder", when: "Before each term’s payment is taken (by Direct Debit or card).", timing: { label: "days before the payment", unit: "days", default: 3 }, to_parent: true, to_student: false,
    fields: ["parent", "amount", "date", "how", "payments_link", "school"],
    subject: "Your next payment of {{amount}} on {{date}}",
    body: "Dear {{parent}},\n\nA reminder that your next termly payment of {{amount}} will be {{how}} on {{date}}.\n\nIf your bank account or card has changed, please update it before then: [Update how you pay]({{payments_link}})\n\n{{school}}" },
  { key: "payment_failed", name: "Payment failed", when: "When a termly payment can’t be taken.", timing: null, to_parent: true, to_student: false,
    fields: ["parent", "amount", "child", "class", "payments_link", "school"],
    subject: "We couldn’t take your payment of {{amount}}",
    body: "Dear {{parent}},\n\nWe tried to take this term’s payment of {{amount}} for {{child}}’s {{class}} course, but it didn’t go through. We’ll try once more in a few days.\n\nPlease check your bank account or card, or [update how you pay]({{payments_link}})\n\nOr reply to this email if you’d like to talk about it.\n\n{{school}}" },
  // 27 Nov (Alfonso): chase a payment that was declined or rejected, until it's paid (up to 3 times)
  { key: "payment_chase", name: "Payment still unpaid: chase", default_on: true, when: "While a termly payment that was declined or rejected is still unpaid: a reminder every few days, up to 3 times. Stops as soon as it’s paid.", timing: { label: "days between reminders", unit: "days", default: 7 }, to_parent: true, to_student: false,
    fields: ["parent", "amount", "term", "courses", "days", "payments_link", "school"],
    subject: "Reminder: your {{term}} payment of {{amount}} is still unpaid",
    body: "Dear {{parent}},\n\nYour {{term}} payment of {{amount}} is now {{days}} days overdue. It’s for:\n\n{{courses}}\n\nYour bank or card declined it when we tried to take it. Please check your account, or [update how you pay]({{payments_link}}), and we’ll try again.\n\nIf something’s wrong, just reply to this email and we’ll help.\n\n{{school}}" },
  { key: "report_published", name: "Report ready", when: "When a progress report is published.", timing: null, to_parent: true, to_student: false,
    fields: ["parent", "child", "report", "school"],
    subject: "{{child}}’s {{report}} is ready",
    body: "Dear {{parent}},\n\n{{child}}’s {{report}} is ready. Sign in to your account to read it.\n\n{{school}}" },
  // 27 Nov (Alfonso): Classroom work, attendance and reward points, for families
  { key: "assignment_due", name: "Classroom work due soon", when: "Once for each piece of Google Classroom work that isn’t handed in yet, a set number of days before it’s due (all of a student’s pieces in one email).", timing: { label: "days before it’s due", unit: "days", default: 1 }, to_parent: true, to_student: true,
    fields: ["name", "child", "list", "count", "assignments_link", "school"],
    subject: "Work due soon for {{child}}: {{count}}",
    body: "Hi {{name}},\n\nA reminder that this Google Classroom work for {{child}} is due soon and hasn’t been handed in yet:\n\n{{list}}\n\nIt’s handed in through Google Classroom. [See the work]({{assignments_link}})\n\n{{school}}" },
  { key: "assignment_overdue", name: "Classroom work overdue", when: "Once for each piece of Google Classroom work that’s past its due date and still not handed in (or was sent back to redo), a set number of days after the due date.", timing: { label: "days after the due date", unit: "days", default: 1 }, to_parent: true, to_student: true,
    fields: ["name", "child", "list", "count", "assignments_link", "school"],
    subject: "Overdue work for {{child}}: {{count}}",
    body: "Hi {{name}},\n\nThis Google Classroom work for {{child}} is past its due date and hasn’t been handed in yet:\n\n{{list}}\n\nPlease hand it in through Google Classroom as soon as possible. If something’s getting in the way, reply to this email and we’ll let the teacher know.\n\n[See the work]({{assignments_link}})\n\n{{school}}" },
  { key: "attendance_week", name: "Attendance this week", parent_only: true, when: "Every Friday from 5pm: each child’s lessons that week, and whether they were there (parents only).", timing: null, to_parent: true, to_student: false,
    fields: ["parent", "week", "summary", "attendance_link", "school"],
    subject: "Attendance this week: {{week}}",
    body: "Dear {{parent}},\n\nHere’s how this week’s lessons went:\n\n{{summary}}\n\nIf a lesson is marked absent and you think that’s wrong, just reply to this email. [See all attendance]({{attendance_link}})\n\nHave a lovely weekend,\n{{school}}" },
  // 27 Nov (Alfonso): remind parents to book exams with the exam partner (Tutors & Exams), with the partner code, before each
  // booking deadline in Admin → Website → Resources → Important dates that's ticked "Remind parents"
  { key: "exam_booking", name: "Exam booking reminder", parent_only: true, default_on: true, when: "Before each exam booking deadline ticked “Remind parents” under Important dates (Admin → Website → Resources), to parents of students on a GCSE or iGCSE course: once the set number of days before, and again a week before.", timing: { label: "days before the deadline", unit: "days", default: 28 }, to_parent: true, to_student: false,
    fields: ["parent", "child", "deadline", "date", "days", "partner", "booking_link", "code_line", "dates_link", "school"],
    subject: "Booking exams: {{deadline}} is on {{date}}",
    body: "Dear {{parent}},\n\nA reminder that **{{deadline}}** is on **{{date}}**, in {{days}} days.\n\nIf {{child}} is sitting exams this summer, please book them with our exam partner, {{partner}}:\n\n👉 [Book exams with {{partner}}]({{booking_link}})\n\n{{code_line}}\n\nAll the dates (booking deadlines, exams and results) are on your dashboard: [Important dates]({{dates_link}})\n\nIf you have any questions, just reply to this email.\n\n{{school}}" },
  { key: "reward_points", name: "Reward points given", when: "Soon after a teacher gives reward points (several at once go in one email).", timing: null, to_parent: true, to_student: true,
    fields: ["name", "child", "list", "points", "total", "rewards_link", "school"],
    subject: "{{child}} earned {{points}} reward points",
    body: "Hi {{name}},\n\nWell done! {{child}} has been given reward points:\n\n{{list}}\n\nThat’s **{{total}} points this term**. The top 3 in the school at the end of term win a prize. [See the leaderboard]({{rewards_link}})\n\n{{school}}" },
  // 27 Nov (Alfonso): a hand-in with nothing attached, or a photo the wrong way round: the student is asked to hand it in again
  { key: "handin_redo", name: "Hand-in needs doing again", default_on: true, when: "After each Google Classroom read (every few hours): when a student hands in work with nothing attached, or a photo of their work that’s sideways or upside down. Once for each hand-in.", timing: null, to_parent: false, to_student: true,
    fields: ["name", "child", "work", "class", "problem", "fix", "link", "school"],
    subject: "Please hand in “{{work}}” again",
    body: "Hi {{name}},\n\nYour work for {{class}}, “[{{work}}]({{link}})”, {{problem}}, so your teacher can’t mark it yet.\n\nTo fix it: open it in Google Classroom, press **Unsubmit**, {{fix}}, then press **Hand in** again.\n\n[Open it in Classroom]({{link}})\n\nThank you,\n{{school}}" },
  // 6 Nov: to the teacher, not families
  { key: "marking_reminder", name: "Marking reminder to the teacher", when: "Once a day (between 8am and 8pm) while any handed-in work in their classes is close to or past the 7-day marking turnaround, starting", timing: { label: "days before the marking deadline", unit: "days", default: 2 }, to_parent: false, to_student: false, to_teacher: true,
    fields: ["teacher", "count", "list", "dashboard_link", "school"],
    subject: "Marking due soon: {{count}}",
    body: "Hello {{teacher}},\n\nA reminder that this handed-in work needs marking and returning in Google Classroom within the 7-day turnaround:\n\n{{list}}\n\nWork comes off this list once it’s returned to the student in Classroom. Your dashboard shows the countdown: {{dashboard_link}}\n\nThank you,\n{{school}}" },
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
      from automation_sends where status <> 'included' order by created_at desc limit 40`),
  }));
  return { ready: await emailReady(), recent, rows: DEFS.map((d) => { const r = saved.find((x) => x.key === d.key), st = stats.find((x) => x.key === d.key);
    return { ...d, enabled: r?.enabled ?? d.default_on ?? false, subject: r?.subject ?? d.subject, body: r?.body ?? d.body, minutes: r ? r.minutes : d.timing?.default ?? null,
      to_parent: r?.to_parent ?? d.to_parent, to_student: r?.to_student ?? d.to_student, custom: !!r, sent7: st?.sent7 ?? 0, scheduled: st?.scheduled ?? 0, failed7: st?.failed7 ?? 0 }; }) };
}

export async function saveAutomation(actorId: string, key: string, d: { enabled: boolean; subject: string; body: string; minutes: number | null; to_parent: boolean; to_student: boolean }): Promise<string | null> {
  const def = DEFS.find((x) => x.key === key); if (!def) return "Unknown automation.";
  if (!d.subject.trim() || !d.body.trim()) return "Write a subject and a message.";
  if (def.parent_only) d = { ...d, to_student: false, to_parent: true };   // e.g. Attendance this week goes to parents only
  if (!def.to_teacher && !d.to_parent && !d.to_student) return "Choose who it goes to.";
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
    const res = await sendOne([r], fill(cfg.subject, vars), fill(linkWords(cfg.body), vars), { tag: `auto-${key}`, scheduledAt: job.at?.toISOString() });
    // held by test mode: remembered as 'held' (booked again when the school goes live, if the time is still to come)
    await q(`update automation_sends set status = $2, message_id = $3, error = $4 where id = $1`, [claim[0].id, res.held ? "held" : res.ok ? (job.at ? "scheduled" : "sent") : "failed", res.ids[0] ?? null, res.held ? "Test mode" : res.error ?? null]);
  }
}

/** 27 Nov: one email listing several things (pieces of work, reward points), each thing sent only once per person. Claims
 *  each line's ref for this recipient; if any are new, sends one email with just those lines. The email's own row keeps
 *  the status (sent, held, failed); the other lines are marked 'included'. */
async function deliverDigest(q: Q, key: string, cfg: Cfg, to: Recipient, lines: { ref: string; line: string }[], vars: (got: { ref: string; line: string }[]) => Record<string, string>, budget: { n: number }): Promise<void> {
  if (budget.n <= 0 || !to.email) return;
  const got: { id: number; ref: string; line: string }[] = [];
  for (const l of lines) {
    const c = await q<{ id: number }>(`insert into automation_sends (school_id, key, ref, to_email, status) values (current_school(), $1, $2, $3, 'included')
      on conflict (school_id, key, ref, to_email) do nothing returning id`, [key, l.ref, to.email]);
    if (c.length) got.push({ id: c[0].id, ref: l.ref, line: l.line });
  }
  if (!got.length) return;
  budget.n--;
  const v = vars(got);
  const res = await sendOne([to], fill(cfg.subject, v), fill(linkWords(cfg.body), v), { tag: `auto-${key}` });
  await q(`update automation_sends set status = $2, message_id = $3, error = $4 where id = $1`, [got[0].id, res.held ? "held" : res.ok ? "sent" : "failed", res.ids[0] ?? null, res.held ? "Test mode" : res.error ?? null]);
  // a failed send lets the lines go out again next time
  if (!res.ok && !res.held) await q(`delete from automation_sends where id = any($1::bigint[])`, [got.slice(1).map((g) => g.id)]);
}

/** Tasters whose lesson ended over 90 minutes ago: attended or didn't come, from Google Meet's log. */
export async function settleTasters(): Promise<void> {
  await withSchool((q) => q(`select settle_tasters()`)).catch((e) => console.error("settle tasters", e));
}

/** Find everything due and send it (or book it with Brevo for the right minute). Safe to run as often as you like. */
export async function runAutomations(limit = 150): Promise<{ sent: number }> {
  await import("./reports").then((r) => r.syncReportEntries()).catch(() => null);   // 28 Nov: report rounds follow who joins and leaves classes
  await settleTasters();   // 28 Nov: whether each taster came is worked out even when email isn't set up (the journey on Admin → Tasters)
  if (!(await emailReady())) return { sent: 0 };
  await holdBooked().catch((e) => console.error("test mode", e));   // test mode: take back reminders booked for families before it was switched on
  const budget = { n: limit };
  await withSchool(async (q) => {
    const saved = await q<Cfg & { key: string }>(`select key, enabled, subject, body, minutes, to_parent, to_student from automations`);
    // 27 Nov: an automation that's on by default (e.g. payment chase) runs with its standard wording until the school saves it
    const cfg = (key: string): Cfg | null => { const r = saved.find((s) => s.key === key); if (r) return r.enabled ? r : null;
      const d = DEFS.find((x) => x.key === key); return d?.default_on ? { enabled: true, subject: d.subject, body: d.body, minutes: d.timing?.default ?? null, to_parent: d.to_parent, to_student: d.to_student } : null; };
    const [sc] = await q<{ name: string; base: string | null }>(`select name, (select value #>> '{}' from social_kv where key = 'base') as base from schools where id = current_school()`).catch(() => [{ name: "OH-SO ED", base: null }]);
    const school = sc?.name ?? "OH-SO ED", base = (process.env.SITE_URL || sc?.base || "").replace(/\/$/, ""), book = base ? `${base}/courses` : "our website", tasterLink = base ? `${base}/taster` : "our website";
    const now = Date.now(), horizon = 48 * 3600e3;

    // lesson reminders: every student in the class, the set number of minutes before each lesson
    let c = cfg("lesson_reminder");
    if (c) {
      const m = c.minutes ?? 15;
      const vid = await videoSettings(q);
      const { viaDashboard } = await (await import("./lesson-access")).accessSettings(q);
      const rows = await q<{ ev: string; gid: string; starts: string; class: string; teacher: string | null; meet: string | null; sid: string; child: string; semail: string | null; parent: string; pemail: string }>(`
        select e.id as ev, g.id as gid, ((e.lesson_date + s.starts_at) at time zone sc.timezone)::text as starts, l.name || ' ' || sj.name as class, u.name as teacher, g.meet_url as meet,
          st.id as sid, st.first_name as child, st.email::text as semail, p.first_name as parent, p.email::text as pemail
        from lesson_events e join lesson_slots s on s.id = e.slot_id join course_groups g on g.id = e.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
        join schools sc on sc.id = e.school_id left join teachers t on t.id = e.teacher_id left join users u on u.id = t.user_id
        join enrolments x on x.group_id = g.id and x.status = 'active' and not x.is_taster join students st on st.id = x.student_id join parents p on p.id = st.parent_id
        where e.status = 'scheduled' and e.lesson_date between current_date and current_date + 3   -- cancelled lessons never; a rescheduled one at its new time
          and not exists (select 1 from absence_notices a where a.lesson_event_id = e.id and a.student_id = st.id and a.cancelled_at is null)
        order by e.lesson_date, s.starts_at`);
      for (const r of rows) {
        const at = Date.parse(r.starts) - m * 60e3; if (at < now + 60e3 || at > now + horizon) continue;
        const to = [...(c.to_student && r.semail ? [{ name: r.child, email: r.semail }] : []), ...(c.to_parent ? [{ name: r.parent, email: r.pemail }] : [])];
        await deliver(q, "lesson_reminder", c, { ref: `${r.ev}:${r.sid}`, to, at: new Date(at), vars: { child: r.child, parent: r.parent, class: r.class, time: fmtTime(r.starts), teacher: r.teacher ?? "your teacher",
          // with check-ins, the link checks the child in first; with "join through the dashboard" (5 Nov) it needs the student signed in to their own account
          meet_link: r.meet ? (viaDashboard && base ? `${base}/join/${r.gid}` : vid.checkins && base ? base + joinPath(r.gid, r.sid) : r.meet) : "the lesson link in your class’s Google Classroom", school } }, budget);
      }
    }

    // 6 Nov: marking reminder to each teacher, once a day while any hand-in is within the set days of the 7-day turnaround (or past it)
    c = cfg("marking_reminder");
    const hour = Number(new Date().toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Europe/London" }));
    if (c && hour >= 8 && hour < 20) {
      const { markingQueue, countdown } = await import("./marking");
      const near = (await markingQueue(null, q)).filter((m) => m.teacherEmail && m.teacherUserId && m.daysLeft <= (c!.minutes ?? 2));
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
      for (const t of [...new Set(near.map((m) => m.teacherUserId!))]) {
        const mine = near.filter((m) => m.teacherUserId === t), first = mine[0];
        await deliver(q, "marking_reminder", c, { ref: `${t}:${today}`, to: [{ name: first.teacher ?? "", email: first.teacherEmail! }], vars: { teacher: (first.teacher ?? "").split(" ")[0], parent: "",
          count: `${mine.length} piece${mine.length === 1 ? "" : "s"} of work`, list: mine.map((m) => `• ${m.title} (${m.cls}) · ${m.toMark} to mark · ${countdown(m.daysLeft)}`).join("\n"),
          dashboard_link: base ? `${base}/admin/teacher` : "your dashboard", school } }, budget);
      }
    }
    // tasters: thank-you now, joining link before the lesson, then (from Meet attendance) an invitation to book, or another date if they missed it
    const tasters = await q<{ id: string; status: string; starts: string; ends: string; class: string; teacher: string | null; meet: string | null; child: string; cemail: string; parent: string; pemail: string; created: string; trial: boolean; token: string; needed: number; was_trial: boolean; course: string | null; answered: boolean }>(`
      select b.id, b.status::text, ((e.lesson_date + s.starts_at) at time zone sc.timezone)::text as starts, ((e.lesson_date + s.ends_at) at time zone sc.timezone)::text as ends,
        l.name || ' ' || sj.name as class, u.name as teacher, g.meet_url as meet, r.child_name as child, r.child_email::text as cemail, r.parent_first_name as parent, r.parent_email::text as pemail, b.created_at::text as created,
        g.trial, b.join_token::text as token, g.waitlist_threshold as needed,
        (g.trial_ended_at is not null and e.lesson_date <= (g.trial_ended_at at time zone sc.timezone)::date) as was_trial, g.google_course_id as course,
        (tj.enrolled_at is not null or tj.rebooked_at is not null or tj.waitlist_at is not null or tj.replied_at is not null) as answered
      from taster_bookings b join taster_journey tj on tj.id = b.id join taster_requests r on r.id = b.request_id join lesson_events e on e.id = b.lesson_event_id join lesson_slots s on s.id = e.slot_id
      join course_groups g on g.id = e.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id join schools sc on sc.id = b.school_id
      left join teachers t on t.id = e.teacher_id left join users u on u.id = t.user_id
      where e.lesson_date between current_date - 14 and current_date + 60 and b.status <> 'cancelled'`);
    // 28 Nov: when each family got the first email after the lesson (for the last reminder a week later)
    const firstSent = new Map((tasters.length ? await q<{ k: string; at: string }>(`select key || ':' || ref as k, min(coalesce(scheduled_for, created_at))::text as at from automation_sends
      where key in ('taster_follow_up', 'taster_missed') and ref = any($1::text[]) and status in ('sent', 'scheduled', 'held') group by key, ref`, [tasters.map((t) => t.id)]) : []).map((r) => [r.k, Date.parse(r.at)]));
    for (const t of tasters) {
      const first = t.child.split(" ")[0];
      const vars = { child: first, parent: t.parent, class: t.class, date: fmtDate(t.starts), time: fmtTime(t.starts), teacher: t.teacher ?? "one of our teachers",
        meet_link: t.meet ?? "the Google Meet invitation sent to " + t.cemail, book_link: book, school };
      const who = (cf: Cfg) => [...(cf.to_parent ? [{ name: t.parent, email: t.pemail }] : []), ...(cf.to_student ? [{ name: first, email: t.cemail }] : [])];
      c = cfg("taster_student_welcome");
      if (c && t.status === "booked" && Date.parse(t.starts) > now && Date.parse(t.created) > now - 7 * 864e5)
        await deliver(q, "taster_student_welcome", c, { ref: t.id, to: [{ name: first, email: t.cemail }], vars: { ...vars, classroom_link: t.course ? classroomUrl(t.course) : "https://classroom.google.com" } }, budget);
      // the last reminder: once, a set number of days after the first email, only if the family hasn't done anything since
      const last = (key: string, firstKey: string, extra: Record<string, string> = {}) => { const cf = cfg(key), sent = firstSent.get(`${firstKey}:${t.id}`);
        if (!cf || !sent || t.answered || sent + (cf.minutes ?? 7) * 864e5 > now) return null;
        return deliver(q, key, cf, { ref: t.id, to: who(cf), vars: { ...vars, ...extra } }, budget); };
      if (t.status === "attended" && !t.trial && !t.was_trial) await last("taster_follow_up_final", "taster_follow_up");
      if (t.status === "no_show") await last("taster_missed_final", "taster_missed", { taster_link: tasterLink });
      c = cfg("taster_booked");
      if (c && t.status === "booked" && Date.parse(t.starts) > now && Date.parse(t.created) > now - 7 * 864e5) await deliver(q, "taster_booked", c, { ref: t.id, to: who(c), vars }, budget);
      c = cfg("taster_link");
      if (c && t.status === "booked") { const at = Date.parse(t.starts) - (c.minutes ?? 30) * 60e3; if (at > now + 60e3 && at < now + horizon) await deliver(q, "taster_link", c, { ref: t.id, to: who(c), vars, at: new Date(at) }, budget); }
      c = cfg("taster_missed");
      if (c && t.status === "no_show") { const at = Date.parse(t.ends) + (c.minutes ?? 3) * 3600e3;
        if (at < now + horizon) await deliver(q, "taster_missed", c, { ref: t.id, to: who(c), vars: { ...vars, taster_link: tasterLink }, at: at > now + 60e3 ? new Date(at) : undefined }, budget); }
      c = cfg("trial_waitlist_invite");   // 26 Nov: a trial class isn't running yet, so invite to the waiting list rather than to book
      if (c && t.status === "attended" && t.trial) { const at = Date.parse(t.ends) + (c.minutes ?? 2) * 3600e3;
        if (at < now + horizon) { await deliver(q, "trial_waitlist_invite", c, { ref: t.id, to: who(c), vars: { ...vars, needed: String(t.needed), join_link: base ? `${base}/waitlist/join?t=${t.token}` : "our website" }, at: at > now + 60e3 ? new Date(at) : undefined }, budget);
          await q(`update taster_bookings set followed_up_at = coalesce(followed_up_at, now()) where id = $1`, [t.id]); } }
      c = cfg("taster_follow_up");
      if (c && t.status === "attended" && !t.trial && !t.was_trial) {   // a taster from while the class was a trial: they hear through the waiting list or "trial course opens"
        const at = Date.parse(t.ends) + (c.minutes ?? 2) * 3600e3;
        if (at < now + horizon) { await deliver(q, "taster_follow_up", c, { ref: t.id, to: who(c), vars, at: at > now + 60e3 ? new Date(at) : undefined }, budget); await q(`update taster_bookings set followed_up_at = coalesce(followed_up_at, now()) where id = $1`, [t.id]); } }
    }

    // 26 Nov: a trial class opened for booking (in the last 14 days): each taster family whose child isn't booked on it yet
    await q(`select open_expired_priority()`).catch((e) => console.error("open priority classes", e));   // head starts that have ended: open to everyone
    c = cfg("trial_opened");
    if (c) {
      const rows = await q<{ id: string; class: string; child: string; cemail: string; parent: string; pemail: string }>(`select distinct on (r.id) r.id, l.name || ' ' || sj.name as class,
          r.child_name as child, r.child_email::text as cemail, r.parent_first_name as parent, r.parent_email::text as pemail
        from course_groups g join lesson_events e on e.group_id = g.id join taster_bookings b on b.lesson_event_id = e.id join taster_requests r on r.id = b.request_id
          join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
        where g.trial_ended_at > now() - interval '14 days' and not g.trial and g.status = 'open' and b.status <> 'cancelled'
          and not exists (select 1 from waitlist_entries w where w.group_id = g.id and (w.taster_booking_id = b.id or lower(w.email::text) = lower(r.parent_email::text)))
          and not exists (select 1 from enrolments x where x.group_id = g.id and x.status in ('pending', 'active') and not x.is_taster
            and (x.student_id = r.student_id or x.student_id in (select s.id from students s where lower(s.email::text) = lower(r.child_email::text))))`);
      for (const r of rows) await deliver(q, "trial_opened", c, { ref: r.id, to: [...(c.to_parent ? [{ name: r.parent, email: r.pemail }] : []), ...(c.to_student ? [{ name: r.child.split(" ")[0], email: r.cemail }] : [])],
        vars: { parent: r.parent, child: r.child.split(" ")[0], class: r.class, book_link: book, school } }, budget);
    }

    // 26 Nov: waiting list joined: tell them the course only runs once enough families sign up
    c = cfg("waitlist_joined");
    if (c) {
      const rows = await q<{ id: string; parent: string; child: string; email: string; class: string; count: number; needed: number }>(`select w.id, w.parent_name as parent, w.child_name as child, w.email::text,
          l.name || ' ' || sj.name as class, (select count(*)::int from waitlist_entries x where x.group_id = g.id and x.enrolled_at is null) as count, g.waitlist_threshold as needed
        from waitlist_entries w join course_groups g on g.id = w.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
        where w.created_at > now() - interval '7 days' and w.emailed_at is null and w.enrolled_at is null and (g.status = 'waitlist' or g.trial)`);
      for (const r of rows) await deliver(q, "waitlist_joined", c, { ref: r.id, to: [{ name: r.parent, email: r.email }], vars: { parent: r.parent.split(" ")[0], child: r.child.split(" ")[0], class: r.class, count: String(r.count), needed: String(r.needed), school } }, budget);
    }
    // waiting list: places open for the families on the list
    c = cfg("waitlist_open");
    if (c) {
      const rows = await q<{ id: string; parent: string; child: string; email: string; class: string; hours: number }>(`select w.id, w.parent_name as parent, w.child_name as child, w.email::text,
          l.name || ' ' || sj.name as class, g.priority_hours as hours from waitlist_entries w join course_groups g on g.id = w.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
        where w.emailed_at > now() - interval '7 days' and w.enrolled_at is null and g.status = 'priority'`);
      for (const r of rows) await deliver(q, "waitlist_open", c, { ref: r.id, to: [{ name: r.parent, email: r.email }], vars: { parent: r.parent.split(" ")[0], child: r.child.split(" ")[0], class: r.class, hours: String(r.hours), book_link: base ? `${base}/waitlist/book?w=${r.id}` : book, school } }, budget);
    }

    // payments: a reminder before each charge, and a note when one fails
    c = cfg("payment_reminder");
    if (c) {
      const days = c.minutes ?? 3;
      const rows = await q<{ parent_id: string; parent: string; email: string; due: string; amount: number; dd: boolean }>(`select p.id as parent_id, p.first_name as parent, p.email::text, i.due_on::text as due, sum(i.amount_pence)::int as amount,
          coalesce((select m.method = 'bacs' and m.status in ('active', 'pending') from family_pay_methods m where m.parent_id = p.id), false) as dd
        from instalments i join enrolments e on e.id = i.enrolment_id join students s on s.id = e.student_id join parents p on p.id = s.parent_id
        where i.status = 'scheduled' and i.due_on > current_date and i.due_on <= current_date + $1::int group by p.id, i.due_on`, [days]);
      for (const r of rows) await deliver(q, "payment_reminder", c, { ref: `${r.parent_id}:${r.due}`, to: [{ name: r.parent, email: r.email }], vars: { parent: r.parent, amount: gbp(r.amount), date: fmtDate(r.due),
        how: r.dd ? "collected by Direct Debit" : "taken from your saved card", payments_link: base ? `${base}/parent/payments` : "your account", school } }, budget);
    }
    c = cfg("payment_failed");
    if (c) {
      const rows = await q<{ id: string; parent: string; email: string; amount: number; child: string; class: string }>(`select i.id, p.first_name as parent, p.email::text, i.amount_pence as amount, s.first_name as child,
          l.name || ' ' || sj.name as class from instalments i join enrolments e on e.id = i.enrolment_id join students s on s.id = e.student_id join parents p on p.id = s.parent_id
          join course_groups g on g.id = e.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
        where i.status = 'failed' and i.due_on > current_date - 30`);
      for (const r of rows) await deliver(q, "payment_failed", c, { ref: r.id, to: [{ name: r.parent, email: r.email }], vars: { parent: r.parent, amount: gbp(r.amount), child: r.child, class: r.class, payments_link: base ? `${base}/parent/payments` : "your account", school } }, budget);
    }

    // 27 Nov: chase payments still unpaid after being declined: one reminder each time another "every N days" passes, up to 3
    c = cfg("payment_chase");
    if (c) {
      const every = Math.max(1, c.minutes ?? 7);
      const rows = await q<{ parent_id: string; parent: string; email: string; due: string; term: string; amount: number; courses: string; days: number }>(`
        select p.id as parent_id, p.first_name as parent, p.email::text, i.due_on::text as due, coalesce(min(t.name), 'term') as term, sum(i.amount_pence - i.refunded_pence)::int as amount,
          string_agg('• ' || coalesce(nullif(s.known_as, ''), s.first_name) || ': ' || l.name || ' ' || sj.name, E'\n' order by s.first_name, l.sort_order) as courses,
          (current_date - i.due_on)::int as days
        from instalments i join enrolments e on e.id = i.enrolment_id join students s on s.id = e.student_id join parents p on p.id = s.parent_id
          join course_groups g on g.id = e.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id left join terms t on t.id = i.term_id
        where i.status = 'failed' and i.amount_pence > 0 and current_date - i.due_on >= $1::int and current_date - i.due_on < $1::int * 4
        group by p.id, i.due_on`, [every]);
      for (const r of rows) {
        const n = Math.min(3, Math.floor(r.days / every));   // 1st, 2nd, 3rd reminder
        if (n >= 1) await deliver(q, "payment_chase", c, { ref: `${r.parent_id}:${r.due}:${n}`, to: [{ name: r.parent, email: r.email }], vars: { parent: r.parent, amount: gbp(r.amount), term: r.term,
          courses: r.courses, days: String(r.days), payments_link: base ? `${base}/parent/payments` : "your account", school } }, budget);
      }
    }

    // 27 Nov (Alfonso): Classroom work due soon / overdue, to the student and their parent (each piece once)
    const kidsLink = (who: "parent" | "student", path: string) => base ? `${base}/${who}${path}` : "your account";
    for (const key of ["assignment_due", "assignment_overdue"] as const) {
      c = cfg(key);
      if (!c) continue;
      const days = Math.max(0, c.minutes ?? 1), due = key === "assignment_due";
      const rows = await q<{ ref: string; sid: string; child: string; semail: string | null; parent: string | null; pemail: string | null; title: string; class: string; due: string; sent_back: boolean }>(`
        select sa.id::text as ref, st.id as sid, coalesce(nullif(st.known_as, ''), st.first_name) as child, st.email::text as semail, p.first_name as parent, p.email::text as pemail,
          sa.title, l.name || ' ' || coalesce(sj.short_name, sj.name) as class, sa.due_at::text as due, coalesce(sa.sent_back, false) as sent_back
        from student_assignments sa join enrolments e on e.group_id = sa.group_id and e.student_id = sa.student_id and e.status = 'active' and not e.is_taster
          join students st on st.id = sa.student_id left join parents p on p.id = st.parent_id
          join course_groups g on g.id = sa.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
          join classroom_coursework cw on cw.id = (select s2.coursework_id from classroom_submissions s2 where s2.id = sa.id)
        where not coursework_earlier_term(sa.title, sa.due_at) and cw.resolved_at is null and ${due
          ? `sa.parent_status = 'due' and sa.due_at > now() and sa.due_at <= now() + make_interval(days => $1)`
          : `sa.parent_status = 'overdue' and sa.due_at <= now() - make_interval(days => $1) and sa.due_at > now() - make_interval(days => $1 + 14)`}
        order by st.id, sa.due_at`, [days]);
      const byKid = new Map<string, typeof rows>();
      for (const r of rows) byKid.set(r.sid, [...(byKid.get(r.sid) ?? []), r]);
      for (const list of byKid.values()) {
        const k = list[0];
        const lines = list.map((r) => ({ ref: r.ref, line: `• ${r.title} (${r.class}) · ${due ? "due" : r.sent_back ? "sent back to redo, was due" : "was due"} ${fmtDate(r.due)} at ${fmtTime(r.due)}` }));
        const vars = (who: "parent" | "student", name: string) => (got: { line: string }[]) => ({ name, child: k.child, list: got.map((g) => g.line).join("\n"), count: `${got.length} piece${got.length === 1 ? "" : "s"} of work`,
          assignments_link: who === "parent" ? kidsLink("parent", "/assignments") : kidsLink("student", ""), school, parent: k.parent ?? name });
        if (c.to_student && k.semail) await deliverDigest(q, key, c, { name: k.child, email: k.semail }, lines, vars("student", k.child), budget);
        if (c.to_parent && k.pemail) await deliverDigest(q, key, c, { name: k.parent ?? "", email: k.pemail }, lines, vars("parent", k.parent ?? "there"), budget);
      }
    }

    // 27 Nov (Alfonso): hand-ins with nothing attached, or a photo the wrong way round (handin-checks.ts): ask the student to hand in again
    // the link is the piece of work's own Classroom page (opens on the student's "Your work", with Unsubmit); the hand-in's own link is the teacher's marking view
    c = cfg("handin_redo");
    if (c) {
      const rows = await q<{ id: string; at: string; why: string; sid: string; child: string; semail: string | null; parent: string | null; pemail: string | null; work: string; class: string; link: string | null }>(`
        select s.id::text, s.turned_in_at::text as at, case when s.content = 'none' then 'none' else s.photo_check end as why, st.id as sid, coalesce(nullif(st.known_as, ''), st.first_name) as child,
          st.email::text as semail, p.first_name as parent, p.email::text as pemail, cw.title as work, coalesce(l.name || ' ' || coalesce(sj.short_name, sj.name), 'your 1:1') as class, coalesce(cw.link, s.link) as link
        from classroom_submissions s join classroom_coursework cw on cw.id = s.coursework_id join students st on st.id = s.student_id left join parents p on p.id = st.parent_id
          left join course_groups g on g.id = cw.group_id left join levels l on l.id = g.level_id left join subjects sj on sj.id = g.subject_id
        where s.turned_in_at > now() - interval '14 days' and cw.resolved_at is null
          and ((s.state = 'assigned' and s.content = 'none') or (s.state = 'turned_in' and s.photo_check in ('sideways', 'upside_down')))`);
      const WHY: Record<string, [string, string]> = {
        none: ["was handed in with nothing attached", "add your work (a photo, a file or a document)"],
        sideways: ["has a photo that looks sideways", "remove the photo, turn it the right way up (rotate it in your photos app first) and add it again"],
        upside_down: ["has a photo that looks upside down", "remove the photo, turn it the right way up (rotate it in your photos app first) and add it again"] };
      for (const r of rows) {
        const [problem, fix] = WHY[r.why] ?? WHY.none;
        const vars = (name: string) => ({ name, child: r.child, work: r.work, class: r.class, problem, fix, link: r.link ?? "https://classroom.google.com", school, parent: r.parent ?? name });
        const to = [...(c.to_student && r.semail ? [{ name: r.child, email: r.semail, v: vars(r.child) }] : []), ...(c.to_parent && r.pemail ? [{ name: r.parent ?? "", email: r.pemail, v: vars(r.parent ?? "there") }] : [])];
        for (const t of to) await deliver(q, "handin_redo", c, { ref: `${r.id}:${r.at}:${r.why}`, to: [{ name: t.name, email: t.email }], vars: t.v }, budget);
      }
    }

    // 27 Nov (Alfonso): reward points, soon after a teacher gives them (each award once; several in one email)
    c = cfg("reward_points");
    if (c) {
      const rows = await q<{ ref: string; sid: string; child: string; semail: string | null; parent: string | null; pemail: string | null; points: number; reason: string; class: string; teacher: string | null; total: number }>(`
        select r.id::text as ref, st.id as sid, coalesce(nullif(st.known_as, ''), st.first_name) as child, st.email::text as semail, p.first_name as parent, p.email::text as pemail,
          r.points::int, coalesce(r.reason, '') as reason, coalesce(l.name || ' ' || coalesce(sj.short_name, sj.name), '') as class, u.name as teacher,
          (select coalesce(sum(x.points), 0)::int from reward_points x where x.student_id = st.id
            and x.awarded_on >= coalesce((select t.starts_on from terms t where t.starts_on <= current_date order by t.starts_on desc limit 1), current_date - 90)) as total
        from reward_points r join students st on st.id = r.student_id left join parents p on p.id = st.parent_id
          left join course_groups g on g.id = r.group_id left join levels l on l.id = g.level_id left join subjects sj on sj.id = g.subject_id
          left join teachers t on t.id = r.teacher_id left join users u on u.id = t.user_id
        where r.created_at > now() - interval '2 days' and r.points > 0 and r.created_at < now() - interval '5 minutes'
        order by st.id, r.created_at`);
      const byKid = new Map<string, typeof rows>();
      for (const r of rows) byKid.set(r.sid, [...(byKid.get(r.sid) ?? []), r]);
      for (const list of byKid.values()) {
        const k = list[0], pts = new Map(list.map((r) => [r.ref, r.points]));
        const lines = list.map((r) => ({ ref: r.ref, line: `• +${r.points} for “${r.reason}”${r.class ? ` · ${r.class}` : ""}${r.teacher ? ` · ${r.teacher}` : ""}` }));
        const vars = (who: "parent" | "student", name: string) => (got: { ref: string; line: string }[]) => ({ name, child: k.child, list: got.map((g) => g.line).join("\n"),
          points: String(got.reduce((a, g) => a + (pts.get(g.ref) ?? 0), 0)),
          total: String(k.total), rewards_link: who === "parent" ? kidsLink("parent", "") : kidsLink("student", "/rewards"), school, parent: k.parent ?? name });
        if (c.to_student && k.semail) await deliverDigest(q, "reward_points", c, { name: k.child, email: k.semail }, lines, vars("student", k.child), budget);
        if (c.to_parent && k.pemail) await deliverDigest(q, "reward_points", c, { name: k.parent ?? "", email: k.pemail }, lines, vars("parent", k.parent ?? "there"), budget);
      }
    }

    // 27 Nov (Alfonso): attendance this week, to parents only, from Friday 5pm (London); Saturday and Sunday catch up if missed
    c = cfg("attendance_week");
    if (c) {
      const [w] = await q<{ go: boolean; monday: string }>(`select (extract(isodow from (now() at time zone 'Europe/London')) = 5 and extract(hour from (now() at time zone 'Europe/London')) >= 17)
          or extract(isodow from (now() at time zone 'Europe/London')) in (6, 7) as go, date_trunc('week', (now() at time zone 'Europe/London'))::date::text as monday`);
      if (w?.go) {
        const rows = await q<{ pid: string; parent: string; email: string; child: string; sid: string; day: string; time: string; class: string; mark: string | null; told: boolean }>(`
          select p.id as pid, p.first_name as parent, p.email::text as email, coalesce(nullif(st.known_as, ''), st.first_name) as child, st.id as sid,
            to_char(e.lesson_date, 'Dy DD Mon') as day, to_char(sl.starts_at, 'HH24:MI') as time, l.name || ' ' || coalesce(sj.short_name, sj.name) as class,
            (select m.mark::text from attendance_marks m where m.lesson_event_id = e.id and m.student_id = st.id) as mark,
            exists (select 1 from absence_notices n where n.lesson_event_id = e.id and n.student_id = st.id and n.cancelled_at is null) as told
          from lesson_events e join lesson_slots sl on sl.id = e.slot_id join course_groups g on g.id = e.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
            join enrolments x on x.group_id = g.id and x.status = 'active' and not x.is_taster join students st on st.id = x.student_id join parents p on p.id = st.parent_id
          where e.status <> 'cancelled' and e.lesson_date between $1::date and least($1::date + 6, current_date)
          order by p.id, st.first_name, st.id, e.lesson_date, sl.starts_at`, [w.monday]);
        const byParent = new Map<string, typeof rows>();
        for (const r of rows) byParent.set(r.pid, [...(byParent.get(r.pid) ?? []), r]);
        const label = (r: (typeof rows)[number]) => r.mark === "present" ? "✓ Present" : r.mark === "late" ? "✓ Late" : r.mark === "approved_absence" ? "Absent (approved)" : r.mark === "absent" ? (r.told ? "Absent (you told us)" : "✗ Absent") : r.told ? "Absent (you told us)" : "Not marked yet";
        for (const [pid, list] of byParent) {
          const kids = [...new Map(list.map((r) => [r.sid, r.child])).entries()];
          const summary = kids.map(([sid, child]) => { const ls = list.filter((r) => r.sid === sid), there = ls.filter((r) => r.mark === "present" || r.mark === "late").length;
            return `**${child}**: ${there} of ${ls.length} lesson${ls.length === 1 ? "" : "s"} attended\n${ls.map((r) => `• ${r.day} ${r.time} · ${r.class} · ${label(r)}`).join("\n")}`; }).join("\n\n");
          await deliver(q, "attendance_week", c, { ref: `${pid}:${w.monday}`, to: [{ name: list[0].parent, email: list[0].email }], vars: { parent: list[0].parent, week: `w/c ${fmtDate(w.monday)}`,
            summary, attendance_link: kidsLink("parent", "/attendance"), school } }, budget);
        }
      }
    }

    // 27 Nov (Alfonso): exam booking reminders: before each "Remind parents" booking deadline, to parents of GCSE / iGCSE students
    // (not Pre-GCSE), the set number of days before and again 7 days before (each parent once per deadline and stage)
    c = cfg("exam_booking");
    if (c) {
      const early = Math.max(8, Math.min(120, c.minutes ?? 28));
      const due = await q<{ id: string; title: string; starts_on: string; days: number }>(`select id, title, starts_on::text, (starts_on - (now() at time zone 'Europe/London')::date) as days
        from important_dates where published and remind and kind = 'book' and starts_on is not null
          and starts_on - (now() at time zone 'Europe/London')::date between 1 and $1`, [early]);
      if (due.length) {
        const { examPartner } = await import("./important-dates");
        const p = await examPartner();
        const fams = await q<{ pid: string; parent: string; email: string; kids: string }>(`select p.id as pid, p.first_name as parent, p.email::text as email,
            string_agg(distinct coalesce(nullif(st.known_as, ''), st.first_name), ' and ') as kids
          from enrolments x join course_groups g on g.id = x.group_id join levels l on l.id = g.level_id join students st on st.id = x.student_id join parents p on p.id = st.parent_id
          where x.status = 'active' and not x.is_taster and l.name ~* 'gcse' and l.name !~* 'pre' and p.email is not null group by p.id, p.first_name, p.email`);
        for (const d of due) {
          const stage = d.days <= 7 ? "week" : "early";
          const date = new Date(d.starts_on + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
          for (const f of fams) await deliver(q, "exam_booking", c, { ref: `${d.id}:${stage}:${f.pid}`, to: [{ name: f.parent, email: f.email }], vars: { parent: f.parent, child: f.kids,
            deadline: d.title, date, days: String(d.days), partner: p.name, booking_link: p.booking || "https://www.tutorsandexams.uk/apply/",
            code_line: p.code ? `When you book, please use our partner code **${p.code}**${p.note ? ` (${p.note})` : ""} so they know ${f.kids} studies with us.` : "",
            dates_link: kidsLink("parent", "/resources?tab=dates"), school } }, budget);
        }
      }
    }

    // reports: tell parents when a report round is published
    c = cfg("report_published");
    if (c) {
      const rows = await q<{ cycle: string; name: string; sid: string; child: string; parent: string; email: string }>(`select distinct c.id as cycle, c.name, s.id as sid, s.first_name as child, p.first_name as parent, p.email::text
        from report_cycles c join report_entries e on e.cycle_id = c.id and e.status = 'approved' join students s on s.id = e.student_id join parents p on p.id = s.parent_id
        where c.status = 'published' and c.published_at > now() - interval '14 days'
          and not exists (select 1 from report_emails re where re.cycle_id = c.id and re.student_id = s.id and re.sent_at is not null)`);   // 26 Nov: already emailed in full
      for (const r of rows) await deliver(q, "report_published", c, { ref: `${r.cycle}:${r.sid}`, to: [{ name: r.parent, email: r.email }], vars: { parent: r.parent, child: r.child, report: r.name, school } }, budget);
    }
    // take back booked reminders that no longer apply: lesson cancelled, absence reported, left the class, taster cancelled
    const stale = await q<{ id: number; message_id: string | null }>(`select a.id, a.message_id from automation_sends a
      where a.status = 'scheduled' and a.scheduled_for > now() and (
        (a.key = 'lesson_reminder' and exists (select 1 from lesson_events e where e.id::text = split_part(a.ref, ':', 1) and (e.status = 'cancelled'
          or exists (select 1 from absence_notices n where n.lesson_event_id = e.id and n.student_id::text = split_part(a.ref, ':', 2) and n.cancelled_at is null)
          or not exists (select 1 from enrolments x where x.group_id = e.group_id and x.student_id::text = split_part(a.ref, ':', 2) and x.status = 'active'))))
        or (a.key in ('taster_link', 'taster_follow_up', 'trial_waitlist_invite') and exists (select 1 from taster_bookings b where b.id::text = a.ref and b.status in ('cancelled', 'booked_course'))))`);
    for (const r of stale) { if (r.message_id) await cancelScheduled(r.message_id); await q(`update automation_sends set status = 'cancelled' where id = $1`, [r.id]); }
  });
  return { sent: limit - budget.n };
}

/** 27 Nov: the wording and recipients for "Lesson rescheduled" / "Lesson cancelled" (saved, or the standard wording), and
 *  whether the office's "Email the class" tick starts ticked (unless the automation is saved as switched off). */
export async function lessonChangeEmail(key: "lesson_moved" | "lesson_cancelled"): Promise<{ subject: string; body: string; to_parent: boolean; to_student: boolean; on: boolean }> {
  const d = DEFS.find((x) => x.key === key)!;
  const r = (await withSchool((q) => q<Cfg>(`select enabled, subject, body, minutes, to_parent, to_student from automations where key = $1`, [key])).catch(() => []))[0];
  return { subject: r?.subject ?? d.subject, body: r?.body ?? d.body, to_parent: r?.to_parent ?? d.to_parent, to_student: r?.to_student ?? d.to_student, on: r ? r.enabled : true };
}
export const fillEmail = (t: string, v: Record<string, string>) => fill(t, v);
export const fillBody = (t: string, v: Record<string, string>) => fill(linkWords(t), v);

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
    meet_link: "https://meet.google.com/abc-defg-hij", book_link: (process.env.SITE_URL || "") + "/courses", amount: "£150.00", hours: "48", report: "Term 1 Progress Report", school,
    how: "collected by Direct Debit", payments_link: (process.env.SITE_URL || "") + "/parent/payments", count: "2 pieces of work", list: "• Essay plan (iGCSE English Language) · 3 to mark · 2 days left\n• Poetry comparison (iGCSE English Language) · 1 to mark · 1 day overdue", dashboard_link: (process.env.SITE_URL || "") + "/admin/teacher" };
  const { sampleVars } = await import("./automation-review");   // 27 Nov: the same examples as the previews, for anything not set above
  const all = { ...sampleVars(key, school, process.env.SITE_URL || ""), ...vars, ...(key.startsWith("lesson_") || key.startsWith("trial") || key.startsWith("waitlist") ? sampleVars(key, school, process.env.SITE_URL || "") : {}), parent: vars.parent };
  return sendOne([to], `[Test] ${fill(d.subject, all)}`, fill(linkWords(d.body), all), { tag: `auto-test-${key}` });
}

let last = 0;
/** After admin pages load: run at most every 10 minutes per server. */
export async function automationsBackground() {
  if (Date.now() - last < 10 * 60e3) return;
  last = Date.now();
  await runAutomations().catch((e) => console.error("automations", e));
}
