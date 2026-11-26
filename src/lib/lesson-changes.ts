import "server-only";
import { withSchool } from "./db";
import { sendBatch, type Recipient } from "./email";

// Cancelling and moving single lessons (26 Nov, db/096).
// - The office cancels or moves a lesson from its page (Timetable → the lesson). A moved lesson is cancelled and a replacement
//   is made at the new time, with its own one-off slot, so it shows everywhere a normal lesson does.
// - A teacher asks the office to cancel or move one of their lessons; an admin approves (which makes the change) or declines.
// - New times offered are ones that clash with none of the teacher's lessons, 1:1s or workshops, no lesson in the same level
//   group (KS3, Pre-GCSE, GCSE/iGCSE: level_family()), and no other lesson of the class's students. School days in term only.
// - The class's parents and students can be emailed about the change (test mode holds the emails as usual).

export type FreeTime = { date: string; start: string; end: string };
export type LessonBrief = { id: string; group_id: string; cls: string; code: string; level: string; date: string; start: string; end: string;
  status: string; teacher_id: string | null; teacher_user: string | null; teacher: string | null; teacher_email: string | null; moved_from: string | null };
export type ChangeRequest = { id: string; event_id: string; kind: "cancel" | "move"; new_date: string | null; new_start: string | null; reason: string;
  status: "pending" | "approved" | "declined" | "withdrawn"; decline_note: string | null; created_at: string; decided_at: string | null; new_event_id: string | null;
  requester: string | null; cls: string; code: string; date: string; start: string; teacher: string | null };

const hhmm = (t: string) => t.slice(0, 5);
export const whenText = (date: string, start: string) =>
  `${new Date(date + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })} at ${hhmm(start)}`;

export async function lessonBrief(eventId: string): Promise<LessonBrief | null> {
  if (!/^[0-9a-f-]{36}$/.test(eventId)) return null;
  return (await withSchool((q) => q<LessonBrief>(`select e.id, e.group_id, l.name || ' ' || sj.name as cls, g.code, l.name as level, e.lesson_date::text as date,
      to_char(s.starts_at, 'HH24:MI') as start, to_char(s.ends_at, 'HH24:MI') as end, e.status::text, e.teacher_id, t.user_id as teacher_user, u.name as teacher,
      u.email::text as teacher_email, e.moved_from
    from lesson_events e join lesson_slots s on s.id = e.slot_id join course_groups g on g.id = e.group_id join levels l on l.id = g.level_id
      join subjects sj on sj.id = g.subject_id left join teachers t on t.id = e.teacher_id left join users u on u.id = t.user_id
    where e.id = $1`, [eventId])))[0] ?? null;
}

/** Times the lesson could move to in the next `days` days (school days in term, not in a holiday), soonest first. */
export async function freeTimes(eventId: string, days = 21): Promise<FreeTime[]> {
  if (!/^[0-9a-f-]{36}$/.test(eventId)) return [];
  return withSchool((q) => q<FreeTime>(`
    with ev as (select e.id, e.group_id, e.teacher_id, e.lesson_date, s.starts_at, s.ends_at - s.starts_at as len, s.academic_year_id, level_family(l.name) as fam
        from lesson_events e join lesson_slots s on s.id = e.slot_id join course_groups g on g.id = e.group_id join levels l on l.id = g.level_id where e.id = $1),
      tz as (select timezone from schools where id = current_school()),
      times as (select distinct s.starts_at from lesson_slots s, ev where s.academic_year_id = ev.academic_year_id and s.one_off_on is null),
      days as (select d::date as d from ev, generate_series(current_date + 1, current_date + $2::int, interval '1 day') d
        where extract(isodow from d) between 1 and 5
          and exists (select 1 from terms t where t.academic_year_id = ev.academic_year_id and d::date between t.starts_on and t.ends_on)
          and not exists (select 1 from holidays h where d::date between h.starts_on and h.ends_on)),
      cand as (select days.d, times.starts_at as st, times.starts_at + ev.len as en from days, times, ev)
    select c.d::text as date, to_char(c.st, 'HH24:MI') as start, to_char(c.en, 'HH24:MI') as end
    from cand c, ev, tz
    where not (c.d = ev.lesson_date and c.st = ev.starts_at)
      and (ev.teacher_id is null or not teacher_busy(ev.teacher_id, tstzrange((c.d + c.st) at time zone tz.timezone, (c.d + c.en) at time zone tz.timezone), null))
      and not exists (select 1 from lesson_events o join lesson_slots os on os.id = o.slot_id join course_groups og on og.id = o.group_id join levels ol on ol.id = og.level_id
        where o.lesson_date = c.d and o.status <> 'cancelled' and o.id <> ev.id and level_family(ol.name) = ev.fam and (os.starts_at, os.ends_at) overlaps (c.st, c.en))
      and not exists (select 1 from enrolments me join enrolments oe on oe.student_id = me.student_id and oe.group_id <> me.group_id and oe.status in ('active', 'pending')
          join lesson_events o on o.group_id = oe.group_id and o.lesson_date = c.d and o.status <> 'cancelled' join lesson_slots os on os.id = o.slot_id
        where me.group_id = ev.group_id and me.status in ('active', 'pending') and (os.starts_at, os.ends_at) overlaps (c.st, c.en))
    order by c.d, c.st`, [eventId, days])).catch(() => []);
}

