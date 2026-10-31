import "server-only";
import { withSchool } from "./db";
import { ensureLessonDates } from "./ops";
import { termPayRows } from "./payroll";

// What a teacher sees in their own area (as in the prototype's teacher view: My day, 1:1s and workshops,
// Messages, Class chats, Reward points, Reports to write, My timetable, My pay). Every query is limited to
// the signed-in teacher's own classes, bookings and pay.

const ME = `(select id from teachers where user_id = $1)`;
const TERM_NOW = `(select id from terms where ends_on >= current_date order by starts_on limit 1)`;
const YEAR_NOW = `(select id from academic_years where ends_on >= current_date order by starts_on limit 1)`;

export type WeekLesson = { id: string; d: string; time: string; name: string; code: string; status: string; meet_url: string | null; students: number;
  not_in_classroom: number; tasters: string[]; absent: string[]; marked: number; slides_url?: string | null;
  course_id?: string | null; lesson_no?: number | null; term_start?: string | null; slides_folder?: string | null; term_no?: number | null;
  /** slides found in Classroom or Drive (when the teacher hasn't pasted a link) */
  slides?: { url: string; title: string; from: string } | null;
  /** Students in the class whose birthday is on the lesson day or within 3 days of it (so the teacher can say happy birthday). */
  birthdays?: { name: string; d: string; age: number }[];
  /** Students in the class with SEND whose parent agreed to share it with teachers. */
  send?: string[] };
export type MyDay = {
  term: { name: string; pay_date: string } | null; classes: number;
  reportsLeft: number; reportsDue: string | null; attendance: number | null; onesThisWeek: number; payThisTerm: number;
  week: WeekLesson[]; registers: number;
  reportCycle: string | null; reportBars: { group_id: string; cycle_id: string; name: string; done: number; total: number }[];
};

