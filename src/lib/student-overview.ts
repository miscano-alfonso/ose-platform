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
  classroom: { at: string | null; error: string | null; linked: number; granted: boolean | null; missing: string[] | null; by: string | null; classes?: number; work?: number; submissions?: number; problems?: string[]; unmatched?: { userId: string; name: string; email: string | null; gid: string; code: string }[] } };

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
    const info = (await q<{ value: { at?: string; error?: string; classes?: number; work?: number; submissions?: number; problems?: string[]; unmatched?: { userId: string; name: string; email: string | null; gid: string; code: string }[] } }>(`select value from meet_kv where key = 'classroom' limit 1`).catch(() => []))[0]?.value ?? {};
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
      classroom: { at: info.at ?? null, error: info.error ?? null, linked, granted, missing, by, classes: info.classes, work: info.work, submissions: info.submissions, problems: info.problems, unmatched: info.unmatched } };
  });
}

// ---------- one student's page (Admin → Students → a student, 5 Nov) ----------
export type StudentProfile = {
  s: { id: string; name: string; known_as: string | null; email: string | null; dob: string | null; year_group: number | null; parent_id: string; family: string; parent_email: string;
    has_send: string | null; needs: string[] | null; details: string | null; adjustments: string | null; share: boolean | null };
  classes: { id: string; name: string; code: string; teacher: string | null; status: string; taster: boolean; attended: number; held: number; in_classroom: boolean | null }[];
  marks: { date: string; class: string; mark: string; minutes: number | null; source: string; term: string | null; n: number }[];
  work: { id: string; title: string; class: string; gid: string; term: string | null; due_at: string | null; state: string | null; late: boolean; points: number | null; max: number | null; link: string | null; status: "missing" | "handed" | "marked" | "due" | "nodate" }[];
  points: { points: number; reason: string; on: string; teacher: string; class: string }[];
  term: { name: string } | null;
};
export async function studentProfile(id: string): Promise<StudentProfile | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  return withSchool(async (q) => {
    const s = (await q<StudentProfile["s"]>(`select s.id, s.first_name || ' ' || s.last_name as name, nullif(s.known_as, '') as known_as, s.email::text, s.date_of_birth::text as dob, s.year_group,
        s.parent_id, p.first_name || ' ' || p.last_name as family, p.email::text as parent_email, sup.has_send, sup.needs, sup.details, sup.adjustments, sup.share_with_teachers as share
      from students s join parents p on p.id = s.parent_id left join student_support sup on sup.student_id = s.id where s.id = $1`, [id]))[0];
    if (!s) return null;
    const term = (await q<{ id: string; name: string }>(`select id, name from terms where academic_year_id = ${YEAR}
      order by (current_date between starts_on and ends_on) desc, (starts_on > current_date), starts_on desc limit 1`))[0] ?? null;
    const classes = await q<StudentProfile["classes"][number]>(`select g.id, l.name || ' ' || sj.name as name, g.code, u.name as teacher, e.status::text, e.is_taster as taster,
        (select count(*)::int from attendance_marks m join lesson_events ev on ev.id = m.lesson_event_id where m.student_id = $1 and ev.group_id = g.id and ev.term_id = $2 and m.mark in ('present','late')) as attended,
        (select count(*)::int from attendance_marks m join lesson_events ev on ev.id = m.lesson_event_id where m.student_id = $1 and ev.group_id = g.id and ev.term_id = $2 and m.mark <> 'approved_absence') as held,
        (select cm.state = 'joined' from classroom_memberships cm where cm.group_id = g.id and cm.student_id = $1 limit 1) as in_classroom
      from enrolments e join course_groups g on g.id = e.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
        left join teachers t on t.id = g.teacher_id left join users u on u.id = t.user_id
      where e.student_id = $1 and g.academic_year_id = ${YEAR} order by (e.status = 'active') desc, l.sort_order, sj.name`, [id, term?.id ?? null]);
    // each lesson's number in its class that term (cancelled lessons don't count), as on the recordings and slides
    const marks = await q<StudentProfile["marks"][number]>(`select ev.lesson_date::text as date, l.name || ' ' || sj.name as class, m.mark::text as mark, m.minutes_present as minutes, m.source, t.name as term,
        (select count(*)::int from lesson_events e2 where e2.group_id = ev.group_id and e2.term_id = ev.term_id and e2.status <> 'cancelled' and e2.lesson_date <= ev.lesson_date) as n
      from attendance_marks m join lesson_events ev on ev.id = m.lesson_event_id join terms t on t.id = ev.term_id join course_groups g on g.id = ev.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
      where m.student_id = $1 order by ev.lesson_date desc, l.name, sj.name limit 40`, [id]);
    const work = (await q<Omit<StudentProfile["work"][number], "status">>(`select c.id, c.title, l.name || ' ' || sj.name as class, g.id as gid, c.due_at::text,
        (select tt.name from terms tt where tt.academic_year_id = g.academic_year_id and tt.starts_on <= (c.due_at at time zone 'Europe/London')::date order by tt.starts_on desc limit 1) as term, sub.state::text, coalesce(sub.late, false) as late,
        sub.points::float as points, c.max_points::float as max, coalesce(sub.link, c.link) as link
      from classroom_coursework c join course_groups g on g.id = c.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
        join enrolments e on e.group_id = g.id and e.student_id = $1 and not e.is_taster and e.enrolled_at <= coalesce(c.due_at, now())
        left join classroom_submissions sub on sub.coursework_id = c.id and sub.student_id = $1
      where g.academic_year_id = ${YEAR} order by c.due_at desc nulls last limit 60`, [id]))
      .map((w) => ({ ...w, status: w.state === "returned" ? "marked" as const : w.state === "turned_in" ? "handed" as const : !w.due_at ? "nodate" as const : Date.parse(w.due_at) < Date.now() ? "missing" as const : "due" as const }));
    const points = await q<StudentProfile["points"][number]>(`select r.points, r.reason, r.awarded_on::text as on, u.name as teacher, l.name || ' ' || sj.name as class
      from reward_points r join teachers t on t.id = r.teacher_id join users u on u.id = t.user_id join course_groups g on g.id = r.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
      where r.student_id = $1 order by r.created_at desc limit 30`, [id]);
    return { s, classes, marks, work, points, term: term ? { name: term.name } : null };
  });
}