async function stillFree(eventId: string, date: string, start: string): Promise<boolean> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(start)) return false;
  const ahead = Math.ceil((Date.parse(date) - Date.parse(new Date().toISOString().slice(0, 10))) / 864e5);
  if (ahead < 1 || ahead > 120) return false;
  return (await freeTimes(eventId, ahead)).some((t) => t.date === date && t.start === start);
}

/** Parents and/or students of the class (current places, not tasters), one email each. */
async function classFamilies(groupId: string, parents = true, students = true): Promise<Recipient[]> {
  return withSchool((q) => q<Recipient>(`select distinct on (lower(x.email)) x.name, x.email from (
      select p.first_name || ' ' || p.last_name as name, p.email::text as email from enrolments e join students st on st.id = e.student_id join parents p on p.id = st.parent_id
        where $2 and e.group_id = $1 and e.status = 'active' and not e.is_taster
      union all
      select st.first_name || ' ' || st.last_name, st.email::text from enrolments e join students st on st.id = e.student_id
        where $3 and e.group_id = $1 and e.status = 'active' and not e.is_taster and st.email is not null) x
    where x.email is not null and x.email <> '' order by lower(x.email)`, [groupId, parents, students])).catch(() => []);
}

/** 27 Nov: emails the class about a rescheduled or cancelled lesson, in the wording set in Automations
 *  ("Lesson rescheduled: tell the class" / "Lesson cancelled: tell the class"), to parents and/or students as set there. */
export async function emailFamilies(b: LessonBrief, kind: "cancel" | "move", reason: string, to?: { date: string; start: string }): Promise<{ sent: number; held: number; error?: string }> {
  const A = await import("./automations");
  const w = await A.lessonChangeEmail(kind === "move" ? "lesson_moved" : "lesson_cancelled");
  const people = await classFamilies(b.group_id, w.to_parent, w.to_student);
  if (!people.length) return { sent: 0, held: 0 };
  const [g] = await withSchool((q) => q<{ meet: string | null; school: string }>(`select g.meet_url as meet, sc.name as school from course_groups g join schools sc on sc.id = g.school_id where g.id = $1`, [b.group_id]));
  const vars = { class: b.cls, teacher: b.teacher ?? "your teacher", old_when: whenText(b.date, b.start), new_when: to ? whenText(to.date, to.start) : "",
    reason: reason.trim() ? ` Reason: ${reason.trim().replace(/[.\s]+$/, "")}.` : "", meet_link: g?.meet ?? "the class’s usual Google Meet link", school: g?.school ?? "The office" };
  const r = await sendBatch(A.fillEmail(w.subject, vars), A.fillBody(w.body, vars), people, false).catch((e) => ({ sent: 0, failed: people.length, error: String(e), held: 0 }));
  return { sent: r.sent, held: r.held ?? 0, error: r.error };
}
/** Whether "Email the class's parents and students" starts ticked (it does unless the automation is saved as switched off). */
export async function emailClassByDefault(kind: "cancel" | "move"): Promise<boolean> {
  return (await (await import("./automations")).lessonChangeEmail(kind === "move" ? "lesson_moved" : "lesson_cancelled")).on;
}