export async function myDay(userId: string): Promise<MyDay> {
  await ensureLessonDates().catch(() => 0);
  return withSchool(async (q) => {
    const term = (await q<{ id: string; name: string; pay_date: string }>(`select id, name, term_pay_date(id)::text as pay_date from terms where id = ${TERM_NOW.replace("$1", "")}`))[0] ?? null;
    const [{ classes }] = await q<{ classes: number }>(`select count(*)::int as classes from course_groups g where g.teacher_id = ${ME} and g.academic_year_id = ${YEAR_NOW} and g.status <> 'hidden'`, [userId]);
    const reports = await q<{ group_id: string; cycle_id: string; cycle: string; due: string; name: string; done: number; total: number; left: number }>(`
      select g.id as group_id, c.id as cycle_id, c.name as cycle, c.comments_due::text as due, l.name || ' ' || sj.name as name,
        count(*) filter (where e.status in ('submitted','approved'))::int as done, count(*)::int as total,
        count(*) filter (where e.status in ('todo','draft','returned'))::int as left
      from report_entries e join report_cycles c on c.id = e.cycle_id join course_groups g on g.id = e.group_id
      join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
      where g.teacher_id = ${ME} and c.status <> 'published' group by g.id, c.id, l.sort_order, l.name, sj.name order by c.comments_due, l.sort_order, sj.name`, [userId]);
    const att = term ? (await q<{ pct: number | null }>(`select round(100.0 * count(*) filter (where m.mark in ('present','late')) / nullif(count(*) filter (where m.mark <> 'approved_absence'), 0))::int as pct
      from attendance_marks m join lesson_events ev on ev.id = m.lesson_event_id join course_groups g on g.id = ev.group_id
      where g.teacher_id = ${ME} and ev.term_id = $2`, [userId, term.id]))[0]?.pct ?? null : null;
    const [{ ones }] = await q<{ ones: number }>(`select count(*)::int as ones from tutoring_bookings where teacher_id = ${ME} and status = 'booked'
      and starts_at >= date_trunc('day', now()) and starts_at < date_trunc('day', now()) + interval '8 days'`, [userId]);
    const pay = term ? await myTermPay(q, userId, term.id) : 0;
    const week = await q<WeekLesson>(`
      select ev.id, ev.lesson_date::text as d, to_char(sl.starts_at,'HH24:MI') as time, l.name || ' ' || sj.name as name, g.code, ev.status::text, g.meet_url, ev.slides_url, g.google_course_id as course_id, g.slides_folder, (select number from terms t where t.id = ev.term_id) as term_no,
        (select starts_on::text from terms t where t.id = ev.term_id) as term_start,
        (select count(*)::int from lesson_events e2 join lesson_slots s2 on s2.id = e2.slot_id where e2.group_id = ev.group_id and e2.term_id = ev.term_id
          and e2.status <> 'cancelled' and (e2.lesson_date, s2.starts_at) <= (ev.lesson_date, sl.starts_at)) as lesson_no,
        (select count(*)::int from enrolments e where e.group_id = g.id and e.status in ('pending','active') and not e.is_taster) as students,
        (select count(*)::int from enrolments e join classroom_memberships cm on cm.group_id = e.group_id and cm.student_id = e.student_id where e.group_id = g.id and e.status in ('pending','active') and cm.state = 'invited') as not_in_classroom,
        coalesce((select array_agg(split_part(r.child_name, ' ', 1) order by r.child_name) from taster_bookings tb join taster_requests r on r.id = tb.request_id
          where tb.lesson_event_id = ev.id and tb.status = 'booked'), '{}') as tasters,
        coalesce((select array_agg(s.first_name order by s.first_name) from absence_notices a join students s on s.id = a.student_id
          where a.lesson_event_id = ev.id and a.cancelled_at is null), '{}') as absent,
        (select count(*)::int from attendance_marks m where m.lesson_event_id = ev.id) as marked,
        coalesce((select json_agg(json_build_object('name', coalesce(nullif(s.known_as, ''), s.first_name), 'd', b.d::text, 'age', b.age) order by abs(b.d - ev.lesson_date), b.d, s.first_name)
          from enrolments e join students s on s.id = e.student_id
          cross join lateral (select (s.date_of_birth + make_interval(years => extract(year from ev.lesson_date)::int - extract(year from s.date_of_birth)::int))::date as d,
            extract(year from ev.lesson_date)::int - extract(year from s.date_of_birth)::int as age) b
          where e.group_id = g.id and e.status in ('pending','active') and s.date_of_birth is not null and abs(b.d - ev.lesson_date) <= 3), '[]'::json) as birthdays,
        coalesce((select array_agg(coalesce(nullif(s.known_as, ''), s.first_name) || ' ' || left(s.last_name, 1)
            || coalesce(' (' || nullif(array_to_string(array_remove(ss.needs, 'Other'), ', '), '') || ')', '') order by s.first_name) from enrolments e join students s on s.id = e.student_id
          join student_support ss on ss.student_id = s.id
          where e.group_id = g.id and e.status in ('pending','active') and ss.has_send = 'yes' and ss.share_with_teachers), '{}') as send
      from lesson_events ev join lesson_slots sl on sl.id = ev.slot_id join course_groups g on g.id = ev.group_id
      join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
      where ev.teacher_id = ${ME} and ev.status <> 'cancelled' and ev.lesson_date >= current_date
        -- the rest of the teaching week (Monday to Sunday) that holds the teacher's next lesson, so a week starting after half term shows in full
        and ev.lesson_date <= (select date_trunc('week', min(e2.lesson_date))::date + 6 from lesson_events e2 where e2.teacher_id = ${ME} and e2.status <> 'cancelled' and e2.lesson_date >= current_date)
      order by ev.lesson_date, sl.starts_at`, [userId]).catch(() => q<WeekLesson>(`
      select ev.id, ev.lesson_date::text as d, to_char(sl.starts_at,'HH24:MI') as time, l.name || ' ' || sj.name as name, g.code, ev.status::text, g.meet_url, ev.slides_url, g.google_course_id as course_id, g.slides_folder, (select number from terms t where t.id = ev.term_id) as term_no,
        (select starts_on::text from terms t where t.id = ev.term_id) as term_start,
        (select count(*)::int from lesson_events e2 join lesson_slots s2 on s2.id = e2.slot_id where e2.group_id = ev.group_id and e2.term_id = ev.term_id
          and e2.status <> 'cancelled' and (e2.lesson_date, s2.starts_at) <= (ev.lesson_date, sl.starts_at)) as lesson_no,
        (select count(*)::int from enrolments e where e.group_id = g.id and e.status in ('pending','active') and not e.is_taster) as students, 0 as not_in_classroom,
        '{}'::text[] as tasters, '{}'::text[] as absent, (select count(*)::int from attendance_marks m where m.lesson_event_id = ev.id) as marked
      from lesson_events ev join lesson_slots sl on sl.id = ev.slot_id join course_groups g on g.id = ev.group_id
      join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
      where ev.teacher_id = ${ME} and ev.status <> 'cancelled' and ev.lesson_date >= current_date
        -- the rest of the teaching week (Monday to Sunday) that holds the teacher's next lesson, so a week starting after half term shows in full
        and ev.lesson_date <= (select date_trunc('week', min(e2.lesson_date))::date + 6 from lesson_events e2 where e2.teacher_id = ${ME} and e2.status <> 'cancelled' and e2.lesson_date >= current_date)
      order by ev.lesson_date, sl.starts_at`, [userId]));
    const [{ registers }] = await q<{ registers: number }>(`select count(*)::int as registers from lesson_events ev where ev.teacher_id = ${ME} and ev.status = 'scheduled'
      and ev.lesson_date < current_date and ev.lesson_date > current_date - 60`, [userId]);
    const cycle = reports[0]?.cycle_id;
    return {
      term: term && { name: term.name, pay_date: term.pay_date }, classes,
      reportsLeft: reports.reduce((a, r) => a + r.left, 0), reportsDue: reports[0]?.due ?? null, attendance: att, onesThisWeek: ones, payThisTerm: pay,
      week, registers, reportCycle: reports[0]?.cycle ?? null,
      reportBars: reports.filter((r) => r.cycle_id === cycle).map((r) => ({ group_id: r.group_id, cycle_id: r.cycle_id, name: r.name, done: r.done, total: r.total })),
    };
  });
}

