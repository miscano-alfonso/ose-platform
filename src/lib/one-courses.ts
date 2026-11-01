import "server-only";
import { withSchool } from "./db";
import { courseIdFrom, courseInfo } from "./classroom";

// 1:1 work from Google Classroom (2 Nov). Each 1:1 student has their own Classroom course with their teacher. Linked in
// Admin → 1:1 tutoring setup, its work, hand-ins and marks show on the teacher's 1:1s page, the student's dashboard and the
// parent's Assignments, read-only: marking and comments stay in Classroom, and every piece of work opens there.
export type OneCourse = { id: string; student_id: string; student: string; teacher_id: string; teacher: string; subject: string | null; course: string; name: string | null; link: string | null; work: number };
export type OneWork = { id: string; title: string; due_at: string | null; max: number | null; points: number | null; state: string | null; late: boolean; turned_in_at: string | null;
  link: string | null; status: "returned" | "handed_in" | "missing" | "due" | "assigned" };

const COURSES = `select oc.id, oc.student_id, s.first_name || ' ' || s.last_name as student, oc.teacher_id, u.name as teacher, sj.name as subject, oc.google_course_id as course, oc.name, oc.link,
    (select count(*)::int from classroom_coursework c where c.one_course_id = oc.id) as work
  from one_courses oc join students s on s.id = oc.student_id join teachers t on t.id = oc.teacher_id join users u on u.id = t.user_id left join subjects sj on sj.id = oc.subject_id`;

export async function listOneCourses(): Promise<OneCourse[]> {
  return withSchool((q) => q<OneCourse>(`${COURSES} order by s.first_name, s.last_name`)).catch(() => []);
}

/** For the admin: 1:1 recordings already set up with a Classroom course (Admin → Recordings) that aren't linked here yet. */
export async function oneCourseHints(): Promise<{ name: string; course: string }[]> {
  return withSchool((q) => q<{ name: string; course: string }>(`select r.name, r.course_id as course from rec_lessons r
    where r.kind = 'one' and r.active and r.course_id ~ '^[0-9]{5,20}$' and not exists (select 1 from one_courses oc where oc.google_course_id = r.course_id) order by r.name`)).catch(() => []);
}

export async function linkOneCourse(actorId: string, d: { student: string; teacher: string; subject: string; course: string }): Promise<string | null> {
  const id = courseIdFrom(d.course);
  if (!id) return "Paste the Classroom’s link (classroom.google.com/c/…) or its number.";
  if (![d.student, d.teacher].every((x) => /^[0-9a-f-]{36}$/.test(x))) return "Choose the student and the teacher.";
  const info = await courseInfo(id);
  if ("error" in info) return info.error;
  try {
    return await withSchool(async (q) => {
      if ((await q(`select 1 from course_groups where google_course_id = $1`, [id])).length) return "That Classroom belongs to a class, not a 1:1.";
      const r = await q<{ id: string }>(`insert into one_courses (school_id, student_id, teacher_id, subject_id, google_course_id, name, link) values (current_school(), $1, $2, $3, $4, $5, $6)
        on conflict (school_id, google_course_id) do update set student_id = excluded.student_id, teacher_id = excluded.teacher_id, subject_id = excluded.subject_id, name = excluded.name, link = excluded.link returning id`,
        [d.student, d.teacher, /^[0-9a-f-]{36}$/.test(d.subject) ? d.subject : null, id, info.name, info.link]);
      await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'link', 'one_course', $2, $3)`, [actorId, r[0].id, JSON.stringify({ course: id, name: info.name })]);
      return null;
    });
  } catch { return "Couldn’t link that Classroom."; }
}

export async function unlinkOneCourse(actorId: string, id: string) {
  await withSchool(async (q) => {
    await q(`delete from one_courses where id = $1`, [id]);   // its work goes with it (cascade)
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'unlink', 'one_course', $2, '{}')`, [actorId, id]);
  });
}

const WORK = `select c.id, c.title, c.due_at::text, c.max_points::float as max, s.points::float as points, s.state::text, coalesce(s.late, false) as late, s.turned_in_at::text,
    coalesce(s.link, c.link) as link,
    case when s.state = 'returned' then 'returned' when s.state = 'turned_in' then 'handed_in'
         when c.due_at is not null and c.due_at < now() then 'missing' when c.due_at is not null then 'due' else 'assigned' end as status
  from classroom_coursework c left join one_courses oc on oc.id = c.one_course_id left join classroom_submissions s on s.coursework_id = c.id and s.student_id = oc.student_id`;

/** The teacher's 1:1 students, each with their latest work. */
export async function teacherOneWork(userId: string): Promise<(OneCourse & { items: OneWork[] })[]> {
  return withSchool(async (q) => {
    const cs = await q<OneCourse>(`${COURSES} where oc.teacher_id = (select id from teachers where user_id = $1) order by s.first_name`, [userId]);
    const out: (OneCourse & { items: OneWork[] })[] = [];
    for (const c of cs) out.push({ ...c, items: await q<OneWork>(`${WORK} where c.one_course_id = $1 order by c.due_at desc nulls last, c.created_at desc limit 8`, [c.id]) });
    return out;
  }).catch(() => []);
}

/** A student's 1:1 courses (for their dashboard), or one of them with all its work. */
export async function studentOneCourses(studentId: string): Promise<OneCourse[]> {
  return withSchool((q) => q<OneCourse>(`${COURSES} where oc.student_id = $1 order by sj.name`, [studentId])).catch(() => []);
}
export async function studentOneCourse(studentId: string, id: string): Promise<(OneCourse & { items: OneWork[] }) | null> {
  return withSchool(async (q) => {
    const c = (await q<OneCourse>(`${COURSES} where oc.student_id = $1 and oc.id = $2`, [studentId, id]))[0];
    return c ? { ...c, items: await q<OneWork>(`${WORK} where c.one_course_id = $1 order by c.due_at desc nulls last, c.created_at desc limit 60`, [c.id]) } : null;
  }).catch(() => null);
}

/** For the admin's link form: students (those with 1:1s first), teachers and subjects. */
export async function oneCourseChoices() {
  return withSchool(async (q) => ({
    students: await q<{ id: string; name: string; ones: boolean }>(`select s.id, s.first_name || ' ' || s.last_name as name,
        exists (select 1 from tutoring_bookings b where lower(b.student_email::text) = lower(s.email::text) or (b.parent_id = s.parent_id and b.student_name ilike s.first_name || '%')) as ones
      from students s order by 3 desc, 2`),
    teachers: await q<{ id: string; name: string }>(`select t.id, u.name from teachers t join users u on u.id = t.user_id where t.archived_at is null order by u.name`),
    subjects: await q<{ id: string; name: string }>(`select id, name from subjects order by name`),
  }));
}