/** Cancels the lesson (and any tasters booked into it). */
export async function cancelOne(actorId: string, eventId: string, reason: string): Promise<string | null> {
  const b = await lessonBrief(eventId);
  if (!b) return "That lesson wasn't found.";
  if (b.status !== "scheduled") return "That lesson has already been taught or cancelled.";
  await withSchool(async (q) => {
    await q(`update lesson_events set status = 'cancelled', note = $2 where id = $1 and status = 'scheduled'`, [eventId, reason || "Cancelled"]);
    await q(`update taster_bookings set status = 'cancelled' where lesson_event_id = $1 and status = 'booked'`, [eventId]);
    await q(`update lesson_change_requests set status = 'withdrawn', decided_at = now(), decided_by = $2 where event_id = $1 and status = 'pending'`, [eventId, actorId]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'cancel', 'lesson_event', $2, $3)`,
      [actorId, eventId, JSON.stringify({ note: reason })]);
  });
  await import("./automations").then((a) => a.cancelLessonReminders(eventId)).catch(() => null);
  return null;
}

/** Moves the lesson: cancels it and makes the replacement at the new date and time (which must still be free).
 *  Tasters booked into it move with it. Returns the replacement lesson's id. */
export async function moveOne(actorId: string, eventId: string, date: string, start: string, reason: string): Promise<{ id?: string; error?: string }> {
  const b = await lessonBrief(eventId);
  if (!b) return { error: "That lesson wasn't found." };
  if (b.status !== "scheduled") return { error: "That lesson has already been taught or cancelled." };
  if (!(await stillFree(eventId, date, start))) return { error: "That time is no longer free. Please choose another." };
  const id = await withSchool(async (q) => {
    const [slot] = await q<{ id: string }>(`insert into lesson_slots (school_id, academic_year_id, group_id, teacher_id, weekday, starts_at, ends_at, one_off_on)
      select s.school_id, s.academic_year_id, e.group_id, e.teacher_id, extract(isodow from $2::date)::int, $3::time, $3::time + (s.ends_at - s.starts_at), $2::date
      from lesson_events e join lesson_slots s on s.id = e.slot_id where e.id = $1 returning id`, [eventId, date, start]);
    const [ev] = await q<{ id: string }>(`insert into lesson_events (school_id, slot_id, group_id, term_id, lesson_date, teacher_id, status, note, moved_from)
      select e.school_id, $2, e.group_id, t.id, $3::date, e.teacher_id, 'scheduled', $4, e.id
      from lesson_events e join lesson_slots s on s.id = e.slot_id join terms t on t.academic_year_id = s.academic_year_id and $3::date between t.starts_on and t.ends_on
      where e.id = $1 returning id`, [eventId, slot.id, date, `Moved from ${whenText(b.date, b.start)}`]);
    await q(`update lesson_events set status = 'cancelled', note = $2 where id = $1`, [eventId, `Moved to ${whenText(date, start)}${reason ? `: ${reason}` : ""}`]);
    await q(`update taster_bookings set lesson_event_id = $2 where lesson_event_id = $1 and status = 'booked'`, [eventId, ev.id]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'move', 'lesson_event', $2, $3)`,
      [actorId, eventId, JSON.stringify({ to: ev.id, date, start, reason })]);
    return ev.id;
  });
  // take back the old time's reminders, and book the reminder for the new time straight away (if it's within 2 days)
  await import("./automations").then(async (a) => { await a.cancelLessonReminders(eventId); await a.runAutomations(60); }).catch(() => null);
  return { id };
}