type Q = <T = Record<string, unknown>>(s: string, p?: unknown[]) => Promise<T[]>;
/** Pay for one term: the pay run line once the office has built one, otherwise lessons taught so far plus 1:1s and workshops. */
/** This teacher's pay for one term, worked out exactly as the Payroll page does. */
async function myTermRow(q: Q, userId: string, termId: string) {
  const [t] = await q<{ id: string; run_id: string | null; status: string | null; teacher_id: string | null }>(`select t.id, r.id as run_id, r.status::text, ${ME} as teacher_id
    from terms t left join pay_runs r on r.term_id = t.id where t.id = $2`, [userId, termId]);
  if (!t?.teacher_id) return null;
  return (await termPayRows(q, t, t.teacher_id))[0] ?? null;
}
async function myTermPay(q: Q, userId: string, termId: string): Promise<number> { return (await myTermRow(q, userId, termId))?.gross ?? 0; }

export type PayRow = { id: string; name: string; pay_date: string; starts_on: string; ends_on: string; status: string;
  by_level: Record<string, number>; lessons: number; extras: number; extras_pay: number; adj: number; adj_note: string | null; gross: number };
export async function myPay(userId: string) {
  return withSchool(async (q) => {
    const rates = await q<{ level: string; rate: number | null }>(`select l.name as level, coalesce(
        (select rate_pence from pay_rates r where r.level_id = l.id and r.teacher_id = ${ME} and r.valid_from <= current_date order by valid_from desc limit 1),
        (select rate_pence from pay_rates r where r.level_id = l.id and r.teacher_id is null and r.valid_from <= current_date order by valid_from desc limit 1)) as rate
      from levels l order by l.sort_order`, [userId]);
    const levels = (await q<{ name: string }>(`select name from levels order by sort_order`)).map((l) => l.name);
    const terms = await q<{ id: string; name: string; pay_date: string; starts_on: string; ends_on: string; run: string | null }>(`
      select t.id, t.name, coalesce(r.pay_date, term_pay_date(t.id))::text as pay_date, t.starts_on::text, t.ends_on::text, r.status::text as run
      from terms t left join pay_runs r on r.term_id = t.id where t.academic_year_id = ${YEAR_NOW} order by t.number`);
    const today = new Date().toISOString().slice(0, 10);
    const rows: PayRow[] = [];
    for (const t of terms) {
      const r = await myTermRow(q, userId, t.id);
      const status = t.run === "paid" ? "Paid" : t.run === "approved" ? "Approved" : t.ends_on < today ? "Being checked" : t.starts_on <= today ? "This term" : "Upcoming";
      rows.push({ id: t.id, name: t.name, pay_date: t.pay_date, starts_on: t.starts_on, ends_on: t.ends_on, status,
        by_level: r?.by_level ?? {}, lessons: r?.lessons ?? 0, extras: r?.extras ?? 0, extras_pay: r?.extras_pay ?? 0, adj: r?.adj ?? 0, adj_note: r?.adj_note ?? null, gross: r?.gross ?? 0 });
    }
    const tut = await q<{ level: string; pay: number }>(`select distinct on (l.id) l.name as level, r.teacher_pay_pence as pay from tutoring_rates r join levels l on l.id = r.level_id
      where r.minutes = 45 and r.valid_from <= current_date order by l.id, r.valid_from desc`).catch(() => []);
    return { rates, rows, tut, levels };
  });
}

export async function myTimetable(userId: string) {
  return withSchool((q) => q<{ weekday: number; time: string; ends: string; level: string; subject: string; code: string; students: number }>(`
    select s.weekday, to_char(s.starts_at,'HH24:MI') as time, to_char(s.ends_at,'HH24:MI') as ends, l.name as level, sj.name as subject, g.code,
      (select count(*)::int from enrolments e where e.group_id = g.id and e.status in ('pending','active') and not e.is_taster) as students
    from lesson_slots s join course_groups g on g.id = s.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
    where s.teacher_id = ${ME} and s.academic_year_id = ${YEAR_NOW} order by s.starts_at, s.weekday`, [userId]));
}

export async function myOnes(userId: string) {
  return withSchool(async (q) => ({
    bookings: await q<{ id: string; at: string; minutes: number; child: string; level: string; subject: string; focus: string | null; audience: string; past: boolean }>(`
      select b.id, b.starts_at::text as at, b.minutes, b.student_name as child, l.name as level, sj.name as subject, b.focus, b.audience::text, b.starts_at < now() as past
      from tutoring_bookings b join levels l on l.id = b.level_id join subjects sj on sj.id = b.subject_id
      where b.teacher_id = ${ME} and b.status = 'booked' order by b.starts_at`, [userId]),
    workshops: await q<{ id: string; title: string; at: string; minutes: number; booked: number }>(`select w.id, w.title, w.starts_at::text as at, w.minutes,
        (select count(*)::int from workshop_bookings b where b.workshop_id = w.id and b.status in ('booked','attended')) as booked
      from workshops w where w.teacher_id = ${ME} and w.status = 'published' and w.starts_at > now() - interval '1 day' order by w.starts_at`, [userId]),
    hours: await q<{ id: string; weekday: number; from: string; to: string }>(`select id, weekday, to_char(starts_at,'HH24:MI') as from, to_char(ends_at,'HH24:MI') as to
      from tutoring_availability where teacher_id = ${ME} and (valid_to is null or valid_to >= current_date) order by weekday, starts_at`, [userId]),
    teacherId: (await q<{ id: string }>(`select id from teachers where user_id = $1`, [userId]))[0]?.id ?? null,
  }));
}

