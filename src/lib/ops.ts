import "server-only";
import { withSchool } from "./db";

// Day-to-day running of the school: timetable, lesson dates, registers and tasters.
export const DAY = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const YEAR_SQL = `(select id from academic_years where ends_on >= current_date order by starts_on limit 1)`;

export type Slot = { id: string; group_id: string; code: string; name: string; level: string; subject: string; colour: string; status: string; weekday: number; starts_at: string; ends_at: string; teacher: string | null; teacher_id: string | null };
export type TClass = { id: string; code: string; name: string; colour: string; status: string; minutes: number; teacher_id: string | null; teacher: string | null; students: number; slots: number };
export type TeacherOpt = { id: string; name: string };

export async function getTimetable(): Promise<{ year: string | null; slots: Slot[]; classes: TClass[]; teachers: TeacherOpt[] }> {
  return withSchool(async (q) => {
    const y = (await q<{ label: string }>(`select label from academic_years where id = ${YEAR_SQL}`))[0];
    const slots = await q<Slot>(`select s.id, g.id as group_id, g.code, l.name || ' ' || sj.name as name, l.name as level, sj.name as subject, coalesce(sj.colour,'#8494c2') as colour, g.status::text,
        s.weekday, to_char(s.starts_at,'HH24:MI') as starts_at, to_char(s.ends_at,'HH24:MI') as ends_at, u.name as teacher, s.teacher_id
      from lesson_slots s join course_groups g on g.id = s.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
      left join teachers t on t.id = s.teacher_id left join users u on u.id = t.user_id
      where s.academic_year_id = ${YEAR_SQL} order by s.weekday, s.starts_at, l.sort_order, g.code`);
    const classes = await q<TClass>(`select g.id, g.code, l.name || ' ' || sj.name as name, coalesce(sj.colour,'#8494c2') as colour, g.status::text, g.lesson_minutes as minutes,
        g.teacher_id, u.name as teacher,
        (select count(*)::int from enrolments e where e.group_id = g.id and e.status in ('pending','active') and not e.is_taster) as students,
        (select count(*)::int from lesson_slots s where s.group_id = g.id) as slots
      from course_groups g join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
      left join teachers t on t.id = g.teacher_id left join users u on u.id = t.user_id
      where g.academic_year_id = ${YEAR_SQL} and g.status <> 'closed' order by (select count(*) from lesson_slots s where s.group_id = g.id) > 0, l.sort_order, sj.name, g.code`);
    const teachers = await q<TeacherOpt>(`select t.id, u.name from teachers t join users u on u.id = t.user_id where t.archived_at is null order by u.name`);
    return { year: y?.label ?? null, slots, classes, teachers };
  });
}

/** Students in each class this year (ids only), to find timetable clashes for students taking two classes. */
export async function classRosters(): Promise<Record<string, string[]>> {
  const rows = await withSchool((q) => q<{ g: string; s: string[] }>(`select e.group_id as g, array_agg(e.student_id::text) as s from enrolments e join course_groups g on g.id = e.group_id
    where g.academic_year_id = ${YEAR_SQL} and e.status in ('pending','active') and not e.is_taster group by e.group_id`));
  return Object.fromEntries(rows.map((r) => [r.g, r.s]));
}

