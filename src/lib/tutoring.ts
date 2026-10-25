import "server-only";
import { withSchool } from "./db";

// 1:1 tutoring: a rate card per level (enrolled families pay less), each teacher's weekly availability, and bookings.
export type Rate = { level_id: string; level: string; audience: string; price: number | null; pay: number | null };
export type Avail = { id: string; teacher_id: string; teacher: string; weekday: number; starts_at: string; ends_at: string };
export type Booking = { id: string; starts_at: string; minutes: number; teacher: string; level: string; subject: string; parent: string; parent_email: string;
  student: string; student_email: string | null; focus: string | null; price: number; status: string; audience: string };

export async function getTutoring() {
  return withSchool(async (q) => ({
    rates: await q<Rate>(`select l.id as level_id, l.name as level, a.audience, r.price_pence as price, r.teacher_pay_pence as pay
      from levels l cross join (values ('public'), ('enrolled')) a(audience)
      left join lateral (select price_pence, teacher_pay_pence from tutoring_rates r where r.level_id = l.id and r.audience::text = a.audience and r.minutes = 45 and r.valid_from <= current_date
        order by valid_from desc limit 1) r on true order by l.sort_order, a.audience desc`),
    availability: await q<Avail>(`select a.id, a.teacher_id, u.name as teacher, a.weekday, to_char(a.starts_at,'HH24:MI') as starts_at, to_char(a.ends_at,'HH24:MI') as ends_at
      from tutoring_availability a join teachers t on t.id = a.teacher_id join users u on u.id = t.user_id
      where a.valid_to is null or a.valid_to >= current_date order by u.name, a.weekday, a.starts_at`),
    bookings: await q<Booking>(`select b.id, b.starts_at::text, b.minutes, u.name as teacher, l.name as level, sj.name as subject,
        p.first_name || ' ' || p.last_name as parent, p.email::text as parent_email, b.student_name as student, b.student_email::text, b.focus, b.price_pence as price, b.status::text, b.audience::text
      from tutoring_bookings b join teachers t on t.id = b.teacher_id join users u on u.id = t.user_id join levels l on l.id = b.level_id join subjects sj on sj.id = b.subject_id
      join parents p on p.id = b.parent_id where b.starts_at > now() - interval '60 days' and b.status <> 'pending_payment' order by b.starts_at`),
    teachers: await q<{ id: string; name: string }>(`select t.id, u.name from teachers t join users u on u.id = t.user_id where t.archived_at is null order by u.name`),
    levels: await q<{ id: string; name: string }>(`select id, name from levels order by sort_order`),
    subjects: await q<{ id: string; name: string }>(`select distinct sj.id, sj.name from subjects sj join teacher_subjects ts on ts.subject_id = sj.id order by sj.name`),
    parents: await q<{ id: string; name: string; email: string }>(`select id, first_name || ' ' || last_name as name, email::text from parents order by last_name, first_name`),
  }));
}

export async function openTimes(levelId: string, subjectId: string) {
  return withSchool((q) => q<{ teacher_id: string; teacher: string; starts_at: string }>(`select o.teacher_id, u.name as teacher, o.starts_at::text
    from tutoring_open_times($1, $2, current_date, 28) o join teachers t on t.id = o.teacher_id join users u on u.id = t.user_id order by o.starts_at limit 120`, [levelId, subjectId]));
}

const audit = (q: (s: string, p?: unknown[]) => Promise<unknown>, a: string, act: string, ent: string, id: string | null, d: unknown) =>
  q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, $2, $3, $4, $5)`, [a, act, ent, id, JSON.stringify(d)]);

export async function setTutorRate(actorId: string, levelId: string, audience: string, price: number, pay: number) {
  await withSchool(async (q) => {
    await q(`insert into tutoring_rates (school_id, level_id, audience, minutes, price_pence, teacher_pay_pence, valid_from) values (current_school(), $1, $2::text::tutoring_audience, 45, $3::int, $4::int, current_date)
      on conflict (school_id, level_id, audience, minutes, valid_from) do update set price_pence = excluded.price_pence, teacher_pay_pence = excluded.teacher_pay_pence`, [levelId, audience, price, pay]);
    await audit(q, actorId, "rate", "tutoring_rates", levelId, { audience, price, pay });
  });
}

export async function addAvailability(actorId: string, teacherId: string, weekday: number, start: string, end: string) {
  await withSchool(async (q) => {
    await q(`insert into tutoring_availability (school_id, teacher_id, weekday, starts_at, ends_at) values (current_school(), $1, $2::int, $3::time, $4::time)`, [teacherId, weekday, start, end]);
    await audit(q, actorId, "add", "tutoring_availability", teacherId, { weekday, start, end });
  });
}
export async function removeAvailability(actorId: string, id: string) {
  await withSchool(async (q) => {
    await q(`update tutoring_availability set valid_to = current_date - 1 where id = $1`, [id]);
    await audit(q, actorId, "remove", "tutoring_availability", id, {});
  });
}

export async function bookTutoring(actorId: string, d: { parentId: string; levelId: string; subjectId: string; teacherId: string; startsAt: string; student: string; studentEmail: string | null; focus: string | null }): Promise<string | null> {
  try {
    await withSchool(async (q) => {
      const r = await q<{ id: string }>(`insert into tutoring_bookings (school_id, teacher_id, level_id, subject_id, parent_id, student_name, student_email, focus, starts_at, minutes, status, price_pence, teacher_pay_pence, audience)
        values (current_school(), $1, $2, $3, $4, $5, $6::citext, $7, $8::timestamptz, 45, 'booked', 0, 0, 'public') returning id`,
        [d.teacherId, d.levelId, d.subjectId, d.parentId, d.student, d.studentEmail, d.focus, d.startsAt]);
      await audit(q, actorId, "book", "tutoring_booking", r[0].id, { startsAt: d.startsAt });
    });
    return null;
  } catch (e) {
    const m = (e as Error).message;
    if (/not available|teaching then|conflicting key|exclusion/.test(m)) return "That time has just been taken or the teacher isn’t free. Pick another time.";
    if (/no 1:1 rate/.test(m)) return "Set a 1:1 price for that level first.";
    return "Couldn’t book that 1:1.";
  }
}

export async function setTutoringStatus(actorId: string, id: string, status: string) {
  if (!["booked", "completed", "cancelled", "no_show"].includes(status)) return;
  await withSchool(async (q) => {
    await q(`update tutoring_bookings set status = $2::text::tutoring_status where id = $1`, [id, status]);
    await audit(q, actorId, "status", "tutoring_booking", id, { status });
  });
}