/** A teacher marks their own past 1:1 as taught (it's then paid with their lessons). */
export async function markOneTaught(userId: string, id: string, actorId = userId): Promise<string | null> {
  return withSchool(async (q) => {
    const r = await q(`update tutoring_bookings set status = 'completed' where id = $2 and teacher_id = ${ME} and status = 'booked' and starts_at < now() returning id`, [userId, id]);
    if (!r.length) return "That 1:1 can’t be marked as taught yet.";
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'taught', 'tutoring_booking', $2, '{}')`, [actorId, id]);
    return null;
  });
}

export async function myChats(userId: string) {
  return withSchool(async (q) => {
    await q(`insert into student_chats (school_id, kind, group_id) select g.school_id, 'class', g.id from course_groups g
      where g.teacher_id = ${ME} and g.academic_year_id = ${YEAR_NOW} and not exists (select 1 from student_chats c where c.group_id = g.id)`, [userId]).catch(() => null);
    return q<{ id: string; name: string; messages: number; last_at: string | null }>(`select c.id, l.name || ' ' || sj.name as name,
        (select count(*)::int from student_chat_messages m where m.chat_id = c.id) as messages, (select max(created_at)::text from student_chat_messages m where m.chat_id = c.id) as last_at
      from student_chats c join course_groups g on g.id = c.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
      where c.kind = 'class' and g.teacher_id = ${ME} and g.academic_year_id = ${YEAR_NOW} order by l.sort_order, sj.name`, [userId]);
  });
}
export async function teacherOwnsChat(userId: string, chatId: string) {
  return withSchool(async (q) => (await q(`select 1 from student_chats c join course_groups g on g.id = c.group_id where c.id = $2 and g.teacher_id = ${ME}`, [userId, chatId])).length > 0);
}
export async function teacherPost(userId: string, chatId: string, body: string, th: { parent: string | null; topic: string | null } = { parent: null, topic: null }): Promise<string | null> {
  try {
    return await withSchool(async (q) => {
      const r = await q(`insert into student_chat_messages (school_id, chat_id, sender_teacher_id, body, parent_id, topic)
        select current_school(), c.id, g.teacher_id, $3, $4, $5 from student_chats c join course_groups g on g.id = c.group_id where c.id = $2 and g.teacher_id = ${ME} returning id`, [userId, chatId, body, th.parent, th.topic]);
      return r.length ? null : "You can only post in your own classes’ chats.";
    });
  } catch (e) { return (e as Error).message.includes("not allowed") ? "That message contains a blocked word." : "Couldn’t post that."; }
}

export async function pointsGiven(userId: string) {
  return withSchool((q) => q<{ id: string; student: string; class: string; points: number; reason: string; awarded_on: string; today: boolean }>(`select rp.id, s.first_name as student,
      sj.name as class, rp.points, rp.reason, rp.awarded_on::text, rp.created_at > now() - interval '1 day' as today
    from reward_points rp join students s on s.id = rp.student_id join course_groups g on g.id = rp.group_id join subjects sj on sj.id = g.subject_id
    where rp.teacher_id = ${ME} order by rp.created_at desc limit 12`, [userId]));
}
/** Undo points given in the last day (a slip of the finger). */
export async function undoPoints(userId: string, id: string, actorId = userId): Promise<string | null> {
  return withSchool(async (q) => {
    const r = await q(`delete from reward_points where id = $2 and teacher_id = ${ME} and created_at > now() - interval '1 day' returning id`, [userId, id]);
    if (!r.length) return "Points can only be taken back on the day they were given.";
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'undo', 'reward_points', $2, '{}')`, [actorId, id]);
    return null;
  });
}

/** The teacher's own 1:1 hours (weekly). */
export async function addMyHours(userId: string, weekday: number, from: string, to: string, actorId = userId): Promise<string | null> {
  if (!(weekday >= 1 && weekday <= 7) || !/^\d\d:\d\d$/.test(from) || !/^\d\d:\d\d$/.test(to) || to <= from) return "Choose a day and a start time before the end time.";
  return withSchool(async (q) => {
    const r = await q<{ id: string }>(`insert into tutoring_availability (school_id, teacher_id, weekday, starts_at, ends_at) select current_school(), id, $2::int, $3::time, $4::time from teachers where user_id = $1 returning id`, [userId, weekday, from, to]);
    if (!r.length) return "Only teachers have 1:1 hours.";
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'add', 'tutoring_availability', $2, $3)`, [actorId, r[0].id, JSON.stringify({ weekday, from, to })]);
    return null;
  });
}
export async function removeMyHours(userId: string, id: string, actorId = userId) {
  await withSchool(async (q) => {
    const r = await q(`update tutoring_availability set valid_to = current_date - 1 where id = $2 and teacher_id = ${ME} returning id`, [userId, id]);
    if (r.length) await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'remove', 'tutoring_availability', $2, '{}')`, [actorId, id]);
  });
}