/** Adds a weekly lesson. Returns an error message the admin can act on (e.g. the teacher is already teaching then). */
export async function addSlot(actorId: string, groupId: string, weekday: number, start: string, minutes: number, teacherId: string | null): Promise<string | null> {
  try {
    await withSchool(async (q) => {
      const g = (await q<{ academic_year_id: string; teacher_id: string | null }>(`select academic_year_id, teacher_id from course_groups where id = $1`, [groupId]))[0];
      if (!g) throw new Error("That class wasn’t found.");
      const tid = teacherId || g.teacher_id;
      const r = await q<{ id: string }>(`insert into lesson_slots (school_id, academic_year_id, group_id, teacher_id, weekday, starts_at, ends_at)
        values (current_school(), $1, $2, $3::uuid, $4::int, $5::time, $5::time + make_interval(mins => $6::int)) returning id`,
        [g.academic_year_id, groupId, tid, weekday, start, minutes]);
      // classes with lessons generated already: add this slot's dates for the rest of the year too
      await q(`select generate_lesson_events(t.id) from terms t where t.academic_year_id = $1 and t.ends_on >= current_date
        and exists (select 1 from lesson_events e where e.term_id = t.id)`, [g.academic_year_id]);
      await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'add', 'lesson_slot', $2, $3)`,
        [actorId, r[0].id, JSON.stringify({ groupId, weekday, start, minutes, teacher: tid })]);
    });
    return null;
  } catch (e) {
    const m = (e as { code?: string; message?: string });
    if (m.code === "23P01") return "That teacher already has a lesson at that time. Pick another time or teacher.";
    return m.message ?? "Couldn’t add that lesson.";
  }
}

export async function removeSlot(actorId: string, slotId: string): Promise<string | null> {
  return withSchool(async (q) => {
    const used = (await q<{ n: number }>(`select count(*)::int as n from lesson_events e where e.slot_id = $1 and (e.lesson_date < current_date or e.status = 'taught'
      or exists (select 1 from attendance_marks m where m.lesson_event_id = e.id) or exists (select 1 from taster_bookings b where b.lesson_event_id = e.id and b.status <> 'cancelled'))`, [slotId]))[0].n;
    if (used) {
      // keep the history: stop future lessons instead of deleting a slot that has been taught
      await q(`delete from lesson_events where slot_id = $1 and lesson_date >= current_date and status = 'scheduled'
        and not exists (select 1 from taster_bookings b where b.lesson_event_id = lesson_events.id and b.status <> 'cancelled')`, [slotId]);
      return "This lesson time has already been taught, so it stays in the records. Its future lesson dates have been removed; add the new time as a new lesson.";
    }
    await q(`delete from lesson_slots where id = $1`, [slotId]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id) values (current_school(), $1, 'delete', 'lesson_slot', $2)`, [actorId, slotId]);
    return null;
  });
}

export async function setClassTeacher(actorId: string, groupId: string, teacherId: string | null, minutes: number): Promise<string | null> {
  try {
    await withSchool(async (q) => {
      await q(`update course_groups set teacher_id = $2::uuid, lesson_minutes = $3::int where id = $1`, [groupId, teacherId, minutes]);
      // move the class's own weekly lessons to the new teacher (cover set on single lessons stays)
      await q(`update lesson_slots set teacher_id = $2::uuid where group_id = $1`, [groupId, teacherId]);
      await q(`update lesson_events set teacher_id = $2::uuid where group_id = $1 and lesson_date >= current_date and status = 'scheduled'`, [groupId, teacherId]);
      await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'teacher', 'course_group', $2, $3)`,
        [actorId, groupId, JSON.stringify({ teacherId, minutes })]);
    });
    return null;
  } catch (e) {
    const m = e as { code?: string; message?: string };
    return m.code === "23P01" ? "That teacher already teaches at one of this class’s lesson times." : (m.message ?? "Couldn’t change the teacher.");
  }
}

// ---------- attendance ----------
export type TermOpt = { id: string; number: number; name: string; starts_on: string; ends_on: string; lessons: number; current: boolean };
export type LessonRow = { id: string; lesson_date: string; starts_at: string; ends_at: string; code: string; name: string; colour: string; teacher: string | null;
  status: string; students: number; marked: number; present: number; tasters: number };
export type ClassAtt = { code: string; name: string; taught: number; registers: number; pct: number | null; unexplained: number };

export async function getAttendance(termId: string | null, weekOf: string | null): Promise<{ terms: TermOpt[]; term: TermOpt | null; week: string; lessons: LessonRow[]; classes: ClassAtt[] }> {
  return withSchool(async (q) => {
    const terms = await q<TermOpt>(`select t.id, t.number, t.name, t.starts_on::text, t.ends_on::text,
        (select count(*)::int from lesson_events e where e.term_id = t.id) as lessons,
        current_date between t.starts_on and t.ends_on as current
      from terms t where t.academic_year_id = ${YEAR_SQL} order by t.number`);
    const term = terms.find((t) => t.id === termId) ?? terms.find((t) => t.current) ?? terms.find((t) => t.starts_on > new Date().toISOString().slice(0, 10)) ?? terms[0] ?? null;
    // the Monday of the chosen week, kept inside the term
    const wk = (await q<{ d: string }>(`select greatest(least(date_trunc('week', coalesce($1::date, current_date))::date, date_trunc('week', $3::date)::date),
        date_trunc('week', $2::date)::date)::text as d`, [weekOf, term?.starts_on ?? null, term?.ends_on ?? null]))[0]?.d ?? "";
    const lessons = term ? await q<LessonRow>(`select e.id, e.lesson_date::text, to_char(s.starts_at,'HH24:MI') as starts_at, to_char(s.ends_at,'HH24:MI') as ends_at,
        g.code, l.name || ' ' || sj.name as name, coalesce(sj.colour,'#8494c2') as colour, u.name as teacher, e.status::text,
        (select count(*)::int from enrolments x where x.group_id = g.id and x.status = 'active' and not x.is_taster and x.enrolled_at::date <= e.lesson_date) as students,
        (select count(*)::int from attendance_marks m where m.lesson_event_id = e.id) as marked,
        (select count(*)::int from attendance_marks m where m.lesson_event_id = e.id and m.mark in ('present','late')) as present,
        (select count(*)::int from taster_bookings b where b.lesson_event_id = e.id and b.status <> 'cancelled') as tasters
      from lesson_events e join lesson_slots s on s.id = e.slot_id join course_groups g on g.id = e.group_id join levels l on l.id = g.level_id
      join subjects sj on sj.id = g.subject_id left join teachers t on t.id = e.teacher_id left join users u on u.id = t.user_id
      where e.term_id = $1 and e.lesson_date between $2::date and $2::date + 6 order by e.lesson_date, s.starts_at, g.code`, [term.id, wk]) : [];
    const classes = term ? await q<ClassAtt>(`select g.code, l.name || ' ' || sj.name as name,
        count(distinct e.id) filter (where e.status = 'taught')::int as taught,
        count(distinct m.lesson_event_id)::int as registers,
        round(100.0 * count(m.id) filter (where m.mark in ('present','late')) / nullif(count(m.id) filter (where m.mark <> 'approved_absence'), 0))::int as pct,
        count(m.id) filter (where m.mark = 'absent')::int as unexplained
      from course_groups g join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
      join lesson_events e on e.group_id = g.id and e.term_id = $1 left join attendance_marks m on m.lesson_event_id = e.id
      group by g.id, l.sort_order, l.name, sj.name order by l.sort_order, sj.name, g.code`, [term.id]) : [];
    return { terms, term, week: wk, lessons, classes };
  });
}

export async function makeLessonDates(actorId: string, termId: string): Promise<number> {
  return withSchool(async (q) => {
    const n = (await q<{ n: number }>(`select generate_lesson_events($1) as n`, [termId]))[0].n;
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'generate', 'lesson_events', $2, $3)`,
      [actorId, termId, JSON.stringify({ lessons: n })]);
    return n;
  });
}

