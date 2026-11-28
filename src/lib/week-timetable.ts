import "server-only";
import { withSchool } from "./db";

// The day-to-day timetable: one week's actual lessons (dates, not the weekly pattern), with what's live now,
// each lesson's join link, register and Google Classroom.

export type WeekLesson = { id: string; date: string; weekday: number; starts: string; ends: string; start_at: string; end_at: string; group_id: string; name: string; level: string;
  subject: string; colour: string; code: string; teacher: string | null; teacher_id: string | null; status: string; link: string | null; course: string | null; students: number; away: number; came: number; read: boolean };

const iso = (d: Date) => d.toISOString().slice(0, 10);
/** The Monday of the week holding `day` (YYYY-MM-DD). */
export function mondayOf(day: string): string {
  const d = new Date(day + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return iso(d);
}
export const addDays = (day: string, n: number) => { const d = new Date(day + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
export const todayLondon = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });

export async function weekLessons(monday: string): Promise<WeekLesson[]> {
  return withSchool((q) => q<WeekLesson>(`
    select e.id, e.lesson_date::text as date, extract(isodow from e.lesson_date)::int as weekday, to_char(s.starts_at,'HH24:MI') as starts, to_char(s.ends_at,'HH24:MI') as ends,
      ((e.lesson_date + s.starts_at) at time zone sc.timezone)::text as start_at, ((e.lesson_date + s.ends_at) at time zone sc.timezone)::text as end_at,
      g.id as group_id, l.name || ' ' || sj.name as name, l.name as level, sj.name as subject, coalesce(sj.colour,'#8494c2') as colour, g.code,
      u.name as teacher, coalesce(e.teacher_id, s.teacher_id, g.teacher_id) as teacher_id, e.status::text, g.meet_url as link, g.google_course_id as course,
      (select count(*)::int from enrolments x where x.group_id = g.id and x.status = 'active' and not x.is_taster and coalesce(x.starts_on, x.enrolled_at::date) <= e.lesson_date) as students,
      (select count(*)::int from absence_notices n where n.lesson_event_id = e.id and n.cancelled_at is null) as away,
      -- 28 Nov (Alfonso): how many of the class came: a present/late mark, or a Meet join matched to an enrolled student
      (select count(distinct x.student_id)::int from enrolments x where x.group_id = g.id and x.status = 'active' and not x.is_taster
        and (exists (select 1 from attendance_marks m where m.lesson_event_id = e.id and m.student_id = x.student_id and m.mark in ('present', 'late'))
          or exists (select 1 from meet_sessions ms where ms.lesson_event_id = e.id and ms.student_id = x.student_id and not coalesce(ms.ignored, false)))) as came,
      (exists (select 1 from attendance_marks m where m.lesson_event_id = e.id) or exists (select 1 from meet_sessions ms where ms.lesson_event_id = e.id)) as read
    from lesson_events e join lesson_slots s on s.id = e.slot_id join course_groups g on g.id = e.group_id join schools sc on sc.id = e.school_id
    join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
    left join teachers t on t.id = coalesce(e.teacher_id, s.teacher_id, g.teacher_id) left join users u on u.id = t.user_id
    where e.lesson_date between $1::date and $1::date + 6
    order by e.lesson_date, s.starts_at, l.sort_order, sj.name`, [monday]));
}
/** The Monday of the next week that has lessons, from `from` on (to skip holidays), or null. */
export async function nextTeachingWeek(from: string): Promise<string | null> {
  const r = await withSchool((q) => q<{ d: string | null }>(`select min(lesson_date)::text as d from lesson_events where lesson_date >= $1::date and status <> 'cancelled'`, [from]));
  return r[0]?.d ? mondayOf(r[0].d) : null;
}
/** Google Classroom's web address for a course id. */
export const classroomUrl = (courseId: string) => `https://classroom.google.com/c/${Buffer.from(courseId).toString("base64").replace(/=+$/, "")}`;

/** 28 Nov: during a lesson, who of the class is in the Google Meet right now (matched by name, as on the register). */
export async function liveCame(lessons: WeekLesson[]): Promise<Record<string, number>> {
  if (!lessons.length) return {};
  const { liveArrivals } = await import("./meet-live");
  const roster = await withSchool((q) => q<{ group_id: string; id: string; name: string; first: string }>(`select e.group_id, s.id, s.first_name || ' ' || s.last_name as name,
      coalesce(nullif(s.known_as, ''), s.first_name) as first from enrolments e join students s on s.id = e.student_id
    where e.group_id = any($1::uuid[]) and e.status = 'active' and not e.is_taster`, [lessons.map((l) => l.group_id)])).catch(() => []);
  const out: Record<string, number> = {};
  await Promise.all(lessons.map(async (l) => {
    const r = await liveArrivals(l.id, l.link, l.start_at, roster.filter((x) => x.group_id === l.group_id)).catch(() => null);
    if (r?.ok) out[l.id] = Object.keys(r.matched).length;
  }));
  return out;
}