// ---------- Email between a teacher and the school ----------
// Parents and teachers talk through Messages only. A teacher's Email is for writing to the school (the office):
// written here it lands in Admin → Email → Inbox (kind 'staff'); emails the teacher sends the school from their own
// email show too. The office's replies are emailed to the teacher and shown here.
export type TeacherEmail = { id: string; thread_id: string; subject: string; body: string; at: string; replied_at: string | null; reply_body: string | null; reply_from: string | null; local: boolean; to_name: string | null; to_label: string | null; links: string[] | null; files: { id: string; name: string; size: number }[] };
/** Who teachers can email: the office (the school inbox) plus the people the school lists (e.g. "Principal", "IT support").
 *  Set by an admin (meet_kv teacher_contacts); until then every admin is listed with their signature's job title. */
export type Contact = { user_id: string; name: string; label: string };
export async function teacherContacts(): Promise<Contact[]> {
  return withSchool(async (q) => {
    const admins = await q<{ id: string; name: string; title: string | null }>(`select u.id, u.name, k.value->>'title' as title from users u left join meet_kv k on k.key = 'sig_' || u.id
      where u.role = 'school_admin' and u.disabled_at is null order by u.name`);
    const saved = (await q<{ value: { user_id: string; label: string }[] }>(`select value from meet_kv where key = 'teacher_contacts'`))[0]?.value;
    if (!Array.isArray(saved)) return admins.map((a) => ({ user_id: a.id, name: a.name, label: a.title || "Admin" }));
    return saved.map((c) => { const a = admins.find((x) => x.id === c.user_id); return a ? { user_id: a.id, name: a.name, label: String(c.label || "").slice(0, 60) || "Admin" } : null; }).filter((x): x is Contact => !!x);
  });
}
/** What teachers see for the school inbox ("Leanne", say). Set on Admin → Teacher email contacts; otherwise the first name of
 *  the admin whose address the school inbox is, otherwise "the office". Also the inbox address, to leave that person off the list. */