// ---------- teachers' requests ----------
const REQ = `select r.id, r.event_id, r.kind, r.new_date::text, to_char(r.new_start, 'HH24:MI') as new_start, r.reason, r.status, r.decline_note, r.created_at::text,
    r.decided_at::text, r.new_event_id, ru.name as requester, l.name || ' ' || sj.name as cls, g.code, e.lesson_date::text as date, to_char(s.starts_at, 'HH24:MI') as start, u.name as teacher
  from lesson_change_requests r join lesson_events e on e.id = r.event_id join lesson_slots s on s.id = e.slot_id join course_groups g on g.id = e.group_id
    join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id left join users ru on ru.id = r.requested_by
    left join teachers t on t.id = e.teacher_id left join users u on u.id = t.user_id`;

export async function requestsFor(eventId: string): Promise<ChangeRequest[]> {
  return withSchool((q) => q<ChangeRequest>(`${REQ} where r.event_id = $1 order by r.created_at desc`, [eventId])).catch(() => []);
}
export async function changeRequests(which: "pending" | "recent"): Promise<ChangeRequest[]> {
  return withSchool((q) => q<ChangeRequest>(which === "pending" ? `${REQ} where r.status = 'pending' order by e.lesson_date, s.starts_at`
    : `${REQ} where r.status <> 'pending' and r.created_at > now() - interval '60 days' order by coalesce(r.decided_at, r.created_at) desc limit 40`)).catch(() => []);
}
export async function pendingRequestCount(): Promise<number> {
  return (await withSchool((q) => q<{ n: number }>(`select count(*)::int as n from lesson_change_requests r join lesson_events e on e.id = r.event_id
    where r.status = 'pending' and e.status = 'scheduled'`)).catch(() => [{ n: 0 }]))[0]?.n ?? 0;
}

export async function requestChange(userId: string, eventId: string, kind: "cancel" | "move", reason: string, date?: string, start?: string): Promise<string | null> {
  const b = await lessonBrief(eventId);
  if (!b || b.status !== "scheduled") return "That lesson can't be changed now.";
  if (!reason) return "Please say why.";
  if (kind === "move" && !(date && start && (await stillFree(eventId, date, start)))) return "Please choose one of the free times.";
  try {
    await withSchool((q) => q(`insert into lesson_change_requests (school_id, event_id, requested_by, kind, new_date, new_start, reason) values (current_school(), $1, $2, $3, $4::date, $5::time, $6)`,
      [eventId, userId, kind, kind === "move" ? date : null, kind === "move" ? start : null, reason.slice(0, 300)]));
  } catch { return "There's already a request waiting for the office for this lesson."; }
  return null;
}
export async function withdrawRequest(userId: string, requestId: string): Promise<void> {
  await withSchool((q) => q(`update lesson_change_requests set status = 'withdrawn', decided_at = now(), decided_by = $2 where id = $1 and status = 'pending'`, [requestId, userId]));
}

async function emailTeacher(b: LessonBrief, subject: string, body: string) {
  if (!b.teacher_email) return;
  await sendBatch(subject, body, [{ name: b.teacher ?? "", email: b.teacher_email }], false).catch(() => null);
}

