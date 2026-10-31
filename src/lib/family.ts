import "server-only";
import { withSchool } from "./db";

// The parent and student dashboards, as in the prototype. Every query is limited to the signed-in family:
// a parent sees only their own children; a student sees only their own classes and classmates' first names.
const YEAR = `(select id from academic_years where ends_on >= current_date order by starts_on limit 1)`;
// this term, or in the holidays the term just finished (so attendance and points still show)
const TERM_NOW = `(select coalesce((select id from terms where starts_on <= current_date and academic_year_id = ${YEAR} order by starts_on desc limit 1), (select id from terms where ends_on >= current_date order by starts_on limit 1)))`;
const SLOTS = `(select string_agg(case s.weekday when 1 then 'Mon' when 2 then 'Tue' when 3 then 'Wed' when 4 then 'Thu' when 5 then 'Fri' when 6 then 'Sat' else 'Sun' end || ' ' || to_char(s.starts_at,'HH24:MI'), ', ' order by s.weekday) from lesson_slots s where s.group_id = g.id)`;
type Q = <T = Record<string, unknown>>(s: string, p?: unknown[]) => Promise<T[]>;
const audit = (q: Q, act: string, ent: string, id: string | null, d: unknown = {}) =>
  q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), null, $1, $2, $3, $4)`, [act, ent, id, JSON.stringify(d)]);

export type Kid = { id: string; first: string; last: string; email: string | null; level: string; att: number | null; chat_access: string; leaderboard_name: string; chat_rules_version: string | null; chat_rules_agreed_at: string | null;
  classes: { group_id: string; subject: string; level: string; colour: string; slots: string | null; teacher: string | null; teacher_id: string | null; invited: boolean; meet: string | null }[] };
export async function kids(parentId: string): Promise<Kid[]> {
  return withSchool((q) => q<Kid>(`select s.id, s.first_name as first, s.last_name as last, s.email::text, s.chat_access, s.leaderboard_name, s.chat_rules_version, s.chat_rules_agreed_at::text,
      coalesce((select string_agg(distinct l.name, ', ') from enrolments e join course_groups g on g.id = e.group_id join levels l on l.id = g.level_id where e.student_id = s.id and e.status = 'active' and not e.is_taster), '') as level,
      (select a.attendance_pct from student_term_attendance a where a.student_id = s.id and a.term_id = ${TERM_NOW}) as att,
      coalesce((select json_agg(json_build_object('group_id', g.id, 'subject', sj.name, 'level', l.name, 'colour', coalesce(sj.colour,'#8494c2'), 'slots', ${SLOTS}, 'teacher', u.name, 'teacher_id', g.teacher_id,
          'invited', exists (select 1 from classroom_memberships m where m.group_id = g.id and m.student_id = s.id and m.state = 'invited'), 'meet', g.meet_url) order by l.sort_order, sj.name)
        from enrolments e join course_groups g on g.id = e.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
        left join teachers t on t.id = g.teacher_id left join users u on u.id = t.user_id where e.student_id = s.id and e.status = 'active' and not e.is_taster), '[]') as classes
    from students s where s.parent_id = $1 order by s.first_name`, [parentId]));
}

export async function parentHome(parentId: string) {
  return withSchool(async (q) => ({
    next: (await q<{ due: string; amount: number }>(`select i.due_on::text as due, sum(i.amount_pence)::int as amount from instalments i join enrolments e on e.id = i.enrolment_id join students s on s.id = e.student_id
      where s.parent_id = $1 and i.status = 'scheduled' and i.due_on >= current_date group by i.due_on order by i.due_on limit 1`, [parentId]))[0] ?? null,
    work: await q<{ student_id: string; due: number; overdue: number }>(`select a.student_id, count(*) filter (where a.parent_status = 'due' and a.due_at <= now() + interval '7 days')::int as due,
      count(*) filter (where a.parent_status = 'overdue')::int as overdue from student_assignments a join students s on s.id = a.student_id where s.parent_id = $1 group by a.student_id`, [parentId]),
    reports: await q<{ id: string; name: string; published: string }>(`select distinct c.id, c.name, c.published_at::date::text as published from report_cycles c join report_entries e on e.cycle_id = c.id
      join students s on s.id = e.student_id where s.parent_id = $1 and c.status = 'published' and e.status = 'approved' order by published desc`, [parentId]),
    upcoming: (await q<{ name: string; publish_on: string }>(`select name, publish_on::text from report_cycles where academic_year_id = ${YEAR} and status <> 'published' order by publish_on limit 1`))[0] ?? null,
    classroomReady: (await q<{ n: number }>(`select count(*)::int as n from classroom_coursework`))[0].n > 0,
  }));
}

// ---------- attendance and absences ----------
export const REASONS = ["Illness", "Medical or dental appointment", "Family event", "Holiday", "Exam or other course", "Other"];
export async function parentAttendance(parentId: string) {
  return withSchool(async (q) => ({
    marks: await q<{ student_id: string; date: string; time: string; class: string; mark: string; late: boolean; early: boolean }>(`select m.student_id, e.lesson_date::text as date, to_char(sl.starts_at,'HH24:MI') as time,
        l.name || ' ' || sj.name as class, m.mark::text, m.mark = 'late' as late, m.left_early as early
      from attendance_marks m join students s on s.id = m.student_id join lesson_events e on e.id = m.lesson_event_id join lesson_slots sl on sl.id = e.slot_id
      join course_groups g on g.id = e.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
      where s.parent_id = $1 and e.term_id = ${TERM_NOW} order by e.lesson_date desc, sl.starts_at desc`, [parentId]),
    upcoming: await q<{ id: string; student_id: string; date: string; time: string; class: string; absent: string | null }>(`select e.id, s.id as student_id, e.lesson_date::text as date, to_char(sl.starts_at,'HH24:MI') as time,
        l.name || ' ' || sj.name as class, (select n.id::text from absence_notices n where n.lesson_event_id = e.id and n.student_id = s.id and n.cancelled_at is null) as absent
      from students s join enrolments x on x.student_id = s.id and x.status = 'active' and not x.is_taster join lesson_events e on e.group_id = x.group_id
      join lesson_slots sl on sl.id = e.slot_id join course_groups g on g.id = e.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
      where s.parent_id = $1 and e.status = 'scheduled' and e.lesson_date >= current_date and e.lesson_date <= current_date + 28 order by e.lesson_date, sl.starts_at`, [parentId]),
    notices: await q<{ id: string; student: string; date: string; time: string; class: string; reason: string; note: string | null; upcoming: boolean }>(`select n.id, s.first_name as student, e.lesson_date::text as date,
        to_char(sl.starts_at,'HH24:MI') as time, l.name || ' ' || sj.name as class, n.reason, n.note, e.lesson_date > current_date as upcoming
      from absence_notices n join students s on s.id = n.student_id join lesson_events e on e.id = n.lesson_event_id join lesson_slots sl on sl.id = e.slot_id
      join course_groups g on g.id = e.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
      where s.parent_id = $1 and n.cancelled_at is null order by e.lesson_date desc limit 50`, [parentId]),
  }));
}
export async function reportAbsences(parentId: string, studentId: string, lessons: string[], reason: string, note: string | null): Promise<string | null> {
  if (!REASONS.includes(reason)) return "Choose a reason.";
  if (!lessons.length) return "Choose the lessons your child will miss.";
  try {
    return await withSchool(async (q) => {
      for (const l of lessons) await q(`insert into absence_notices (school_id, student_id, lesson_event_id, reason, note, reported_by) values (current_school(), $1, $2, $3, $4, $5) on conflict do nothing`, [studentId, l, reason, note, parentId]);
      await audit(q, "report", "absence", studentId, { lessons: lessons.length, reason });
      return null;
    });
  } catch (e) { const m = (e as Error).message; return m.includes("upcoming") ? "Absences can only be reported for upcoming lessons." : m.includes("parent") ? "You can only report absences for your own children." : "Couldn’t save that."; }
}
export async function cancelAbsence(parentId: string, id: string) {
  await withSchool((q) => q(`update absence_notices n set cancelled_at = now() from lesson_events e where n.id = $1 and n.reported_by = $2 and e.id = n.lesson_event_id and e.lesson_date > current_date`, [id, parentId]));
}

// ---------- assignments (from Google Classroom) ----------
export async function assignments(studentIds: string[]) {
  return withSchool((q) => q<{ student_id: string; title: string; due_at: string | null; link: string | null; class: string; colour: string; status: string; points: number | null; max: number | null; late: boolean }>(`
    select a.student_id, a.title, a.due_at::text, a.link, l.name || ' ' || sj.name as class, coalesce(sj.colour,'#8494c2') as colour, a.parent_status as status,
      a.points::float as points, a.max_points::float as max, a.late
    from student_assignments a join course_groups g on g.id = a.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
    where a.student_id = any($1::uuid[]) order by a.due_at nulls last`, [studentIds]));
}

// ---------- 1:1s and workshops ----------
export async function tutoringChoices(parentId: string) {
  return withSchool(async (q) => ({
    options: await q<{ student_id: string; first: string; level_id: string; level: string; subject_id: string; subject: string }>(`select distinct s.id as student_id, s.first_name as first, l.id as level_id, l.name as level, sj.id as subject_id, sj.name as subject
      from students s join enrolments e on e.student_id = s.id and e.status = 'active' join course_groups g on g.id = e.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
      where s.parent_id = $1 order by s.first_name, sj.name`, [parentId]),
    booked: await q<{ id: string; at: string; minutes: number; teacher: string; child: string; subject: string; status: string; focus: string | null }>(`select b.id, b.starts_at::text as at, b.minutes, u.name as teacher, b.student_name as child,
        sj.name as subject, b.status::text, b.focus from tutoring_bookings b join teachers t on t.id = b.teacher_id join users u on u.id = t.user_id join subjects sj on sj.id = b.subject_id
      where b.parent_id = $1 and b.status in ('booked','completed') order by b.starts_at desc limit 20`, [parentId]),
    price: (await q<{ price: number | null }>(`select min(price_pence) as price from tutoring_rates where audience = 'enrolled' and minutes = 45 and valid_from <= current_date`))[0]?.price ?? null,
  }));
}
export async function familyWorkshops(parentId: string) {
  return withSchool(async (q) => ({
    workshops: await q<{ id: string; title: string; slug: string; at: string; minutes: number; level: string | null; subject: string | null; teacher: string | null; summary: string | null; price: number; enrolled_price: number | null; places: number | null; booked: string[] }>(`
      select w.id, w.title, w.slug, w.starts_at::text as at, w.minutes, l.name as level, sj.name as subject, u.name as teacher, w.summary, w.price_pence as price, w.enrolled_price_pence as enrolled_price,
        case when w.capacity is null then null else w.capacity - (select count(*) from workshop_bookings b where b.workshop_id = w.id and b.status in ('booked','attended','pending_payment'))::int end as places,
        coalesce((select array_agg(b.student_name) from workshop_bookings b where b.workshop_id = w.id and b.parent_id = $1 and b.status in ('booked','attended')), '{}') as booked
      from workshops w left join levels l on l.id = w.level_id left join subjects sj on sj.id = w.subject_id left join teachers t on t.id = w.teacher_id left join users u on u.id = t.user_id
      where w.status = 'published' and w.starts_at > now() order by w.starts_at`, [parentId]),
    children: await q<{ id: string; first: string; last: string; email: string | null }>(`select id, first_name as first, last_name as last, email::text from students where parent_id = $1 order by first_name`, [parentId]),
  }));
}
/** Free workshops book straight away; paid ones wait for card payments. */
export async function bookFreeWorkshop(parentId: string, workshopId: string, studentId: string): Promise<string | null> {
  try {
    return await withSchool(async (q) => {
      const w = (await q<{ price: number; enrolled: number | null; full: boolean }>(`select price_pence as price, enrolled_price_pence as enrolled,
          capacity is not null and (select count(*) from workshop_bookings b where b.workshop_id = w.id and b.status in ('booked','attended','pending_payment')) >= capacity as full
        from workshops w where id = $1 and status = 'published' and starts_at > now()`, [workshopId]))[0];
      if (!w) return "That workshop isn’t open for booking.";
      if (w.full) return "That workshop is full.";
      if ((w.enrolled ?? w.price) > 0) return "Paid workshops can be booked once card payments are switched on. Please contact us to book.";
      const s = (await q<{ name: string; email: string | null }>(`select first_name || ' ' || last_name as name, email::text from students where id = $1 and parent_id = $2`, [studentId, parentId]))[0];
      if (!s) return "Choose one of your children.";
      if (!s.email) return "Add your child’s Google account under My details first: the Meet invitation goes there.";
      await q(`insert into workshop_bookings (school_id, workshop_id, parent_id, student_id, student_name, student_email, price_pence, status) values (current_school(), $1, $2, $3, $4, $5, 0, 'booked')`,
        [workshopId, parentId, studentId, s.name, s.email]);
      await audit(q, "book", "workshop", workshopId, { parent: parentId });
      return null;
    });
  } catch (e) { return (e as Error).message.includes("unique") || (e as Error).message.includes("duplicate") ? "Your child is already booked on this workshop." : "Couldn’t book that."; }
}

// ---------- messages ----------
export async function parentThreads(parentId: string) {
  return withSchool((q) => q<{ id: string; subject: string; status: string; teacher: string; student: string; last_at: string; last_sender: string | null; unread: boolean }>(`
    select th.id, th.subject, th.status, u.name as teacher, s.first_name as student, th.last_message_at::text as last_at,
      (select m.sender from messages m where m.thread_id = th.id order by m.created_at desc limit 1) as last_sender,
      exists (select 1 from messages m where m.thread_id = th.id and m.sender <> 'parent' and m.read_by_parent_at is null) as unread
    from message_threads th join teachers t on t.id = th.teacher_id join users u on u.id = t.user_id join students s on s.id = th.student_id
    where th.parent_id = $1 order by th.last_message_at desc`, [parentId]));
}
export async function parentThread(parentId: string, id: string, markRead: boolean) {
  return withSchool(async (q) => {
    const th = (await q<{ id: string; subject: string; status: string; teacher: string; student: string }>(`select th.id, th.subject, th.status, u.name as teacher, s.first_name as student
      from message_threads th join teachers t on t.id = th.teacher_id join users u on u.id = t.user_id join students s on s.id = th.student_id where th.id = $1 and th.parent_id = $2`, [id, parentId]))[0];
    if (!th) return null;
    if (markRead) await q(`update messages set read_by_parent_at = now() where thread_id = $1 and sender <> 'parent' and read_by_parent_at is null`, [id]);
    const msgs = await q<{ id: string; sender: string; who: string; body: string; at: string }>(`select m.id, m.sender, case m.sender when 'parent' then 'You' when 'office' then 'The office' else coalesce(u.name, 'Teacher') end as who,
      m.body, m.created_at::text as at from messages m left join users u on u.id = m.sender_user_id where m.thread_id = $1 order by m.created_at`, [id]);
    return { th, msgs };
  });
}
export async function parentReply(parentId: string, id: string, body: string): Promise<string | null> {
  try {
    return await withSchool(async (q) => {
      const ok = await q(`select 1 from message_threads where id = $1 and parent_id = $2`, [id, parentId]);
      if (!ok.length) return "That conversation wasn’t found.";
      await q(`insert into messages (school_id, thread_id, sender, body, read_by_parent_at) values (current_school(), $1, 'parent', $2, now())`, [id, body]);
      return null;
    });
  } catch (e) { return (e as Error).message.includes("closed") ? "This conversation is closed. Start a new message instead." : "Couldn’t send that."; }
}
export async function parentStartThread(parentId: string, studentId: string, groupId: string, subject: string, body: string): Promise<{ id?: string; error?: string }> {
  try {
    return await withSchool(async (q) => {
      const g = (await q<{ teacher_id: string | null }>(`select g.teacher_id from course_groups g join enrolments e on e.group_id = g.id and e.status = 'active' join students s on s.id = e.student_id
        where g.id = $1 and s.id = $2 and s.parent_id = $3`, [groupId, studentId, parentId]))[0];
      if (!g?.teacher_id) return { error: "Choose one of your child’s classes." };
      const th = (await q<{ id: string }>(`insert into message_threads (school_id, parent_id, teacher_id, student_id, subject, started_by) values (current_school(), $1, $2, $3, $4, 'parent') returning id`,
        [parentId, g.teacher_id, studentId, subject]))[0];
      await q(`insert into messages (school_id, thread_id, sender, body, read_by_parent_at) values (current_school(), $1, 'parent', $2, now())`, [th.id, body]);
      return { id: th.id };
    });
  } catch { return { error: "Couldn’t start the conversation." }; }
}

// ---------- other parents ----------
export async function connect(parentId: string) {
  return withSchool(async (q) => ({
    accepts: (await q<{ a: boolean }>(`select accepts_contact_requests as a from parents where id = $1`, [parentId]))[0]?.a ?? false,
    classmates: await q<{ to_parent: string; to_student: string; from_student: string; group_id: string; first: string; mine: string; class: string; parent_first: string }>(`
      select distinct on (op.id, my.id, g.id) op.id as to_parent, os.id as to_student, my.id as from_student, g.id as group_id, os.first_name as first, my.first_name as mine,
        l.name || ' ' || sj.name as class, op.first_name as parent_first
      from students my join enrolments me on me.student_id = my.id and me.status = 'active' join course_groups g on g.id = me.group_id
      join enrolments oe on oe.group_id = g.id and oe.status = 'active' join students os on os.id = oe.student_id join parents op on op.id = os.parent_id
      join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
      where my.parent_id = $1 and op.id <> $1 and op.accepts_contact_requests
        and not exists (select 1 from contact_requests r where r.status in ('pending','accepted') and least(r.from_parent_id, r.to_parent_id) = least($1::uuid, op.id) and greatest(r.from_parent_id, r.to_parent_id) = greatest($1::uuid, op.id))`, [parentId]),
    incoming: await q<{ id: string; from_first: string; child: string; mine: string; class: string; message: string | null }>(`select r.id, fp.first_name as from_first, fs.first_name as child, ts.first_name as mine,
        l.name || ' ' || sj.name as class, r.message from contact_requests r join parents fp on fp.id = r.from_parent_id join students fs on fs.id = r.from_student_id join students ts on ts.id = r.to_student_id
        join course_groups g on g.id = r.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
      where r.to_parent_id = $1 and r.status = 'pending' and r.expires_at > now()`, [parentId]),
    sent: await q<{ id: string; to_child: string; class: string; status: string }>(`select r.id, ts.first_name as to_child, l.name || ' ' || sj.name as class, r.status::text
      from contact_requests r join students ts on ts.id = r.to_student_id join course_groups g on g.id = r.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
      where r.from_parent_id = $1 and r.status in ('pending','declined','expired') order by r.created_at desc limit 20`, [parentId]),
    shared: await q<{ parent_id: string; name: string; email: string; child_first_name: string; class_name: string }>(`select parent_id, name, email::text, child_first_name, class_name from shared_contacts($1)`, [parentId]),
  }));
}
export async function setAcceptsContact(parentId: string, on: boolean) {
  await withSchool((q) => q(`update parents set accepts_contact_requests = $2 where id = $1`, [parentId, on]));
}
export async function requestContact(parentId: string, d: { to_parent: string; to_student: string; from_student: string; group: string; message: string | null }): Promise<string | null> {
  try {
    await withSchool((q) => q(`insert into contact_requests (school_id, from_parent_id, to_parent_id, group_id, from_student_id, to_student_id, message) values (current_school(), $1, $2, $3, $4, $5, $6)`,
      [parentId, d.to_parent, d.group, d.from_student, d.to_student, d.message]));
    return null;
  } catch (e) { const m = (e as Error).message; return m.includes("90 days") ? "This parent declined recently; you can ask again after 90 days." : m.includes("5 contact") ? "You can send up to 5 requests a day." : "This parent isn’t accepting requests."; }
}
export async function respondContact(parentId: string, id: string, accept: boolean, block: boolean) {
  await withSchool((q) => q(`select respond_contact_request($1, $2, $3, $4)`, [id, parentId, accept, block])).catch(() => null);
}

// ---------- details and privacy ----------
export async function details(parentId: string) {
  return withSchool(async (q) => ({
    p: (await q<{ first: string; last: string; email: string; phone: string | null; address: string | null; marketing: boolean }>(`select first_name as first, last_name as last, email::text, phone, address, marketing_opt_in as marketing from parents where id = $1`, [parentId]))[0],
    g: (await q<{ first: string; last: string; email: string; phone: string | null; relationship: string; invoices: boolean; reports: boolean; marketing: boolean; confirmed: boolean }>(`select first_name as first, last_name as last, email::text, phone, relationship,
        receives_invoices as invoices, receives_reports as reports, marketing_requested as marketing, marketing_confirmed_at is not null as confirmed from guardians where parent_id = $1`, [parentId]))[0] ?? null,
    support: await q<{ student_id: string; has_send: string; details: string | null; adjustments: string | null; share: boolean }>(`select ss.student_id, ss.has_send, ss.details, ss.adjustments, ss.share_with_teachers as share
      from student_support ss join students s on s.id = ss.student_id where s.parent_id = $1`, [parentId]),
  }));
}
export async function saveDetails(parentId: string, d: { phone: string | null; address: string | null }) {
  await withSchool(async (q) => { await q(`update parents set phone = $2, address = $3 where id = $1`, [parentId, d.phone, d.address]); await audit(q, "update", "parent", parentId, { by: "parent" }); });
}
export async function saveGuardian(parentId: string, g: { first: string; last: string; email: string; relationship: string; invoices: boolean; reports: boolean; marketing: boolean } | null): Promise<string | null> {
  try {
    await withSchool(async (q) => {
      if (!g) { await q(`delete from guardians where parent_id = $1`, [parentId]); return; }
      await q(`insert into guardians (school_id, parent_id, first_name, last_name, email, relationship, receives_invoices, receives_reports, marketing_requested) values (current_school(), $1, $2, $3, $4, $5, $6, $7, $8)
        on conflict (parent_id) do update set first_name = excluded.first_name, last_name = excluded.last_name, email = excluded.email, relationship = excluded.relationship,
          receives_invoices = excluded.receives_invoices, receives_reports = excluded.receives_reports, marketing_requested = excluded.marketing_requested,
          marketing_confirmed_at = case when guardians.email = excluded.email and excluded.marketing_requested then guardians.marketing_confirmed_at end`, [parentId, g.first, g.last, g.email, g.relationship, g.invoices, g.reports, g.marketing]);
    });
    return null;
  } catch { return "Check the second parent’s details: each needs a name and a valid email."; }
}
export async function saveChild(parentId: string, studentId: string, d: { email: string | null; chat: string; leaderboard: string; share: boolean | null; agree: boolean }): Promise<string | null> {
  // turning chat on (or keeping it on after the school changed its rules) needs the parent's tick to agree the chat rules
  const { safetyCfg, rulesVersion } = await import("./chat-safety");
  const ver = rulesVersion((await safetyCfg()).rules);
  try {
    await withSchool(async (q) => {
      const own = await q(`select 1 from students where id = $1 and parent_id = $2`, [studentId, parentId]);
      if (!own.length) throw new Error("not yours");
      if (d.email !== null) await q(`update students set email = $2 where id = $1 and email is distinct from $2::citext`, [studentId, d.email || null]);
      if (d.chat !== "none") {
        const cur = (await q<{ v: string | null; a: string }>(`select chat_rules_version as v, chat_access as a from students where id = $1`, [studentId]))[0];
        if (cur?.a === "none" && cur?.v !== ver && !d.agree) throw new Error("rules"); // turning chat on needs the tick; after a rules change it's asked for again but not forced
        if (d.agree && cur?.v !== ver) {
          await q(`update students set chat_rules_agreed_at = now(), chat_rules_version = $2 where id = $1`, [studentId, ver]);
          await q(`insert into consent_events (school_id, parent_id, student_id, purpose, granted, notice_version) values (current_school(), $1, $2, 'chat_rules', true, $3)`, [parentId, studentId, ver]);
        }
      }
      await q(`select set_chat_access($1, $2, $3)`, [studentId, d.chat, parentId]);
      await q(`update students set leaderboard_name = $2 where id = $1`, [studentId, d.leaderboard]);
      if (d.share !== null) await q(`update student_support set share_with_teachers = $2, updated_at = now() where student_id = $1`, [studentId, d.share]);
      await q(`insert into consent_events (school_id, parent_id, student_id, purpose, granted, notice_version) values (current_school(), $1, $2, 'leaderboard_name', $3, '2026-10')`, [parentId, studentId, d.leaderboard !== "hidden"]);
    });
    return null;
  } catch (e) { const m = (e as Error).message; if (m === "rules") return "To turn chat on, please read the chat rules with your child and tick the box to agree."; return m.includes("Gmail") || m.includes("Google") ? "That isn’t a Gmail address. Use your child’s own Google account (or ask us to confirm another Google account)." : m.includes("parent") ? "That’s a parent’s email: each child needs their own Google account." : m.includes("already") || m.includes("unique") ? "Another child already uses that email." : "Couldn’t save that."; }
}
export async function setMarketing(parentId: string, on: boolean) {
  await withSchool(async (q) => {
    await q(`update parents set marketing_opt_in = $2 where id = $1`, [parentId, on]);
    await q(`insert into consent_events (school_id, parent_id, purpose, granted, notice_version) values (current_school(), $1, 'marketing_email', $2, '2026-10')`, [parentId, on]);
  });
}
export async function privacy(parentId: string) {
  return withSchool(async (q) => ({
    consents: await q<{ purpose: string; granted: boolean; at: string; student: string | null }>(`select c.purpose, c.granted, c.recorded_at::date::text as at, s.first_name as student
      from current_consents c left join students s on s.id = c.student_id where c.parent_id = $1 or c.student_id in (select id from students where parent_id = $1) order by c.purpose`, [parentId]),
    requests: await q<{ kind: string; status: string; received: string; due: string }>(`select kind, status, received_at::date::text as received, due_on::text as due from privacy_requests where parent_id = $1 order by received_at desc`, [parentId]),
  }));
}
export async function privacyRequest(parentId: string, email: string, kind: string): Promise<string | null> {
  if (!["access", "erasure", "rectification", "restriction", "objection", "portability"].includes(kind)) return "Choose a request.";
  return withSchool(async (q) => {
    if (kind === "erasure" && (await q(`select 1 from enrolments e join students s on s.id = e.student_id where s.parent_id = $1 and e.status = 'active'`, [parentId])).length)
      return "Your courses need to end first. Cancel them from Payments (the notice period applies), then ask again.";
    if ((await q(`select 1 from privacy_requests where parent_id = $1 and kind = $2 and status = 'open'`, [parentId, kind])).length) return "You’ve already asked; we’ll reply within one month.";
    await q(`insert into privacy_requests (school_id, parent_id, requester_email, kind) values (current_school(), $1, $2, $3)`, [parentId, email, kind]);
    return null;
  });
}

// ---------- reports and payments ----------
export async function familyReports(parentId: string) {
  return withSchool((q) => q<{ cycle_id: string; cycle: string; published: string; student_id: string; child: string; subjects: number }>(`select c.id as cycle_id, c.name as cycle, c.published_at::date::text as published,
      s.id as student_id, s.first_name as child, count(*)::int as subjects
    from report_cycles c join report_entries e on e.cycle_id = c.id and e.status = 'approved' join students s on s.id = e.student_id
    where s.parent_id = $1 and c.status = 'published' group by c.id, s.id order by c.published_at desc, s.first_name`, [parentId]));
}
export async function ownsStudent(parentId: string, studentId: string) {
  return withSchool(async (q) => (await q(`select 1 from students where id = $1 and parent_id = $2`, [studentId, parentId])).length > 0);
}

// ---------- the student's own area ----------
export async function studentHome(studentId: string) {
  return withSchool(async (q) => ({
    me: (await q<{ first: string; chat_access: string }>(`select first_name as first, chat_access from students where id = $1`, [studentId]))[0],
    classes: await q<{ group_id: string; subject: string; level: string; colour: string; teacher: string | null; slots: string | null; meet: string | null; invited: boolean;
      next: string | null; next_id: string | null }>(`select g.id as group_id, sj.name as subject, l.name as level, coalesce(sj.colour,'#8494c2') as colour, u.name as teacher, ${SLOTS} as slots, g.meet_url as meet,
        exists (select 1 from classroom_memberships m where m.group_id = g.id and m.student_id = $1 and m.state = 'invited') as invited,
        (select ((e.lesson_date + s.starts_at) at time zone sc.timezone)::text from lesson_events e join lesson_slots s on s.id = e.slot_id join schools sc on sc.id = e.school_id
          where e.group_id = g.id and e.status = 'scheduled' and (e.lesson_date + s.ends_at) at time zone sc.timezone > now() order by e.lesson_date, s.starts_at limit 1) as next,
        null as next_id
      from enrolments x join course_groups g on g.id = x.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
      left join teachers t on t.id = g.teacher_id left join users u on u.id = t.user_id where x.student_id = $1 and x.status = 'active' and not x.is_taster order by l.sort_order, sj.name`, [studentId]),
    points: (await q<{ points: number; rank: number | null }>(`select coalesce(lb.points, 0)::int as points, lb.rank::int as rank from (select 1) x left join term_leaderboard(${TERM_NOW}) lb on lb.student_id = $1`, [studentId]).catch(() => [{ points: 0, rank: null }]))[0],
  }));
}
export async function studentClass(studentId: string, groupId: string) {
  return withSchool(async (q) => {
    const g = (await q<{ subject: string; level: string; teacher: string | null; meet: string | null; slots: string | null }>(`select sj.name as subject, l.name as level, u.name as teacher, g.meet_url as meet, ${SLOTS} as slots
      from course_groups g join enrolments x on x.group_id = g.id and x.student_id = $1 and x.status = 'active' join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
      left join teachers t on t.id = g.teacher_id left join users u on u.id = t.user_id where g.id = $2`, [studentId, groupId]))[0];
    if (!g) return null;
    return {
      g,
      lessons: await q<{ date: string; time: string; status: string; mark: string | null }>(`select e.lesson_date::text as date, to_char(s.starts_at,'HH24:MI') as time, e.status::text,
          (select m.mark::text from attendance_marks m where m.lesson_event_id = e.id and m.student_id = $1) as mark
        from lesson_events e join lesson_slots s on s.id = e.slot_id where e.group_id = $2 and e.term_id = ${TERM_NOW} and e.status <> 'cancelled' order by e.lesson_date, s.starts_at`, [studentId, groupId]),
      work: await q<{ title: string; due_at: string | null; link: string | null; status: string; points: number | null; max: number | null }>(`select title, due_at::text, link, parent_status as status, points::float, max_points::float as max
        from student_assignments where student_id = $1 and group_id = $2 order by due_at desc nulls last limit 30`, [studentId, groupId]),
      classmates: (await q<{ first: string }>(`select s.first_name as first from enrolments x join students s on s.id = x.student_id where x.group_id = $1 and x.status = 'active' and not x.is_taster and s.id <> $2 order by s.first_name`, [groupId, studentId])).map((r) => r.first),
    };
  });
}
export async function studentChats(studentId: string) {
  return withSchool(async (q) => {
    await q(`insert into student_chats (school_id, kind, group_id) select g.school_id, 'class', g.id from enrolments x join course_groups g on g.id = x.group_id
      where x.student_id = $1 and x.status = 'active' and not exists (select 1 from student_chats c where c.group_id = g.id)`, [studentId]).catch(() => null);
    return {
      access: (await q<{ a: string }>(`select chat_access as a from students where id = $1`, [studentId]))[0]?.a ?? "none",
      chats: await q<{ id: string; kind: string; name: string; last: string | null }>(`select c.id, c.kind, case when c.kind = 'class' then l.name || ' ' || sj.name
          else (select string_agg(s.first_name, ', ') from student_chat_members m join students s on s.id = m.student_id where m.chat_id = c.id and s.id <> $1) end as name,
          (select max(created_at)::text from student_chat_messages x where x.chat_id = c.id) as last
        from student_chats c left join course_groups g on g.id = c.group_id left join levels l on l.id = g.level_id left join subjects sj on sj.id = g.subject_id
        where (c.kind = 'class' and exists (select 1 from enrolments x where x.group_id = c.group_id and x.student_id = $1 and x.status = 'active'))
           or (c.kind = 'direct' and exists (select 1 from student_chat_members m where m.chat_id = c.id and m.student_id = $1))
        order by c.kind, last desc nulls last`, [studentId]),
      mates: await q<{ id: string; first: string; class: string }>(`select distinct on (s.id) s.id, s.first_name || ' ' || left(s.last_name, 1) || '.' as first, l.name || ' ' || sj.name as class
        from enrolments me join enrolments x on x.group_id = me.group_id and x.status = 'active' join students s on s.id = x.student_id join course_groups g on g.id = me.group_id
        join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
        where me.student_id = $1 and me.status = 'active' and s.id <> $1 and s.chat_access = 'class_and_private' order by s.id`, [studentId]),
    };
  });
}
export async function chatFor(studentId: string, chatId: string) {
  return withSchool(async (q) => {
    const ok = await q(`select 1 from student_chats c where c.id = $2 and ((c.kind = 'class' and exists (select 1 from enrolments x where x.group_id = c.group_id and x.student_id = $1 and x.status = 'active'))
      or (c.kind = 'direct' and exists (select 1 from student_chat_members m where m.chat_id = c.id and m.student_id = $1)))`, [studentId, chatId]);
    if (!ok.length) return null;
    return q<{ id: string; who: string; mine: boolean; body: string; hidden: boolean; at: string; reported: boolean }>(`select m.id,
        coalesce(s.first_name, tu.name, case when m.sender_office then 'The office' end) as who, m.sender_student_id = $1 as mine,
        case when m.hidden_at is null then m.body else '' end as body, m.hidden_at is not null as hidden, m.created_at::text as at,
        exists (select 1 from student_chat_reports r where r.message_id = m.id and r.reported_by = $1) as reported
      from student_chat_messages m left join students s on s.id = m.sender_student_id left join teachers t on t.id = m.sender_teacher_id left join users tu on tu.id = t.user_id
      where m.chat_id = $2 order by m.created_at desc limit 100`, [studentId, chatId]).then((r) => r.reverse());
  });
}
export async function studentPost(studentId: string, chatId: string, body: string, th: { parent: string | null; topic: string | null } = { parent: null, topic: null }): Promise<string | null> {
  if (!(await chatFor(studentId, chatId))) return "That chat wasn’t found.";
  const { screenMessage } = await import("./chat-safety");
  const screen = await screenMessage(studentId, chatId, body); // the school's chat rules: blocked, or posted and flagged for staff
  if (screen.blocked) return screen.blocked;
  try {
    const r = await withSchool((q) => q<{ id: string }>(`insert into student_chat_messages (school_id, chat_id, sender_student_id, body, parent_id, topic) values (current_school(), $1, $2, $3, $4, $5) returning id`, [chatId, studentId, body, th.parent, th.topic]));
    await screen.after(r[0].id).catch((e) => console.error("chat flag", e));
    return null;
  }
  catch (e) { const m = (e as Error).message; return m.includes("turned off") ? "Chat is switched off. Ask your parent to turn it on." : m.includes("private") ? "Private chat needs both parents to allow it." : m.includes("not allowed") ? "That message has a word that isn’t allowed." : "Couldn’t send that."; }
}
export async function startDirect(studentId: string, other: string): Promise<{ id?: string; error?: string }> {
  try { const r = await withSchool((q) => q<{ id: string }>(`select start_direct_chat($1, $2) as id`, [studentId, other])); return { id: r[0].id }; }
  catch (e) { return { error: (e as Error).message.includes("both parents") ? "Private chat needs both parents to allow it." : "You can only chat with classmates." }; }
}
export async function reportMessage(studentId: string, messageId: string) {
  await withSchool((q) => q(`insert into student_chat_reports (school_id, message_id, reported_by) values (current_school(), $1, $2) on conflict do nothing`, [messageId, studentId])).catch(() => null);
}
export async function studentRewards(studentId: string) {
  return withSchool(async (q) => ({
    mine: await q<{ points: number; reason: string; class: string; on: string; teacher: string }>(`select rp.points, rp.reason, sj.name as class, rp.awarded_on::text as on, u.name as teacher
      from reward_points rp join course_groups g on g.id = rp.group_id join subjects sj on sj.id = g.subject_id join teachers t on t.id = rp.teacher_id join users u on u.id = t.user_id
      where rp.student_id = $1 order by rp.created_at desc limit 40`, [studentId]),
    board: await q<{ rank: number; name: string; points: number; me: boolean }>(`select lb.rank::int as rank, case when s.leaderboard_name = 'hidden' and s.id <> $1 then 'A student' else s.first_name || ' ' || left(s.last_name, 1) || '.' end as name,
        lb.points::int as points, s.id = $1 as me from term_leaderboard(${TERM_NOW}) lb join students s on s.id = lb.student_id where lb.points > 0 order by lb.rank limit 10`, [studentId]).catch(() => []),
    prizes: await q<{ place: number; description: string }>(`select place, description from reward_prizes order by place`),
    term: (await q<{ name: string; ends_on: string }>(`select name, ends_on::text from terms where id = ${TERM_NOW}`))[0] ?? null,
  }));
}
/** Until card payments are switched on, a 1:1 is requested: the office confirms the time and takes payment. */
export async function requestOne(parentId: string, studentId: string, subjectId: string, teacherId: string, startsAt: string, focus: string | null): Promise<string | null> {
  return withSchool(async (q) => {
    const r = (await q<{ parent: string; email: string; child: string; subject: string; level: string; teacher: string }>(`select p.first_name || ' ' || p.last_name as parent, p.email::text, s.first_name || ' ' || s.last_name as child,
        sj.name as subject, (select string_agg(distinct l.name, ', ') from enrolments e join course_groups g on g.id = e.group_id join levels l on l.id = g.level_id where e.student_id = s.id and e.status = 'active') as level,
        u.name as teacher from parents p join students s on s.parent_id = p.id, subjects sj, teachers t join users u on u.id = t.user_id
      where p.id = $1 and s.id = $2 and sj.id = $3 and t.id = $4`, [parentId, studentId, subjectId, teacherId]))[0];
    if (!r) return "Choose one of the times shown.";
    const when = new Date(startsAt).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
    await q(`insert into enquiries (school_id, kind, name, email, levels, message) values (current_school(), 'contact', $1, $2, $3, $4)`,
      [r.parent, r.email, r.level ? r.level.split(", ") : [], `1:1 request: ${r.child}, ${r.level} ${r.subject}, ${when} with ${r.teacher}.${focus ? ` Help with: ${focus}` : ""}`]);
    return null;
  });
}

/** Parents can cancel a course with the notice they agreed, or swap it, from their Payments page. */
async function ownsEnrolment(q: Q, parentId: string, enrolmentId: string) {
  return (await q(`select 1 from enrolments e join students s on s.id = e.student_id where e.id = $1 and s.parent_id = $2`, [enrolmentId, parentId])).length > 0;
}
export async function parentCancel(parentId: string, enrolmentId: string): Promise<string | null> {
  try {
    return await withSchool(async (q) => {
      if (!(await ownsEnrolment(q, parentId, enrolmentId))) return "That course wasn’t found.";
      await q(`select * from cancel_enrolment($1, current_date, 'Cancelled by the parent')`, [enrolmentId]);
      await audit(q, "cancel", "enrolment", enrolmentId, { by: "parent" });
      return null;
    });
  } catch (e) { return (e as Error).message.includes("already") ? "Notice was already given for this course." : "Couldn’t cancel the course. Please message us."; }
}
export async function parentSwap(parentId: string, enrolmentId: string, toGroup: string, start: "current" | "next"): Promise<string | null> {
  try {
    return await withSchool(async (q) => {
      if (!(await ownsEnrolment(q, parentId, enrolmentId))) return "That course wasn’t found.";
      await q(`select * from swap_course($1, $2, $3)`, [enrolmentId, toGroup, start]);
      await audit(q, "swap", "enrolment", enrolmentId, { by: "parent", to: toGroup, start });
      return null;
    });
  } catch (e) { const m = (e as Error).message; return m.includes("clash") ? "That class clashes with another of your child’s classes." : m.includes("full") ? "That class is full." : m.includes("last week") ? "In the last week of term a swap starts next term." : "Couldn’t swap the course. Please message us."; }
}