export async function officeInfo(): Promise<{ label: string; mailbox: string | null }> {
  return withSchool(async (q) => {
    const kv = await q<{ key: string; value: unknown }>(`select key, value from meet_kv where key in ('teacher_office_label', 'gmail')`);
    const box = (kv.find((r) => r.key === "gmail")?.value as { mailbox?: string } | undefined)?.mailbox?.toLowerCase() ?? null;
    const set = kv.find((r) => r.key === "teacher_office_label")?.value;
    if (typeof set === "string" && set.trim()) return { label: set.trim().slice(0, 60), mailbox: box };
    const who = box ? (await q<{ name: string }>(`select name from users where lower(email::text) = $1 and disabled_at is null limit 1`, [box]))[0]?.name : null;
    return { label: who ? who.split(" ")[0] : "the office", mailbox: box };
  });
}
export async function saveOfficeLabel(label: string) {
  await withSchool((q) => q(`insert into meet_kv (school_id, key, value) values (current_school(), 'teacher_office_label', $1)
    on conflict (school_id, key) do update set value = excluded.value, updated_at = now()`, [JSON.stringify(label.trim().slice(0, 60))]));
}
export async function saveTeacherContacts(list: { user_id: string; label: string }[]) {
  const clean = list.filter((c) => /^[0-9a-f-]{36}$/.test(c.user_id)).slice(0, 12).map((c) => ({ user_id: c.user_id, label: c.label.trim().slice(0, 60) }));
  await withSchool((q) => q(`insert into meet_kv (school_id, key, value) values (current_school(), 'teacher_contacts', $1)
    on conflict (school_id, key) do update set value = excluded.value, updated_at = now()`, [JSON.stringify(clean)]));
}
export async function teacherEmails(userId: string, limit = 60): Promise<TeacherEmail[]> {
  return withSchool((q) => q<TeacherEmail>(`
    select m.id, m.thread_id, m.subject, coalesce(m.body, m.snippet) as body, m.received_at::text as at, m.replied_at::text, m.reply_body, m.reply_from::text, m.gmail_id like 'local:%' as local, tu.name as to_name, null::text as to_label, m.links,
      coalesce((select json_agg(json_build_object('id', f.id, 'name', f.name, 'size', f.size) order by f.created_at) from inbox_attachments f where f.message_id = m.id), '[]'::json) as files
    from inbox_messages m left join users tu on tu.id = m.to_user where m.kind = 'staff' and lower(m.from_email::text) = (select lower(email::text) from users where id = $1)
    order by greatest(m.received_at, coalesce(m.replied_at, m.received_at)) desc limit $2`, [userId, limit])).catch(() => []);
}
export async function sendTeacherEmail(user: { id: string; name: string; email: string }, subject: string, body: string, thread?: string, to?: string,
  extra: { links?: string[]; files?: File[] } = {}): Promise<string | null> {
  const sub = subject.trim().slice(0, 200), text = body.replace(/\r\n/g, "\n").trim().slice(0, 20000);
  if (!sub) return "Add a subject."; if (!text) return "Write your email first.";
  const links = [...new Set((extra.links ?? []).map((l) => l.trim()).filter(Boolean))].slice(0, 10);
  if (links.some((l) => !/^https:\/\/[^\s]{4,600}$/.test(l))) return "Each link must be a full address starting with https://";
  const files = (extra.files ?? []).filter((f) => f && f.size > 0).slice(0, 5);
  if (files.reduce((a, f) => a + f.size, 0) > 3_500_000) return "Attachments can be up to 3.5 MB in total. For bigger files, share a Google Drive link instead.";
  if (files.some((f) => /\.(exe|bat|cmd|com|scr|js|vbs|msi|sh|ps1|jar)$/i.test(f.name))) return "That type of file can’t be attached.";
  const blobs = await Promise.all(files.map(async (f) => ({ name: f.name.replace(/[\\/\r\n]/g, "_").slice(0, 200) || "file", mime: (f.type || "application/octet-stream").slice(0, 100), size: f.size, data: Buffer.from(await f.arrayBuffer()) })));
  return withSchool(async (q) => {
    const id = crypto.randomUUID();
    let th = `local:${id}`;
    if (thread && /^[\w:-]{1,120}$/.test(thread)) {
      const own = await q(`select 1 from inbox_messages where thread_id = $1 and kind = 'staff' and lower(from_email::text) = lower($2) limit 1`, [thread, user.email]);
      if (own.length) th = thread;
    }
    const box = (await q<{ m: string | null }>(`select value->>'mailbox' as m from meet_kv where key = 'gmail'`))[0]?.m ?? null;
    // to one person (must be on the school's list), or the office
    let toUser: string | null = null, toEmail: string | null = null, toName = "";
    if (to && /^[0-9a-f-]{36}$/.test(to)) {
      const c = (await teacherContacts()).find((x) => x.user_id === to);
      if (!c) return "Choose who to email from the list.";
      const u = (await q<{ email: string }>(`select email::text from users where id = $1`, [c.user_id]))[0];
      toUser = c.user_id; toEmail = u?.email ?? null; toName = c.name;
    } else if (!thread) {
      return "Choose who to email.";
    } else {
      toUser = (await q<{ t: string | null }>(`select to_user as t from inbox_messages where thread_id = $1 order by received_at limit 1`, [thread]))[0]?.t ?? null;
    }
    const [row0] = await q<{ id: string }>(`insert into inbox_messages (school_id, gmail_id, thread_id, from_name, from_email, subject, snippet, body, received_at, parent_id, kind, mailbox, sent_by, to_user, links)
      values (current_school(), $1, $2, $3, $4, $5, $6, $7, now(), null, 'staff', $8, $9, $10, $11) returning id`,
      [`local:${id}`, th, user.name.slice(0, 120), user.email, sub, text.replace(/\s+/g, " ").slice(0, 400), text, box, user.id, toUser, links.length ? links : null]);
    for (const b of blobs) await q(`insert into inbox_attachments (school_id, message_id, name, mime, size, data) values (current_school(), $1, $2, $3, $4, $5)`, [row0.id, b.name, b.mime, b.size, b.data]);
    // the person it's for also gets it by email, with a link to reply from the admin's inbox
    if (toEmail) {
      const { sendOne } = await import("./email");
      const { siteBase } = await import("./social");
      const site = (process.env.SITE_URL || (await siteBase().catch(() => "")) || "").replace(/\/$/, "");
      const row = (await q<{ id: string }>(`select id from inbox_messages where gmail_id = $1`, [`local:${id}`]))[0];
      await sendOne([{ email: toEmail, name: toName }], `${user.name}: ${sub}`,
        `${user.name} (teacher) messaged you through the school site:\n\n${text}${links.length ? `\n\nLinks:\n${links.join("\n")}` : ""}${blobs.length ? `\n\n${blobs.length} attachment${blobs.length > 1 ? "s" : ""} (open the email in the admin to download): ${blobs.map((b) => b.name).join(", ")}` : ""}\n\nReply from the admin: ${site}/admin/email?tab=inbox&show=all&m=${row?.id ?? ""}\n(Replying there emails ${user.name} and keeps the conversation on their Messages page.)`,
        { tag: "teacher-email" }).catch(() => null);
    }
    return null;
  });
}

/** Set (or with "", remove) the slides link for one of this teacher's lessons. Returns an error message or null. */
export async function setLessonSlides(userId: string, eventId: string, url: string): Promise<string | null> {
  const u = url.trim();
  if (u && !/^https:\/\/[^\s]{4,590}$/.test(u)) return "Paste the full link, starting with https://";
  if (!/^[0-9a-f-]{36}$/.test(eventId)) return "That lesson isn’t one of yours.";
  const r = await withSchool((q) => q(`update lesson_events set slides_url = nullif($3, '') where id = $2 and teacher_id = ${ME} returning id`, [userId, eventId, u]));
  return r.length ? null : "That lesson isn’t one of yours.";
}