/** Approve: make the change the teacher asked for (a move only if the time is still free), email the families if asked, and tell the teacher. */
export async function approveRequest(adminId: string, requestId: string, email: boolean): Promise<{ error?: string; note?: string }> {
  const r = (await withSchool((q) => q<{ event_id: string; kind: "cancel" | "move"; new_date: string | null; new_start: string | null; reason: string; status: string }>(
    `select event_id, kind, new_date::text, to_char(new_start, 'HH24:MI') as new_start, reason, status from lesson_change_requests where id = $1`, [requestId])))[0];
  if (!r || r.status !== "pending") return { error: "That request has already been dealt with." };
  const b = await lessonBrief(r.event_id);
  if (!b) return { error: "That lesson wasn't found." };
  let newId: string | null = null;
  if (r.kind === "move") {
    const m = await moveOne(adminId, r.event_id, r.new_date!, r.new_start!, r.reason);
    if (m.error) return { error: m.error };
    newId = m.id ?? null;
  } else {
    const e = await cancelOne(adminId, r.event_id, r.reason);
    if (e) return { error: e };
  }
  await withSchool((q) => q(`update lesson_change_requests set status = 'approved', decided_by = $2, decided_at = now(), new_event_id = $3 where id = $1`, [requestId, adminId, newId]));
  const mail = email ? await emailFamilies(b, r.kind, r.reason, r.kind === "move" ? { date: r.new_date!, start: r.new_start! } : undefined) : null;
  const what = r.kind === "move" ? `moved to ${whenText(r.new_date!, r.new_start!)}` : "cancelled";
  await emailTeacher(b, `${b.cls}: your lesson on ${whenText(b.date, b.start)} is ${what}`,
    `Hello ${b.teacher?.split(" ")[0] ?? ""},\n\nThe office has approved your request: the ${b.cls} lesson on ${whenText(b.date, b.start)} is ${what}.${r.kind === "move" ? " It's in your timetable and calendar now." : ""}${email ? " The families have been emailed." : ""}\n\nThank you,\nThe office`);
  return { note: mailNote(mail) };
}
export async function declineRequest(adminId: string, requestId: string, note: string): Promise<string | null> {
  const r = (await withSchool((q) => q<{ event_id: string; status: string; kind: string }>(`select event_id, status, kind from lesson_change_requests where id = $1`, [requestId])))[0];
  if (!r || r.status !== "pending") return "That request has already been dealt with.";
  await withSchool((q) => q(`update lesson_change_requests set status = 'declined', decided_by = $2, decided_at = now(), decline_note = $3 where id = $1`, [requestId, adminId, note.slice(0, 300) || null]));
  const b = await lessonBrief(r.event_id);
  if (b) await emailTeacher(b, `${b.cls}: your lesson on ${whenText(b.date, b.start)} stays as it is`,
    `Hello ${b.teacher?.split(" ")[0] ?? ""},\n\nThe office couldn't ${r.kind === "move" ? "move" : "cancel"} the ${b.cls} lesson on ${whenText(b.date, b.start)}${note ? `: ${note}` : "."}\n\nPlease message the office if you'd like to talk about it.\n\nThank you,\nThe office`);
  return null;
}

export const mailNote = (m: { sent: number; held: number; error?: string } | null) =>
  !m ? "" : m.error ? ` The email to families didn't send: ${m.error}` : m.held ? ` ${m.held} email${m.held === 1 ? " was" : "s were"} held by test mode${m.sent ? `, ${m.sent} sent` : ""}.` : m.sent ? ` ${m.sent} famil${m.sent === 1 ? "y member was" : "y members were"} emailed.` : " Nobody in the class had an email address to send to.";

/** A teacher's lessons in the next three weeks (My timetable → Coming up), with any request waiting and any moved-in lesson. */
export type UpcomingLesson = { id: string; slot_id: string; date: string; start: string; end: string; cls: string; status: string; moved_from: string | null; note: string | null; pending: "cancel" | "move" | null };
export async function teacherUpcoming(userId: string, days = 21): Promise<UpcomingLesson[]> {
  return withSchool((q) => q<UpcomingLesson>(`select e.id, e.slot_id, e.lesson_date::text as date, to_char(s.starts_at, 'HH24:MI') as start, to_char(s.ends_at, 'HH24:MI') as end,
      l.name || ' ' || sj.name as cls, e.status::text, e.moved_from, e.note,
      (select r.kind from lesson_change_requests r where r.event_id = e.id and r.status = 'pending') as pending
    from lesson_events e join lesson_slots s on s.id = e.slot_id join course_groups g on g.id = e.group_id join levels l on l.id = g.level_id
      join subjects sj on sj.id = g.subject_id join teachers t on t.id = e.teacher_id
    where t.user_id = $1 and e.lesson_date between current_date and current_date + $2::int
    order by e.lesson_date, s.starts_at`, [userId, days])).catch(() => []);
}
