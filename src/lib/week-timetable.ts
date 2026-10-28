import "server-only";
import { withSchool } from "./db";

// The day-to-day timetable: one week's actual lessons (dates, not the weekly pattern), with what's live now,
// each lesson's join link, register and Google Classroom.

export type WeekLesson = { id: string; date: string; weekday: number; starts: string; ends: string; start_at: string; end_at: string; group_id: string; name: string; level: string;
  subject: string; colour: string; code: string; teacher: string | null; teacher_id: string | null; status: string; link: string | null; course: string | null; students: number; away: number };

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
      (select count(*)::int from absence_notices n where n.lesson_event_id = e.id and n.cancelled_at is null) as away
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
