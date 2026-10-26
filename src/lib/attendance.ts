import "server-only";
import { withSchool } from "./db";
import { ensureLessonDates } from "./ops";

// Admin → Attendance, as in the prototype: marks come from Google Meet (lib/meet.ts); the office can correct a mark on the lesson's register.
const YEAR_SQL = `(select id from academic_years where ends_on >= current_date order by starts_on limit 1)`;

export type TermOpt = { id: string; number: number; name: string; starts_on: string; ends_on: string; current: boolean; lessons: number };
export type StudentAtt = { id: string; parent_id: string; name: string; level: string; held: number; attended: number; late: number; left_early: number; absent: number; approved: number; pct: number | null; last_absence: string | null };
export type ClassOpt = { id: string; name: string };
export type GridLesson = { id: string; date: string; time: string; status: string };
export type GridRow = { id: string; name: string; marks: Record<string, { mark: string; early: boolean; joined: string | null; left: string | null; mins: number | null }>; pct: number | null };
export type Absence = { id: string; date: string; time: string; student: string; class: string; reason: string; note: string | null; reported: string; upcoming: boolean };

export async function attendanceOverview(termId: string | null, classId: string | null) {
  await ensureLessonDates().catch((e) => console.error("lesson dates", e));
  return withSchool(async (q) => {
    const terms = await q<TermOpt>(`select t.id, t.number, t.name, t.starts_on::text, t.ends_on::text, current_date between t.starts_on and t.ends_on as current,
        (select count(*)::int from lesson_events e where e.term_id = t.id) as lessons
      from terms t where t.academic_year_id = ${YEAR_SQL} order by t.number`);
    const today = new Date().toISOString().slice(0, 10);
    const term = terms.find((t) => t.id === termId) ?? terms.find((t) => t.current) ?? [...terms].reverse().find((t) => t.starts_on <= today) ?? terms[0] ?? null;
    if (!term) return { terms, term: null, overall: null, held: 0, firstHeld: null, students: [] as StudentAtt[], classes: [] as ClassOpt[], cls: null, grid: { lessons: [] as GridLesson[], rows: [] as GridRow[] }, absences: [] as Absence[] };
    const [o] = await q<{ pct: number | null; held: number; first: string | null }>(`select
        (select round(100.0 * count(*) filter (where m.mark in ('present','late')) / nullif(count(*) filter (where m.mark <> 'approved_absence'), 0))::int
          from attendance_marks m join lesson_events e on e.id = m.lesson_event_id where e.term_id = $1) as pct,
        (select count(*)::int from lesson_events e where e.term_id = $1 and e.status = 'taught') as held,
        (select min(lesson_date)::text from lesson_events e where e.term_id = $1 and e.status = 'taught') as first`, [term.id]);
    const students = await q<StudentAtt>(`select st.id, st.parent_id, st.first_name || ' ' || st.last_name as name,
        coalesce((select string_agg(distinct l.name, ', ') from enrolments x join course_groups g on g.id = x.group_id join levels l on l.id = g.level_id
          where x.student_id = st.id and x.status = 'active' and not x.is_taster), '') as level,
        (a.lessons - a.approved_absences)::int as held, a.attended, a.late, a.left_early, a.unexplained_absences as absent, a.approved_absences as approved, a.attendance_pct as pct,
        (select max(e.lesson_date)::text from attendance_marks m join lesson_events e on e.id = m.lesson_event_id where m.student_id = st.id and e.term_id = $1 and m.mark = 'absent') as last_absence
      from student_term_attendance a join students st on st.id = a.student_id where a.term_id = $1 order by a.attendance_pct nulls last, st.first_name`, [term.id]);
    const classes = await q<ClassOpt>(`select g.id, l.name || ' ' || sj.name || ' (' || g.code || ')' as name from course_groups g join levels l on l.id = g.level_id
      join subjects sj on sj.id = g.subject_id where g.academic_year_id = ${YEAR_SQL} and g.status <> 'closed' and exists (select 1 from lesson_events e where e.group_id = g.id)
      order by l.sort_order, sj.name, g.code`);
    const cls = classes.find((c) => c.id === classId) ?? classes[0] ?? null;
    let grid = { lessons: [] as GridLesson[], rows: [] as GridRow[] };
    if (cls) {
      const lessons = (await q<GridLesson>(`select e.id, e.lesson_date::text as date, to_char(s.starts_at,'HH24:MI') as time, e.status::text from lesson_events e
        join lesson_slots s on s.id = e.slot_id where e.group_id = $1 and e.term_id = $2 and e.lesson_date <= current_date and e.status <> 'cancelled'
        order by e.lesson_date desc, s.starts_at desc limit 8`, [cls.id, term.id])).reverse();
      const rows = await q<GridRow>(`select st.id, st.first_name || ' ' || st.last_name as name,
          coalesce((select json_object_agg(m.lesson_event_id, json_build_object('mark', m.mark, 'early', m.left_early, 'mins', m.minutes_present,
            'joined', to_char(m.joined_at at time zone 'Europe/London','HH24:MI'), 'left', to_char(m.left_at at time zone 'Europe/London','HH24:MI')))
            from attendance_marks m where m.student_id = st.id and m.lesson_event_id = any($2::uuid[])), '{}') as marks,
          (select a.attendance_pct from student_term_attendance a where a.student_id = st.id and a.term_id = $3) as pct
        from enrolments x join students st on st.id = x.student_id where x.group_id = $1 and x.status = 'active' and not x.is_taster order by st.first_name`,
        [cls.id, lessons.map((l) => l.id), term.id]);
      grid = { lessons, rows };
    }
    const absences = await q<Absence>(`select n.id, e.lesson_date::text as date, to_char(s.starts_at,'HH24:MI') as time, st.first_name || ' ' || st.last_name as student,
        l.name || ' ' || sj.name as class, n.reason, n.note, n.created_at::date::text as reported, e.lesson_date >= current_date as upcoming
      from absence_notices n join lesson_events e on e.id = n.lesson_event_id join lesson_slots s on s.id = e.slot_id join students st on st.id = n.student_id
      join course_groups g on g.id = e.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
      where n.cancelled_at is null and e.lesson_date >= current_date - 60 order by e.lesson_date >= current_date desc, abs(e.lesson_date - current_date) limit 100`);
    return { terms, term, overall: o.pct, held: o.held, firstHeld: o.first, students, classes, cls, grid, absences };
  });
}