export type RegisterStudent = { id: string; name: string; mark: string | null; notice: string | null; send?: boolean; send_details?: string | null; adjustments?: string | null; needs?: string[] | null };
export type Register = { id: string; lesson_date: string; starts_at: string; ends_at: string; code: string; name: string; status: string; note: string | null;
  teacher: string | null; teacher_user: string | null; link: string | null; start_at: string; end_at: string; students: RegisterStudent[]; tasters: { id: string; child: string; status: string }[] };

export async function getRegister(eventId: string): Promise<Register | null> {
  return withSchool(async (q) => {
    const ev = (await q<Omit<Register, "students" | "tasters"> & { group_id: string }>(`select e.id, e.group_id, e.lesson_date::text, to_char(s.starts_at,'HH24:MI') as starts_at,
        to_char(s.ends_at,'HH24:MI') as ends_at, g.code, l.name || ' ' || sj.name as name, e.status::text, e.note, u.name as teacher, t.user_id as teacher_user, g.meet_url as link,
        ((e.lesson_date + s.starts_at) at time zone sc.timezone)::text as start_at, ((e.lesson_date + s.ends_at) at time zone sc.timezone)::text as end_at
      from lesson_events e join lesson_slots s on s.id = e.slot_id join course_groups g on g.id = e.group_id join levels l on l.id = g.level_id join schools sc on sc.id = e.school_id
      join subjects sj on sj.id = g.subject_id left join teachers t on t.id = e.teacher_id left join users u on u.id = t.user_id where e.id = $1`, [eventId]))[0];
    if (!ev) return null;
    const students = await q<RegisterStudent>(`select st.id, st.first_name || ' ' || st.last_name as name, m.mark::text as mark,
        (select n.reason from absence_notices n where n.student_id = st.id and n.lesson_event_id = $1 and n.cancelled_at is null) as notice,
        coalesce(sup.has_send = 'yes' and sup.share_with_teachers, false) as send,
        case when sup.has_send = 'yes' and sup.share_with_teachers then sup.details end as send_details,
        case when sup.has_send = 'yes' and sup.share_with_teachers then sup.adjustments end as adjustments,
        case when sup.has_send = 'yes' and sup.share_with_teachers then sup.needs end as needs
      from enrolments x join students st on st.id = x.student_id left join attendance_marks m on m.lesson_event_id = $1 and m.student_id = st.id
      left join student_support sup on sup.student_id = st.id
      where x.group_id = $2 and not x.is_taster and (x.status = 'active' or m.id is not null) and x.enrolled_at::date <= $3::date
      order by st.first_name, st.last_name`, [eventId, ev.group_id, ev.lesson_date]);
    const tasters = await q<{ id: string; child: string; status: string }>(`select b.id, r.child_name as child, b.status::text from taster_bookings b
      join taster_requests r on r.id = b.request_id where b.lesson_event_id = $1 and b.status <> 'cancelled'`, [eventId]);
    return { ...ev, students, tasters };
  });
}

