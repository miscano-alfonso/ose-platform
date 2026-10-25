import "server-only";
import { withSchool } from "./db";
import { slugify } from "./teachers-admin";

export type WorkshopEdit = { id: string; title: string; level_id: string | null; subject_id: string | null; teacher_id: string | null; date: string; time: string;
  minutes: number; capacity: number | null; price_pence: number; enrolled_price_pence: number | null; teacher_pay_pence: number; summary: string | null; status: string; booked: number };

export async function getWorkshopEdit(id: string | null) {
  return withSchool(async (q) => ({
    w: id ? (await q<WorkshopEdit>(`select w.id, w.title, w.level_id, w.subject_id, w.teacher_id,
        to_char(w.starts_at at time zone s.timezone, 'YYYY-MM-DD') as date, to_char(w.starts_at at time zone s.timezone, 'HH24:MI') as time,
        w.minutes, w.capacity, w.price_pence, w.enrolled_price_pence, w.teacher_pay_pence, w.summary, w.status::text,
        (select count(*)::int from workshop_bookings b where b.workshop_id = w.id and b.status <> 'cancelled') as booked
      from workshops w join schools s on s.id = w.school_id where w.id = $1`, [id]))[0] ?? null : null,
    levels: await q<{ id: string; name: string }>(`select id, name from levels order by sort_order`),
    subjects: await q<{ id: string; name: string }>(`select id, name from subjects order by name`),
    teachers: await q<{ id: string; name: string }>(`select t.id, u.name from teachers t join users u on u.id = t.user_id where t.archived_at is null order by u.name`),
  }));
}

export type WorkshopInput = { title: string; levelId: string | null; subjectId: string | null; teacherId: string | null; date: string; time: string; minutes: number;
  capacity: number | null; price: number; enrolledPrice: number | null; teacherPay: number; summary: string | null; publish: boolean };

export async function saveWorkshop(actorId: string, id: string | null, d: WorkshopInput): Promise<{ id?: string; error?: string }> {
  try {
    return await withSchool(async (q) => {
      const tz = (await q<{ timezone: string }>(`select timezone from schools where id = current_school()`))[0].timezone;
      const starts = `${d.date} ${d.time}`;
      if (id) {
        await q(`update workshops set title = $2, level_id = $3::uuid, subject_id = $4::uuid, teacher_id = $5::uuid, starts_at = ($6::timestamp at time zone $7), minutes = $8::int,
            capacity = $9::int, price_pence = $10::int, enrolled_price_pence = $11::int, teacher_pay_pence = $12::int, summary = $13 where id = $1`,
          [id, d.title, d.levelId, d.subjectId, d.teacherId, starts, tz, d.minutes, d.capacity, d.price, d.enrolledPrice, d.teacherPay, d.summary]);
      } else {
        let slug = slugify(`${d.title}-${d.date}`), n = 1;
        while ((await q(`select 1 from workshops where slug = $1`, [slug])).length) slug = `${slugify(`${d.title}-${d.date}`)}-${++n}`;
        id = (await q<{ id: string }>(`insert into workshops (school_id, title, slug, level_id, subject_id, teacher_id, starts_at, minutes, capacity, price_pence, enrolled_price_pence, teacher_pay_pence, summary, status)
          values (current_school(), $1, $2, $3::uuid, $4::uuid, $5::uuid, ($6::timestamp at time zone $7), $8::int, $9::int, $10::int, $11::int, $12::int, $13, $14::text::workshop_status) returning id`,
          [d.title, slug, d.levelId, d.subjectId, d.teacherId, starts, tz, d.minutes, d.capacity, d.price, d.enrolledPrice, d.teacherPay, d.summary, d.publish ? "published" : "draft"]))[0].id;
      }
      await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'save', 'workshop', $2, $3)`, [actorId, id, JSON.stringify(d)]);
      return { id: id! };
    });
  } catch (e) {
    const m = (e as Error).message;
    if (/teach|clash|busy|lesson|overlap|exclusion/i.test(m)) return { error: "The teacher is already teaching at that time. Pick another time or teacher." };
    return { error: "Couldn’t save the workshop." };
  }
}
