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
  not_in_classroom: number; tasters: string[]; absent: string[]; marked: number;
  /** Students in the class whose birthday is on the lesson day or within 3 days of it (so the teacher can say happy birthday). */
  birthdays?: { name: string; d: string; age: number }[] };
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
      select ev.id, ev.lesson_date::text as d, to_char(sl.starts_at,'HH24:MI') as time, l.name || ' ' || sj.name as name, g.code, ev.status::text, g.meet_url,
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
          where e.group_id = g.id and e.status in ('pending','active') and s.date_of_birth is not null and abs(b.d - ev.lesson_date) <= 3), '[]'::json) as birthdays
      from lesson_events ev join lesson_slots sl on sl.id = ev.slot_id join course_groups g on g.id = ev.group_id
      join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
      where ev.teacher_id = ${ME} and ev.status <> 'cancelled' and ev.lesson_date >= current_date
        -- the rest of the teaching week (Monday to Sunday) that holds the teacher's next lesson, so a week starting after half term shows in full
        and ev.lesson_date <= (select date_trunc('week', min(e2.lesson_date))::date + 6 from lesson_events e2 where e2.teacher_id = ${ME} and e2.status <> 'cancelled' and e2.lesson_date >= current_date)
      order by ev.lesson_date, sl.starts_at`, [userId]).catch(() => q<WeekLesson>(`
      select ev.id, ev.lesson_date::text as d, to_char(sl.starts_at,'HH24:MI') as time, l.name || ' ' || sj.name as name, g.code, ev.status::text, g.meet_url,
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
export async function teacherPost(userId: string, chatId: string, body: string): Promise<string | null> {
  try {
    return await withSchool(async (q) => {
      const r = await q(`insert into student_chat_messages (school_id, chat_id, sender_teacher_id, body)
        select current_school(), c.id, g.teacher_id, $3 from student_chats c join course_groups g on g.id = c.group_id where c.id = $2 and g.teacher_id = ${ME} returning id`, [userId, chatId, body]);
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

export type TeacherMail = { id: string; from: string; subject: string; snippet: string; received_at: string; parent_id: string; children: string };
/** Emails from families addressed to this teacher (To or Cc, or read from the teacher's own connected inbox), last 30 days.
 *  Read-only: the office replies, or the teacher uses Messages. */
export async function teacherMail(userId: string): Promise<{ connected: boolean; rows: TeacherMail[] }> {
  return withSchool(async (q) => {
    const rows = await q<TeacherMail>(`
      with me as (select lower(email::text) as email from users where id = $1)
      select m.id, coalesce(nullif(m.from_name, ''), p.first_name || ' ' || p.last_name, m.from_email::text) as "from", m.subject, m.snippet, m.received_at::text, m.parent_id,
        (select string_agg(distinct coalesce(nullif(s.known_as, ''), s.first_name), ', ') from students s join enrolments e on e.student_id = s.id join course_groups g on g.id = e.group_id
          where s.parent_id = m.parent_id and e.status in ('pending','active') and g.teacher_id = ${ME}) as children
      from inbox_messages m left join parents p on p.id = m.parent_id, me
      where m.received_at > now() - interval '30 days' and (lower(m.mailbox::text) = me.email or me.email = any(m.to_addrs))
      order by m.received_at desc limit 20`, [userId]).catch(() => []);
    const [{ n }] = await q<{ n: number }>(`select count(*)::int as n from meet_kv where key = 'gmail' and jsonb_typeof(value) = 'object' and value ? 'refreshToken'`).catch(() => [{ n: 0 }]);
    return { connected: n > 0, rows };
  });
}