// ---------- the teacher's Google Drive page: a slides folder for each class ----------
export async function myClassFolders(userId: string) {
  return withSchool((q) => q<{ id: string; name: string; code: string; folder: string | null; course: string | null }>(`
    select g.id, l.name || ' ' || sj.name as name, g.code, g.slides_folder as folder, g.google_course_id as course
    from course_groups g join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
    where g.teacher_id = ${ME} and g.academic_year_id = ${YEAR_NOW} and g.status <> 'hidden' order by l.sort_order, sj.name`, [userId]));
}
/** A folder link or id → the folder id, or null. */
export function folderId(v: string): string | null {
  const t = v.trim(); if (!t) return null;
  const m = t.match(/\/folders\/([A-Za-z0-9_-]{10,100})/) ?? t.match(/[?&]id=([A-Za-z0-9_-]{10,100})/) ?? t.match(/^([A-Za-z0-9_-]{10,100})$/);
  return m ? m[1] : null;
}
export async function setClassFolder(userId: string, groupId: string, value: string): Promise<string | null> {
  const id = value.trim() ? folderId(value) : null;
  if (value.trim() && !id) return "That doesn’t look like a Google Drive folder link. Open the folder in Drive and copy the address.";
  if (!/^[0-9a-f-]{36}$/.test(groupId)) return "That class isn’t one of yours.";
  const r = await withSchool((q) => q(`update course_groups set slides_folder = $3 where id = $2 and teacher_id = ${ME} returning id`, [userId, groupId, id]));
  if (!r.length) return "That class isn’t one of yours.";
  await withSchool((q) => q(`delete from meet_kv where key like 'slidesdir:%'`)).catch(() => null);
  return null;
}

// ---------- My classes and My students (31 Oct) ----------
// Only the teacher's own classes this school year. SEND details only where the parent agreed to share them with teachers;
// no parent contact details (teachers reach parents through Messages).
export type MyClass = { id: string; code: string; level: string; subject: string; colour: string; students: number; capacity: number | null;
  slots: { d: number; t: string; e: string }[] | null; meet_url: string | null; classroom: string | null; next: { id: string; d: string; t: string } | null;
  att: number | null; send: number; slides_folder: string | null };
export type MyStudent = { id: string; name: string; known_as: string | null; email: string | null; dob: string | null; year_group: number | null;
  classes: { id: string; name: string; code: string; att: number | null; lessons: number }[]; att: number | null; points: number;
  send: boolean; needs: string[] | null; send_details: string | null; adjustments: string | null; confirmed: boolean; in_classroom: boolean | null };

export async function myClasses(userId: string): Promise<MyClass[]> {
  return withSchool((q) => q<MyClass>(`
    select g.id, g.code, l.name as level, sj.name as subject, coalesce(sj.colour, '#8494c2') as colour, g.capacity, g.meet_url, g.slides_folder,
      case when g.google_course_id is not null then 'https://classroom.google.com/c/' || g.google_course_id end as classroom,
      (select count(*)::int from enrolments e where e.group_id = g.id and e.status in ('pending','active') and not e.is_taster) as students,
      (select json_agg(json_build_object('d', s.weekday, 't', to_char(s.starts_at,'HH24:MI'), 'e', to_char(s.ends_at,'HH24:MI')) order by s.weekday, s.starts_at) from lesson_slots s where s.group_id = g.id) as slots,
      (select json_build_object('id', ev.id, 'd', ev.lesson_date::text, 't', to_char(sl.starts_at,'HH24:MI')) from lesson_events ev join lesson_slots sl on sl.id = ev.slot_id
        where ev.group_id = g.id and ev.status <> 'cancelled' and ev.lesson_date >= current_date order by ev.lesson_date, sl.starts_at limit 1) as next,
      (select round(100.0 * count(*) filter (where m.mark in ('present','late')) / nullif(count(*) filter (where m.mark <> 'approved_absence'), 0))::int
        from attendance_marks m join lesson_events ev on ev.id = m.lesson_event_id where ev.group_id = g.id) as att,
      (select count(*)::int from enrolments e join student_support ss on ss.student_id = e.student_id where e.group_id = g.id and e.status in ('pending','active')
        and ss.has_send = 'yes' and ss.share_with_teachers) as send
    from course_groups g join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id join academic_years y on y.id = g.academic_year_id
    where y.ends_on >= current_date and g.status <> 'closed' and (g.teacher_id = ${ME} or exists (select 1 from lesson_slots s where s.group_id = g.id and s.teacher_id = ${ME}))
    order by l.sort_order, sj.name, g.code`, [userId]));
}