const MARKS = ["present", "late", "absent", "approved_absence"];
export async function saveRegister(actor: { id: string; role: string }, eventId: string, marks: Record<string, string>, tasterMarks: Record<string, string>, taught: boolean, note: string | null): Promise<string | null> {
  return withSchool(async (q) => {
    const ev = (await q<{ teacher_user: string | null; lesson_date: string }>(`select t.user_id as teacher_user, e.lesson_date::text from lesson_events e
      left join teachers t on t.id = e.teacher_id where e.id = $1`, [eventId]))[0];
    if (!ev) return "That lesson wasn’t found.";
    if (actor.role !== "school_admin" && ev.teacher_user !== actor.id) return "Only the lesson’s teacher or an admin can take this register.";
    if (ev.lesson_date > new Date().toISOString().slice(0, 10)) return "Registers can be taken on or after the day of the lesson.";
    for (const [sid, mark] of Object.entries(marks)) {
      if (!MARKS.includes(mark)) continue;
      await q(`insert into attendance_marks (school_id, lesson_event_id, student_id, mark, source) values (current_school(), $1, $2, $3::text::attendance_mark, $4)
        on conflict (lesson_event_id, student_id) do update set mark = excluded.mark, source = excluded.source`,
        [eventId, sid, mark, actor.role === "school_admin" ? "admin" : "teacher"]);
    }
    for (const [bid, st] of Object.entries(tasterMarks)) {
      if (!["booked", "attended", "no_show"].includes(st)) continue;
      await q(`update taster_bookings set status = $2::text::taster_status where id = $1 and lesson_event_id = $3 and status in ('booked','attended','no_show')`, [bid, st, eventId]);
    }
    await q(`update lesson_events set status = $2::text::lesson_status, note = coalesce($3, note) where id = $1`, [eventId, taught ? "taught" : "scheduled", note]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'register', 'lesson_event', $2, $3)`,
      [actor.id, eventId, JSON.stringify({ marks: Object.keys(marks).length, taught })]);
    return null;
  });
}

export async function cancelLesson(actorId: string, eventId: string, note: string): Promise<void> {
  await withSchool(async (q) => {
    await q(`update lesson_events set status = 'cancelled', note = $2 where id = $1 and status = 'scheduled'`, [eventId, note || "Cancelled"]);
    await q(`update taster_bookings set status = 'cancelled' where lesson_event_id = $1 and status = 'booked'`, [eventId]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'cancel', 'lesson_event', $2, $3)`,
      [actorId, eventId, JSON.stringify({ note })]);
  });
}

// ---------- tasters ----------
export type TasterRow = { id: string; status: string; lesson_date: string; starts_at: string; level: string; subject: string; code: string; child_name: string; child_email: string;
  parent_name: string; parent_email: string; message: string | null; request_id: string; lesson_event_id: string;
  teacher: string | null; together: number; followed_up_at: string | null; classroom: string | null; source: string };
export type TasterLesson = { lesson_event_id: string; lesson_date: string; starts_at: string; places_left: number };
export type OpenClass = { id: string; code: string; name: string };

