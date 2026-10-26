import "server-only";
import { withSchool } from "./db";

// Admin → Marketing overview, as in the prototype: from enquiry to booking, audiences, and how families found the school.
const YEAR = `(select starts_on from academic_years where ends_on >= current_date order by starts_on limit 1)`;

export type Stage = { k: string; n: number };
export async function marketingOverview() {
  return withSchool(async (q) => {
    // everyone who got in touch this school year (contact form, taster form or taster booking), once per email
    const [f] = await q<{ enquiries: number; booked: number; attended: number; courses: number; waiting: number; two: number; families: number; start: string }>(`
      with c as (
        select lower(email::text) as email, min(created_at) as at from (
          select email, created_at from enquiries where created_at >= ${YEAR}
          union all select parent_email, created_at from taster_requests where created_at >= ${YEAR}) x group by 1),
      tb as (select lower(r.parent_email::text) as email, bool_or(b.status = 'attended') as came from taster_bookings b join taster_requests r on r.id = b.request_id
        where b.status <> 'cancelled' and r.created_at >= ${YEAR} group by 1),
      bk as (select distinct lower(p.email::text) as email from parents p join students s on s.parent_id = p.id join enrolments e on e.student_id = s.id
        join c on c.email = lower(p.email::text) where not e.is_taster and e.status in ('active','completed') and e.enrolled_at >= c.at)
      select (select count(*)::int from c) as enquiries, (select count(*)::int from tb) as booked, (select count(*)::int from tb where came) as attended,
        (select count(*)::int from bk) as courses,
        (select count(distinct lower(email::text))::int from waitlist_entries where enrolled_at is null) as waiting,
        (select count(*)::int from (select e.student_id from enrolments e join course_groups g on g.id = e.group_id join academic_years y on y.id = g.academic_year_id
           where e.status = 'active' and not e.is_taster and y.ends_on >= current_date group by e.student_id having count(*) = 2) t) as two,
        (select count(distinct s.parent_id)::int from enrolments e join students s on s.id = e.student_id join course_groups g on g.id = e.group_id join academic_years y on y.id = g.academic_year_id
           where e.status = 'active' and not e.is_taster and y.ends_on >= current_date) as families,
        ${YEAR}::text as start`);
    const heard = await q<{ k: string; n: number }>(`select coalesce(nullif(trim(heard_about), ''), 'Not asked') as k, count(*)::int as n from (
        select heard_about from parents where coalesce(email::text, '') not like 'erased-%'
        union all select q.heard_about from enquiries q where q.created_at >= ${YEAR} and not exists (select 1 from parents p where p.email = q.email)) x
      group by 1 order by coalesce(nullif(trim(heard_about), ''), 'Not asked') = 'Not asked', 2 desc limit 12`);
    const stages: Stage[] = [{ k: "Enquiries", n: f.enquiries }, { k: "Taster booked", n: f.booked }, { k: "Taster attended", n: f.attended }, { k: "Booked a course", n: f.courses }];
    return { ...f, stages, heard };
  });
}