/** The teacher's students, in all their classes or in one (groupId). */
export async function myStudents(userId: string, groupId?: string): Promise<MyStudent[]> {
  return withSchool((q) => q<MyStudent>(`
    with mine as (select g.id from course_groups g join academic_years y on y.id = g.academic_year_id
      where y.ends_on >= current_date and (g.teacher_id = ${ME} or exists (select 1 from lesson_slots s where s.group_id = g.id and s.teacher_id = ${ME}))
        and ($2::uuid is null or g.id = $2::uuid))
    select s.id, s.first_name || ' ' || s.last_name as name, nullif(s.known_as, '') as known_as, s.email::text, s.date_of_birth::text as dob, s.year_group,
      coalesce(s.google_account_confirmed, false) as confirmed,
      (select bool_and(cm.state = 'joined') from classroom_memberships cm where cm.student_id = s.id and cm.group_id in (select id from mine)) as in_classroom,
      (select json_agg(json_build_object('id', g.id, 'name', l.name || ' ' || sj.name, 'code', g.code,
          'att', (select round(100.0 * count(*) filter (where m.mark in ('present','late')) / nullif(count(*) filter (where m.mark <> 'approved_absence'), 0))::int
                  from attendance_marks m join lesson_events ev on ev.id = m.lesson_event_id where ev.group_id = g.id and m.student_id = s.id),
          'lessons', (select count(*)::int from attendance_marks m join lesson_events ev on ev.id = m.lesson_event_id where ev.group_id = g.id and m.student_id = s.id))
        order by l.sort_order, sj.name)
        from enrolments e join course_groups g on g.id = e.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
        where e.student_id = s.id and e.status in ('pending','active') and not e.is_taster and g.id in (select id from mine)) as classes,
      -- attendance this term in this teacher's classes (marked lessons; approved absences don't count against it)
      (select round(100.0 * count(*) filter (where m.mark in ('present','late')) / nullif(count(*) filter (where m.mark <> 'approved_absence'), 0))::int
        from attendance_marks m join lesson_events ev on ev.id = m.lesson_event_id where m.student_id = s.id and ev.group_id in (select id from mine)
          and ev.lesson_date between (select starts_on from terms where id = ${TERM_NOW}) and (select ends_on from terms where id = ${TERM_NOW})) as att,
      coalesce((select sum(rp.points)::int from reward_points rp where rp.student_id = s.id
        and rp.awarded_on between (select starts_on from terms where id = ${TERM_NOW}) and (select ends_on from terms where id = ${TERM_NOW})), 0) as points,
      coalesce(ss.has_send = 'yes' and ss.share_with_teachers, false) as send,
      case when ss.has_send = 'yes' and ss.share_with_teachers then ss.needs end as needs,
      case when ss.has_send = 'yes' and ss.share_with_teachers then ss.details end as send_details,
      case when ss.has_send = 'yes' and ss.share_with_teachers then ss.adjustments end as adjustments
    from students s left join student_support ss on ss.student_id = s.id
    where exists (select 1 from enrolments e where e.student_id = s.id and e.group_id in (select id from mine) and e.status in ('pending','active') and not e.is_taster)
    order by s.first_name, s.last_name`, [userId, groupId ?? null]));
}

/** A class's Google Classroom work (31 Oct), as synced from Classroom: newest first, with each enrolled student's hand-in.
 *  status: done (handed in), marked (returned), missing (not handed in, past the due date), todo. link = the student's own work in Classroom. */
export type ClassWork = { id: string; title: string; due_at: string | null; max_points: number | null; link: string | null;
  done: number; marked: number; missing: number; late: number; todo: number;
  subs: { id: string; name: string; status: "done" | "marked" | "missing" | "todo"; late: boolean; points: number | null; at: string | null; link: string | null }[] };
export async function classWork(groupId: string, limit = 25): Promise<ClassWork[]> {
  return withSchool(async (q) => {
    const rows = await q<Omit<ClassWork, "done" | "marked" | "missing" | "late" | "todo">>(`
      with kids as (select st.id, st.first_name || ' ' || st.last_name as name from enrolments e join students st on st.id = e.student_id
        where e.group_id = $1 and e.status in ('pending','active') and not e.is_taster)
      select c.id, c.title, c.due_at::text, c.max_points::float as max_points, c.link,
        coalesce((select json_agg(json_build_object('id', k.id, 'name', k.name,
            'status', case when s.state = 'returned' then 'marked' when s.state = 'turned_in' then 'done'
                           when c.due_at is not null and c.due_at < now() then 'missing' else 'todo' end,
            'late', coalesce(s.late, false), 'points', s.points::float, 'at', s.turned_in_at::text, 'link', s.link) order by k.name)
          from kids k left join classroom_submissions s on s.coursework_id = c.id and s.student_id = k.id), '[]') as subs
      from classroom_coursework c where c.group_id = $1
      order by c.due_at desc nulls last, c.created_at desc limit $2`, [groupId, limit]);
    return rows.map((r) => {
      const n = (k: string) => r.subs.filter((s) => s.status === k).length;
      return { ...r, done: n("done"), marked: n("marked"), missing: n("missing"), todo: n("todo"), late: r.subs.filter((s) => s.late).length };
    });
  });
}
