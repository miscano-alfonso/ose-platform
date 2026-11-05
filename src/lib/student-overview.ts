import "server-only";
import { withSchool } from "./db";
import { sendLabels } from "./send";

// Admin → Students (5 Nov): one row per enrolled student with attendance (Google Meet marks), Classroom work handed in
// or missing, and reward points, all for this term. Work is "missing" once its due date has passed and nothing has been
// handed in. Classroom is read every couple of hours (and on "Read Classroom now"), so this is as fresh as that read.

const YEAR = `(select id from academic_years where school_id = current_school()
   order by (current_date between starts_on and ends_on) desc, starts_on >= current_date desc, starts_on limit 1)`;

export type MissingPiece = { title: string; due_at: string; link: string | null; code: string; gid: string };
export type StudentRow = {
  id: string; name: string; parent_id: string; family: string; levels: string; classes: { id: string; code: string; name: string }[];
  send: string[]; att: number | null; attended: number; held: number;
  due: number; handed: number; missing: number; late: number; marked: number; notInClassroom: number;
  points: number; missingList: MissingPiece[];
};
export type Overview = { term: { id: string; name: string; starts_on: string; ends_on: string } | null; since: string; rows: StudentRow[];
  totals: { students: number; due: number; handed: number; missing: number; late: number; withMissing: number; lowAtt: number; points: number };
  classroom: { at: string | null; error: string | null; linked: number; granted: boolean | null; missing: string[] | null; by: string | null; classes?: number; work?: number; submissions?: number; problems?: string[] } };