export async function getTasters(groupId: string | null): Promise<{ rows: TasterRow[]; requests: { id: string; name: string; email: string; levels: string[]; message: string | null; created_at: string }[];
  classes: OpenClass[]; lessons: TasterLesson[] }> {
  return withSchool(async (q) => ({
    rows: await q<TasterRow>(`select tl.id, tl.status::text, tl.lesson_date::text, to_char(tl.starts_at,'HH24:MI') as starts_at, tl.level, tl.subject, tl.code, tl.child_name,
        tl.child_email::text, tl.parent_name, tl.parent_email::text, tl.message, tl.request_id, b.lesson_event_id, u.name as teacher, tl.tasters_in_request as together, b.followed_up_at::text, b.classroom_state as classroom, (select source from taster_requests where id = tl.request_id) as source
      from taster_list tl join taster_bookings b on b.id = tl.id join lesson_events ev on ev.id = b.lesson_event_id left join teachers t on t.id = ev.teacher_id left join users u on u.id = t.user_id where tl.lesson_date >= current_date - 120 order by tl.lesson_date desc, tl.starts_at`),
    requests: await q(`select id, name, email::text, levels, message, created_at::text from enquiries where kind = 'taster' and handled_at is null order by created_at desc`),
    classes: await q<OpenClass>(`select g.id, g.code, l.name || ' ' || sj.name as name from course_groups g join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
      where g.status in ('open','priority') and g.academic_year_id = ${YEAR_SQL} and exists (select 1 from lesson_slots s where s.group_id = g.id) order by l.sort_order, sj.name, g.code`),
    lessons: groupId ? await q<TasterLesson>(`select lesson_event_id, lesson_date::text, to_char(starts_at,'HH24:MI') as starts_at, places_left from taster_lessons($1, 42) where places_left > 0`, [groupId]) : [],
  }));
}

export async function bookTaster(actorId: string, d: { parentFirst: string; parentLast: string; parentEmail: string; childName: string; childEmail: string; message: string | null; lessonId: string }): Promise<string | null> {
  try {
    await withSchool(async (q) => {
      const r = (await q<{ id: string }>(`insert into taster_requests (school_id, child_name, child_email, parent_first_name, parent_last_name, parent_email, message, parent_id)
        values (current_school(), $1, $2, $3, $4, $5, $6, (select id from parents where email = $5::citext)) returning id`,
        [d.childName, d.childEmail, d.parentFirst, d.parentLast, d.parentEmail, d.message]))[0];
      await q(`insert into taster_bookings (school_id, request_id, lesson_event_id) values (current_school(), $1, $2)`, [r.id, d.lessonId]);
      await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'book', 'taster', $2, $3)`,
        [actorId, r.id, JSON.stringify({ lesson: d.lessonId })]);
    });
    return null;
  } catch (e) {
    const m = (e as { message?: string }).message ?? "";
    if (/already had a taster/.test(m)) return "This child has already had a taster for this class.";
    if (/no taster places/.test(m)) return "That lesson has no taster places left. Pick another date.";
    if (/upcoming lessons/.test(m)) return "Tasters can only be booked into upcoming lessons of an open class.";
    return "Couldn’t book that taster.";
  }
}

export async function setTasterStatus(actorId: string, id: string, status: string): Promise<void> {
  if (!["booked", "attended", "no_show", "cancelled", "booked_course"].includes(status)) return;
  await withSchool(async (q) => {
    await q(`update taster_bookings set status = $2::text::taster_status, followed_up_at = case when $2 in ('booked_course') then now() else followed_up_at end where id = $1`, [id, status]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'status', 'taster', $2, $3)`, [actorId, id, JSON.stringify({ status })]);
  });
}

/** Lesson dates follow the timetable on their own: every term of this year and next gets a dated lesson for each weekly
 *  lesson time (holidays skipped). Safe to run often: existing dates are kept, and untouched future dates that now fall
 *  in a holiday are removed. Runs whenever attendance, a teacher's day or the Meet sync needs them, and after timetable or term changes. */
export async function ensureLessonDates(): Promise<number> {
  return withSchool(async (q) => {
    let n = 0;
    const terms = await q<{ id: string }>(`select t.id from terms t join academic_years y on y.id = t.academic_year_id where y.ends_on >= current_date order by t.starts_on`);
    for (const t of terms) n += (await q<{ n: number }>(`select generate_lesson_events($1) as n`, [t.id]))[0].n;
    await q(`delete from lesson_events e where e.status = 'scheduled' and e.lesson_date > current_date
      and exists (select 1 from holidays h where h.school_id = e.school_id and e.lesson_date between h.starts_on and h.ends_on)
      and not exists (select 1 from attendance_marks m where m.lesson_event_id = e.id) and not exists (select 1 from taster_bookings b where b.lesson_event_id = e.id and b.status <> 'cancelled')
      and not exists (select 1 from absence_notices a where a.lesson_event_id = e.id)`);
    return n;
  });
}

