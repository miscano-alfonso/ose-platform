import "server-only";
import { withSchool } from "./db";

// Marking turnaround (6 Nov): handed-in work should be marked and returned in Google Classroom within 7 days of the work's
// due date (work set without a due date: 7 days from when it was handed in). It stops counting when the teacher returns the
// work. Teachers see a countdown on their dashboard, and from 2 days left a dashboard notification and (with the automation
// on) a daily email.
export const TURNAROUND_DAYS = 7;
export const REMIND_DAYS = 2;

export type MarkItem = { cw: string; title: string; link: string | null; gid: string; cls: string; teacherUserId: string | null; teacher: string | null; teacherEmail: string | null;
  toMark: number; deadline: string; daysLeft: number; names: string[] };   // daysLeft: whole days, negative once past

/** Handed-in work waiting to be returned, one row per piece of work, soonest deadline first. Only this teacher's classes when given. */
type Q = <T = Record<string, unknown>>(s: string, p?: unknown[]) => Promise<T[]>;
export async function markingQueue(teacherUserId: string | null = null, qq?: Q): Promise<MarkItem[]> {
  const run = (q: Q) => q<Omit<MarkItem, "daysLeft">>(`select c.id as cw, c.title, c.link, g.id as gid, l.name || ' ' || sj.name as cls,
      t.user_id as "teacherUserId", u.name as teacher, u.email::text as "teacherEmail",
      count(*)::int as "toMark", min(coalesce(c.due_at, s.turned_in_at) + make_interval(days => $2))::text as deadline,
      array_agg(st.first_name || ' ' || st.last_name order by s.turned_in_at nulls last) as names
    from classroom_submissions s join classroom_coursework c on c.id = s.coursework_id join course_groups g on g.id = c.group_id
      join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id join students st on st.id = s.student_id
      left join teachers t on t.id = g.teacher_id left join users u on u.id = t.user_id
    where s.state = 'turned_in' and coalesce(c.due_at, s.turned_in_at) is not null and ($1::uuid is null or t.user_id = $1)
      and exists (select 1 from enrolments e where e.group_id = g.id and e.student_id = s.student_id and e.status in ('active', 'pending'))
    group by c.id, c.title, c.link, g.id, l.name, sj.name, t.user_id, u.name, u.email
    order by min(coalesce(c.due_at, s.turned_in_at)), c.title`, [teacherUserId, TURNAROUND_DAYS]);
  const rows = await (qq ? run(qq) : withSchool(run)).catch(() => [] as Omit<MarkItem, "daysLeft">[]);
  // whole days in London time, so a deadline tomorrow evening reads "Due tomorrow", not "2 days left"
  const day = (t: number) => Date.parse(new Date(t).toLocaleDateString("en-CA", { timeZone: "Europe/London" }) + "T00:00:00Z");
  const today = day(Date.now());
  return rows.map((r) => { const passed = Date.parse(r.deadline) < Date.now(), d = Math.round((day(Date.parse(r.deadline)) - today) / 864e5);
    return { ...r, daysLeft: passed ? Math.min(-1, d) : d }; });
}

/** Whole days until the marking deadline (London dates): "5 days left", "Due tomorrow", "Due today", "3 days overdue". */
export function countdown(daysLeft: number): string {
  if (daysLeft < 0) { const d = -daysLeft; return `${d} day${d === 1 ? "" : "s"} overdue`; }
  return daysLeft === 0 ? "Due today" : daysLeft === 1 ? "Due tomorrow" : `${daysLeft} days left`;
}
export const tone = (daysLeft: number) => daysLeft < 0 ? "bad" : daysLeft <= REMIND_DAYS ? "warn" : "ok";

/** The Marking page (25 Nov): every handed-in piece of work still to be returned, one row per student's hand-in,
 *  for this teacher's classes, with the link to that hand-in in Classroom. The countdown is the piece of work's. */
export type MarkSub = { sid: string; cw: string; title: string; cwLink: string | null; link: string | null; gid: string; cls: string; code: string;
  student: string; late: boolean; turnedIn: string | null; due: string | null };
export async function markingSubmissions(teacherUserId: string): Promise<MarkSub[]> {
  return withSchool((q) => q<MarkSub>(`select s.id as sid, c.id as cw, c.title, c.link as "cwLink", s.link, g.id as gid, l.name || ' ' || sj.name as cls, g.code,
      st.first_name || ' ' || st.last_name as student, coalesce(s.late, false) as late, s.turned_in_at::text as "turnedIn", c.due_at::text as due
    from classroom_submissions s join classroom_coursework c on c.id = s.coursework_id join course_groups g on g.id = c.group_id
      join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id join students st on st.id = s.student_id
      join teachers t on t.id = g.teacher_id
    where s.state = 'turned_in' and t.user_id = $1
      and exists (select 1 from enrolments e where e.group_id = g.id and e.student_id = s.student_id and e.status in ('active', 'pending'))
    order by s.turned_in_at nulls last, st.last_name`, [teacherUserId])).catch(() => []);
}

/** 26 Nov: everyone booked on the class for each piece of work, with where they are: handed in (to mark), marked
 *  (returned), or not handed in. For the Marking page's "2/6 handed in" and its full list of students. */
export type RosterRow = { cw: string; studentId: string; student: string; state: "to_mark" | "marked" | "not_in"; late: boolean; turnedIn: string | null; link: string | null; pct: number | null };
export async function markingRoster(cwIds: string[]): Promise<RosterRow[]> {
  if (!cwIds.length) return [];
  return withSchool((q) => q<RosterRow>(`select c.id as cw, st.id as "studentId", st.first_name || ' ' || st.last_name as student,
      case when s.state = 'turned_in' then 'to_mark' when s.state = 'returned' then 'marked' else 'not_in' end as state,
      coalesce(s.late, false) as late, s.turned_in_at::text as "turnedIn", s.link,
      case when s.points is not null and c.max_points > 0 then round(s.points / c.max_points * 100)::int end as pct
    from classroom_coursework c join enrolments e on e.group_id = c.group_id and e.status in ('active', 'pending') and not e.is_taster
      join students st on st.id = e.student_id
      left join classroom_submissions s on s.coursework_id = c.id and s.student_id = st.id
    where c.id = any($1::uuid[])
    order by c.id, case when s.state = 'turned_in' then 0 when s.state = 'returned' then 1 else 2 end, st.first_name, st.last_name`, [cwIds])).catch(() => []);
}

/** 26 Nov: for My day: how many on the class have handed each piece in (handed in or returned), out of everyone booked. */
export async function markingCounts(cwIds: string[]): Promise<Map<string, { handed: number; total: number }>> {
  if (!cwIds.length) return new Map();
  const rows = await withSchool((q) => q<{ cw: string; handed: number; total: number }>(`select c.id as cw,
      count(*) filter (where s.state in ('turned_in', 'returned'))::int as handed, count(*)::int as total
    from classroom_coursework c join enrolments e on e.group_id = c.group_id and e.status in ('active', 'pending') and not e.is_taster
      left join classroom_submissions s on s.coursework_id = c.id and s.student_id = e.student_id
    where c.id = any($1::uuid[]) group by c.id`, [cwIds])).catch(() => []);
  return new Map(rows.map((r) => [r.cw, { handed: r.handed, total: r.total }]));
}