/** opts.teacherUserId: only that teacher's classes (their own dashboard). */
export async function studentOverview(opts: { teacherUserId?: string } = {}): Promise<Overview> {
  const { classroomMissing, googleConnectedBy } = await import("./meet");
  const [missing, by] = await Promise.all([classroomMissing().catch(() => null), googleConnectedBy().catch(() => null)]);
  const granted = missing == null ? null : missing.length === 0;
  return withSchool(async (q) => {
    const gids = opts.teacherUserId ? (await q<{ id: string }>(`select g.id from course_groups g join teachers t on t.id = g.teacher_id where t.user_id = $1 and g.academic_year_id = ${YEAR}`, [opts.teacherUserId])).map((r) => r.id) : null;
    const term = (await q<{ id: string; name: string; starts_on: string; ends_on: string }>(`select id, name, starts_on::text, ends_on::text from terms where academic_year_id = ${YEAR}
      order by (current_date between starts_on and ends_on) desc, (starts_on > current_date), starts_on desc limit 1`))[0] ?? null;
    // the window: this term if it has started, else the last six weeks
    // work: from the start of this term, but always at least the last 4 weeks (so the first weeks of a term still show
    // what was left undone before the break); attendance and points stay this term's
    const d28 = new Date(Date.now() - 28 * 864e5).toISOString().slice(0, 10);
    const tStart = term && term.starts_on <= new Date().toISOString().slice(0, 10) ? term.starts_on : null;
    const since = tStart && tStart < d28 ? tStart : d28, pSince = tStart ?? d28;
    const until = term && term.ends_on >= pSince ? term.ends_on : new Date().toISOString().slice(0, 10);
    const base = await q<{ id: string; name: string; parent_id: string; family: string; levels: string; classes: { id: string; code: string; name: string }[];
      has_send: string | null; needs: string[] | null; details: string | null }>(`
      select s.id, s.first_name || ' ' || s.last_name as name, s.parent_id, p.first_name || ' ' || p.last_name as family,
        string_agg(distinct l.name, ', ') as levels,
        json_agg(distinct jsonb_build_object('id', g.id, 'code', g.code, 'name', l.name || ' ' || sj.name)) as classes,
        sup.has_send, sup.needs, sup.details
      from enrolments e join course_groups g on g.id = e.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
        join students s on s.id = e.student_id join parents p on p.id = s.parent_id left join student_support sup on sup.student_id = s.id
      where e.status = 'active' and not e.is_taster and g.academic_year_id = ${YEAR} and ($1::uuid[] is null or g.id = any($1::uuid[]))
      group by s.id, s.first_name, s.last_name, s.parent_id, p.first_name, p.last_name, sup.has_send, sup.needs, sup.details
      order by s.first_name, s.last_name`, [gids]);
    const att = term ? await q<{ id: string; attended: number; held: number }>(`select m.student_id as id,
        count(*) filter (where m.mark in ('present','late'))::int as attended, count(*) filter (where m.mark <> 'approved_absence')::int as held
      from attendance_marks m join lesson_events ev on ev.id = m.lesson_event_id where ev.term_id = $1 and ($2::uuid[] is null or ev.group_id = any($2::uuid[])) group by m.student_id`, [term.id, gids]) : [];
    // each piece of class work due in the window, for each student in the class
    const work = await q<{ id: string; title: string; due_at: string; link: string | null; code: string; gid: string; state: string | null; late: boolean | null; joined: boolean }>(`
      select e.student_id as id, c.title, c.due_at::text, coalesce(sub.link, c.link) as link, g.code, g.id as gid, sub.state::text, sub.late,
        exists (select 1 from classroom_memberships cm where cm.group_id = g.id and cm.student_id = e.student_id and cm.state = 'joined') as joined
      from classroom_coursework c join course_groups g on g.id = c.group_id
        join enrolments e on e.group_id = g.id and e.status = 'active' and not e.is_taster and e.enrolled_at <= c.due_at
        left join classroom_submissions sub on sub.coursework_id = c.id and sub.student_id = e.student_id
      where c.due_at >= $1::date and c.due_at < now() and g.academic_year_id = ${YEAR} and ($2::uuid[] is null or g.id = any($2::uuid[]))
      order by c.due_at desc`, [since, gids]);
    const pts = await q<{ id: string; points: number }>(`select student_id as id, sum(points)::int as points from reward_points where awarded_on between $1::date and $2::date and ($3::uuid[] is null or group_id = any($3::uuid[])) group by student_id`, [pSince, until, gids]);
    const info = (await q<{ value: { at?: string; error?: string; classes?: number; work?: number; submissions?: number; problems?: string[] } }>(`select value from meet_kv where key = 'classroom' limit 1`).catch(() => []))[0]?.value ?? {};
    const linked = (await q<{ n: number }>(`select count(*)::int as n from course_groups g where g.academic_year_id = ${YEAR} and g.google_course_id is not null and g.status <> 'closed' and ($1::uuid[] is null or g.id = any($1::uuid[]))`, [gids]))[0]?.n ?? 0;

    const A = new Map(att.map((a) => [a.id, a])), P = new Map(pts.map((x) => [x.id, x.points]));
    const W = new Map<string, typeof work>(); work.forEach((w) => W.set(w.id, [...(W.get(w.id) ?? []), w]));
    const rows: StudentRow[] = base.map((b) => {
      const a = A.get(b.id), ws = W.get(b.id) ?? [];
      const handedIn = ws.filter((w) => w.state === "turned_in" || w.state === "returned"), miss = ws.filter((w) => !(w.state === "turned_in" || w.state === "returned"));
      return { id: b.id, name: b.name, parent_id: b.parent_id, family: b.family, levels: b.levels, classes: b.classes,
        send: b.has_send === "yes" ? sendLabels(b.needs, b.details) : [],
        att: a && a.held ? Math.round((a.attended / a.held) * 100) : null, attended: a?.attended ?? 0, held: a?.held ?? 0,
        due: ws.length, handed: handedIn.length, missing: miss.length, late: handedIn.filter((w) => w.late).length,
        marked: ws.filter((w) => w.state === "returned").length, notInClassroom: miss.filter((w) => !w.joined).length,
        points: P.get(b.id) ?? 0, missingList: miss.slice(0, 8).map((w) => ({ title: w.title, due_at: w.due_at, link: w.link, code: w.code, gid: w.gid })) };
    });
    const sum = (k: keyof StudentRow) => rows.reduce((n, r) => n + (r[k] as number), 0);
    return { term, since, rows,
      totals: { students: rows.length, due: sum("due"), handed: sum("handed"), missing: sum("missing"), late: sum("late"), withMissing: rows.filter((r) => r.missing > 0).length,
        lowAtt: rows.filter((r) => r.att != null && r.held >= 3 && r.att < 85).length, points: sum("points") },
      classroom: { at: info.at ?? null, error: info.error ?? null, linked, granted, missing, by, classes: info.classes, work: info.work, submissions: info.submissions, problems: info.problems } };
  });
}