export async function tasterPlaces(): Promise<number> {
  return withSchool(async (q) => (await q<{ n: number }>(`select taster_places_per_lesson::int as n from schools where id = current_school()`))[0]?.n ?? 2);
}
/** After a taster: email the family inviting them to book (through Brevo), and remember it was sent. */
export async function tasterFollowUp(actorId: string, id: string): Promise<string | null> {
  const { sendHtml } = await import("./email");
  const r = (await withSchool((q) => q<{ child: string; parent_first: string; email: string; subject: string; level: string; school: string }>(`select r.child_name as child, r.parent_first_name as parent_first,
      r.parent_email::text as email, sj.name as subject, l.name as level, sc.name as school from taster_bookings b join taster_requests r on r.id = b.request_id
      join lesson_events ev on ev.id = b.lesson_event_id join course_groups g on g.id = ev.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
      join schools sc on sc.id = b.school_id where b.id = $1`, [id])))[0];
  if (!r) return "That taster wasn’t found.";
  const esc = (x: string) => x.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  const base = (process.env.SITE_URL || "").replace(/\/$/, "");
  const sent = await sendHtml(`How did ${r.child.split(" ")[0]}’s taster go?`, `<p>Dear ${esc(r.parent_first)},</p><p>Thank you for bringing ${esc(r.child.split(" ")[0])} to the ${esc(r.level)} ${esc(r.subject)} taster lesson. We hope they enjoyed it.</p>
    <p>If you’d like ${esc(r.child.split(" ")[0])} to join the class, you can book a place here: <a href="${base}/courses">${base ? `${base}/courses` : "our website"}</a>. Places are limited, so do get in touch if you have any questions.</p><p>Best wishes,<br>${esc(r.school)}</p>`, [r.email], "taster-follow-up");
  if (!sent.ok) return sent.error ?? "Couldn’t send the email.";
  await withSchool(async (q) => {
    await q(`update taster_bookings set followed_up_at = now() where id = $1`, [id]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'follow_up', 'taster', $2, '{}')`, [actorId, id]);
  });
  return null;
}

/** Who has joined a lesson so far (Join check-ins straight away; Google Meet's log as it arrives; Zoom after the lesson):
 *  first arrival, last leave and minutes per student, plus joins not yet matched to anyone. */
export type LessonJoin = { student_id: string; first: string; last: string | null; minutes: number; joins: number; sources: string[] };
export async function lessonJoins(eventId: string): Promise<{ joins: LessonJoin[]; unknown: { name: string; at: string }[]; grace: number }> {
  return withSchool(async (q) => ({
    joins: await q<LessonJoin>(`select ms.student_id, min(ms.joined_at)::text as first, max(ms.left_at)::text as last, count(*)::int as joins, array_agg(distinct ms.source) as sources,
        coalesce(sum(extract(epoch from (coalesce(ms.left_at, least(now(), (e.lesson_date + s.ends_at) at time zone sc.timezone)) - greatest(ms.joined_at, (e.lesson_date + s.starts_at) at time zone sc.timezone - interval '15 minutes'))) / 60), 0)::int as minutes
      from meet_sessions ms join lesson_events e on e.id = ms.lesson_event_id join lesson_slots s on s.id = e.slot_id join schools sc on sc.id = e.school_id
      where ms.lesson_event_id = $1 and ms.student_id is not null and not ms.ignored group by ms.student_id`, [eventId]),
    unknown: await q<{ name: string; at: string }>(`select coalesce(ms.display_name, ms.participant_email::text, 'Someone signed out') as name, min(ms.joined_at)::text as at from meet_sessions ms
      where ms.lesson_event_id = $1 and ms.student_id is null and not ms.ignored and ms.participant_email is distinct from ms.organizer_email
        and not exists (select 1 from users u where lower(u.email::text) = lower(ms.participant_email::text))
      group by 1 order by 2`, [eventId]),
    grace: (await q<{ g: number }>(`select coalesce((select late_grace_minutes from attendance_settings where school_id = current_school()), 5)::int as g`))[0]?.g ?? 5,
  }));
}
