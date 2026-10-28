import "server-only";
import { withSchool } from "./db";

// Admin → Families, as in the prototype: a searchable list with a payment state and next payment per family,
// a family page (the prototype's drawer) with each child's courses and termly payments, cancelling with notice,
// swapping a course, and the parent-to-parent contact log.
const YEAR_SQL = `(select id from academic_years where ends_on >= current_date order by starts_on limit 1)`;

export type FamState = "failed" | "overdue" | "unscheduled" | "check" | "paid" | "none";
export type FamilyListRow = { id: string; name: string; email: string; children: { first: string; level: string }[]; courses: number;
  state: FamState; next_on: string | null; next_due: number; checks: number; last_name: string;
  /** the family's most recent course booking (and their first, to see how long they've been with the school) */
  latest_on: string | null; latest_course: string | null; latest_child: string | null; first_on: string | null };

export async function familyList(): Promise<FamilyListRow[]> {
  return withSchool((q) => q<FamilyListRow>(`
    with i as (select s.parent_id, i.* from instalments i join enrolments e on e.id = i.enrolment_id join students s on s.id = e.student_id
               join terms t on t.id = i.term_id where t.academic_year_id = ${YEAR_SQL}),
         nxt as (select parent_id, min(due_on) as d from i where status = 'scheduled' and due_on >= current_date group by parent_id)
    select p.id, p.first_name || ' ' || p.last_name as name, p.last_name, p.email::text,
      lb.on_ as latest_on, lb.course as latest_course, lb.child as latest_child,
      (select min(e.enrolled_at)::date::text from enrolments e join students s on s.id = e.student_id where s.parent_id = p.id and not e.is_taster) as first_on,
      coalesce((select json_agg(json_build_object('first', s.first_name, 'level',
          coalesce((select string_agg(distinct l.name, ', ') from enrolments e join course_groups g on g.id = e.group_id join levels l on l.id = g.level_id
            where e.student_id = s.id and e.status = 'active' and not e.is_taster), '')) order by s.first_name) from students s where s.parent_id = p.id), '[]') as children,
      (select count(*)::int from enrolments e join students s on s.id = e.student_id where s.parent_id = p.id and e.status = 'active' and not e.is_taster) as courses,
      case when exists (select 1 from i where i.parent_id = p.id and i.status = 'failed') then 'failed'
           when exists (select 1 from i where i.parent_id = p.id and i.status = 'scheduled' and i.due_on < current_date) then 'overdue'
           when exists (select 1 from enrolments e join students s on s.id = e.student_id where s.parent_id = p.id and e.status = 'active' and not e.is_taster
                        and not exists (select 1 from instalments x where x.enrolment_id = e.id)) then 'unscheduled'
           when exists (select 1 from enrolments e join students s on s.id = e.student_id where s.parent_id = p.id and e.needs_check) then 'check'
           when exists (select 1 from i where i.parent_id = p.id) then 'paid' else 'none' end as state,
      nxt.d::text as next_on, coalesce((select sum(amount_pence) from i where i.parent_id = p.id and i.status = 'scheduled' and i.due_on = nxt.d), 0)::int as next_due,
      (select count(*)::int from enrolments e join students s on s.id = e.student_id where s.parent_id = p.id and e.needs_check) as checks
    from parents p left join nxt on nxt.parent_id = p.id
    left join lateral (select e.enrolled_at::date::text as on_, l.name || ' ' || sj.name as course, s.first_name as child
      from enrolments e join students s on s.id = e.student_id join course_groups g on g.id = e.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
      where s.parent_id = p.id and not e.is_taster order by e.enrolled_at desc limit 1) lb on true
    order by p.last_name, p.first_name`));
}

export type Cell = { id: string; status: string; amount: number; refunded: number; due_on: string } | null;
export type Course = { id: string; group_id: string; subject: string; level: string; code: string; colour: string; status: string; needs_check: boolean; note: string | null;
  enrolled_on: string; notice_terms: number | null; notice_given_on: string | null; end_reason: string | null; list: number; discount: number; net: number; cells: Cell[] };
export type Child = { id: string; first: string; last: string; email: string | null; dob: string | null; year_group: number | null; level: string;
  send: string | null; send_details: string | null; adjustments: string | null; share: boolean | null; att: number | null; courses: Course[] };
export type FamilyDetail = {
  id: string; first: string; last: string; email: string; phone: string | null; heard: string | null; address: string | null; marketing: boolean; contact: boolean;
  since: string; note: string | null; guardian: { name: string; email: string; relationship: string; invoices: boolean; reports: boolean; marketing: string } | null;
  invoiceTo: string[]; paid: number; toPay: number; failed: number; terms: { id: string; number: number; name: string }[]; children: Child[];
  agreed: { version: string; at: string } | null;
};

export async function familyDetail(id: string): Promise<FamilyDetail | null> {
  return withSchool(async (q) => {
    const p = (await q<{ id: string; first: string; last: string; email: string; phone: string | null; heard: string | null; address: string | null; marketing: boolean;
      contact: boolean; since: string; note: string | null }>(`select id, first_name as first, last_name as last, email::text, phone, heard_about as heard, address,
        marketing_opt_in as marketing, accepts_contact_requests as contact, created_at::date::text as since, admin_note as note from parents where id = $1`, [id]))[0];
    if (!p) return null;
    const g = (await q<{ name: string; email: string; relationship: string; invoices: boolean; reports: boolean; marketing: string }>(`select first_name || ' ' || last_name as name,
        email::text, relationship, receives_invoices as invoices, receives_reports as reports,
        case when marketing_confirmed_at is not null then 'yes' when marketing_requested then 'awaiting confirmation' else 'no' end as marketing
      from guardians where parent_id = $1`, [id]))[0] ?? null;
    const invoiceTo = (await q<{ s: string }>(`select name || ' (' || email || ')' as s from invoice_recipients($1)`, [id])).map((r) => r.s);
    const terms = await q<{ id: string; number: number; name: string }>(`select id, number, name from terms where academic_year_id = ${YEAR_SQL} order by number`);
    const [tot] = await q<{ paid: number; topay: number; failed: number }>(`select
        coalesce(sum(i.amount_pence - i.refunded_pence) filter (where i.status in ('paid','part_refunded')), 0)::int as paid,
        coalesce(sum(i.amount_pence) filter (where i.status in ('scheduled','processing')), 0)::int as topay,
        coalesce(sum(i.amount_pence) filter (where i.status = 'failed'), 0)::int as failed
      from instalments i join enrolments e on e.id = i.enrolment_id join students s on s.id = e.student_id join terms t on t.id = i.term_id
      where s.parent_id = $1 and t.academic_year_id = ${YEAR_SQL}`, [id]);
    const kids = await q<Omit<Child, "courses">>(`select s.id, s.first_name as first, s.last_name as last, s.email::text, s.date_of_birth::text as dob, s.year_group,
        coalesce((select string_agg(distinct l.name, ', ') from enrolments e join course_groups g on g.id = e.group_id join levels l on l.id = g.level_id
          where e.student_id = s.id and e.status = 'active' and not e.is_taster), '') as level,
        ss.has_send as send, ss.details as send_details, ss.adjustments, ss.share_with_teachers as share,
        (select a.attendance_pct from student_term_attendance a where a.student_id = s.id and a.term_id = (select id from terms where current_date between starts_on and ends_on limit 1)) as att
      from students s left join student_support ss on ss.student_id = s.id where s.parent_id = $1 order by s.first_name`, [id]);
    const courses = await q<Omit<Course, "cells"> & { student_id: string; cells: Record<string, NonNullable<Cell>> }>(`select e.id, e.student_id, g.id as group_id, sj.name as subject, l.name as level, g.code,
        coalesce(sj.colour, '#8494c2') as colour, e.status::text, e.needs_check, e.admin_note as note, e.enrolled_at::date::text as enrolled_on,
        coalesce(e.notice_terms, l.notice_terms) as notice_terms, e.notice_given_on::text, e.end_reason, e.list_price_pence as list, e.discount_pence as discount,
        coalesce((select sum(i.amount_pence) from instalments i where i.enrolment_id = e.id and i.status not in ('cancelled','waived')), 0)::int as net,
        coalesce((select json_object_agg(i.term_id, json_build_object('id', i.id, 'status', i.status, 'amount', i.amount_pence, 'refunded', i.refunded_pence, 'due_on', i.due_on))
          from instalments i where i.enrolment_id = e.id), '{}') as cells
      from enrolments e join students s on s.id = e.student_id join course_groups g on g.id = e.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
      where s.parent_id = $1 and not e.is_taster and g.academic_year_id = ${YEAR_SQL}
      order by e.status <> 'active', l.sort_order, sj.name`, [id]);
    const children: Child[] = kids.map((k) => ({ ...k, courses: courses.filter((c) => c.student_id === k.id).map(({ student_id: _s, cells, ...c }) => ({ ...c, cells: terms.map((t) => cells[t.id] ?? null) })) }));
    const agreed = (await q<{ version: string; at: string }>(`select d.version, a.accepted_at::text as at from terms_acceptances a join terms_documents d on d.id = a.terms_id
      where a.parent_id = $1 order by a.accepted_at limit 1`, [id]))[0] ?? null;
    return { ...p, guardian: g, invoiceTo, paid: tot.paid, toPay: tot.topay, failed: tot.failed, terms, children, agreed };
  });
}

/** What cancelling would do, before the admin confirms: the notice runs for the next N full terms. */
export async function cancelPreview(enrolmentId: string) {
  return withSchool(async (q) => {
    const e = (await q<{ n: number; first_lesson: string | null; joined: boolean; status: string; notice_given_on: string | null }>(`select coalesce(e.notice_terms, l.notice_terms)::int as n,
        (select min(lesson_date)::text from lesson_events ev where ev.group_id = e.group_id) as first_lesson,
        exists (select 1 from classroom_memberships m where m.group_id = e.group_id and m.student_id = e.student_id and m.state = 'joined') as joined, e.status::text, e.notice_given_on::text
      from enrolments e join course_groups g on g.id = e.group_id join levels l on l.id = g.level_id where e.id = $1`, [enrolmentId]))[0];
    if (!e) return null;
    const today = new Date().toISOString().slice(0, 10);
    const cooling = !!e.first_lesson && today <= new Date(Date.parse(e.first_lesson) + 14 * 864e5).toISOString().slice(0, 10) && !e.joined;
    const rows = await q<{ name: string; starts_on: string; status: string; amount: number }>(`select t.name, t.starts_on::text, i.status::text, i.amount_pence as amount
      from instalments i join terms t on t.id = i.term_id where i.enrolment_id = $1 order by t.starts_on`, [enrolmentId]);
    const future = rows.filter((r) => r.starts_on > today);
    const last = future[Math.max(0, e.n - 1)] ?? future[future.length - 1] ?? null;
    return { notice: e.n, cooling, lastTerm: cooling ? null : last?.name ?? null,
      stillDue: cooling ? 0 : rows.filter((r) => r.status === "scheduled" && (!last || r.starts_on <= last.starts_on)).reduce((a, r) => a + r.amount, 0),
      notCharged: cooling ? rows.filter((r) => r.status === "scheduled").reduce((a, r) => a + r.amount, 0) : rows.filter((r) => r.status === "scheduled" && last && r.starts_on > last.starts_on).reduce((a, r) => a + r.amount, 0),
      refund: cooling ? rows.filter((r) => r.status === "paid").reduce((a, r) => a + r.amount, 0) : 0, status: e.status, given: e.notice_given_on };
  });
}

/** Cancel with notice (the database works out the terms), or waive the notice: nothing more is charged. */
export async function cancelCourse(actorId: string, enrolmentId: string, waive: boolean, reason: string | null): Promise<string | null> {
  try {
    return await withSchool(async (q) => {
      await q(`select * from cancel_enrolment($1, current_date, $2)`, [enrolmentId, reason || (waive ? "Cancelled by the office, notice waived" : null)]);
      if (waive) {
        await q(`update instalments set status = 'cancelled' where enrolment_id = $1 and status = 'scheduled'`, [enrolmentId]);
        await q(`update enrolments set status = 'cancelled', ended_at = now(), last_billed_term_id = null where id = $1`, [enrolmentId]);
      }
      await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'cancel', 'enrolment', $2, $3)`,
        [actorId, enrolmentId, JSON.stringify({ waive, reason })]);
      return null;
    });
  } catch (e) { const m = (e as Error).message; return m.includes("already") ? "Notice was already given for this course." : m.includes("only an active") ? "Only an active course can be cancelled." : "Couldn’t cancel the course."; }
}

export async function swapOptions(enrolmentId: string) {
  return withSchool((q) => q<{ id: string; name: string; slots: string | null; places: number | null }>(`select g.id, l.name || ' ' || sj.name || ' (' || g.code || ')' as name,
      (select string_agg(case s.weekday when 1 then 'Mon' when 2 then 'Tue' when 3 then 'Wed' when 4 then 'Thu' when 5 then 'Fri' when 6 then 'Sat' else 'Sun' end || ' ' || to_char(s.starts_at,'HH24:MI'), ', ' order by s.weekday) from lesson_slots s where s.group_id = g.id) as slots,
      (select a.places_left from course_group_availability a where a.group_id = g.id)::int as places
    from enrolments e join course_groups cur on cur.id = e.group_id join course_groups g on g.academic_year_id = cur.academic_year_id and g.level_id = cur.level_id and g.id <> cur.id
    join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
    where e.id = $1 and g.status in ('open','priority') and not group_is_full(g.id)
      and not exists (select 1 from enrolments x where x.student_id = e.student_id and x.group_id = g.id and x.status in ('pending','active'))
    order by sj.name, g.code`, [enrolmentId]).catch(() => q<{ id: string; name: string; slots: string | null; places: number | null }>(`select g.id, l.name || ' ' || sj.name || ' (' || g.code || ')' as name, null as slots, null::int as places
    from enrolments e join course_groups cur on cur.id = e.group_id join course_groups g on g.academic_year_id = cur.academic_year_id and g.level_id = cur.level_id and g.id <> cur.id
    join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id where e.id = $1 and g.status in ('open','priority') order by sj.name, g.code`, [enrolmentId])));
}
export async function swapCourse(actorId: string, enrolmentId: string, toGroup: string, start: "current" | "next"): Promise<string | null> {
  try {
    return await withSchool(async (q) => {
      const r = await q<{ starts_term: string; pay_now_pence: number; refund_now_pence: number }>(`select * from swap_course($1, $2, $3)`, [enrolmentId, toGroup, start]);
      await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'swap', 'enrolment', $2, $3)`,
        [actorId, enrolmentId, JSON.stringify({ to: toGroup, start, ...r[0] })]);
      return null;
    });
  } catch (e) {
    const m = (e as Error).message;
    return m.includes("clash") ? "That class clashes with another of the child’s classes." : m.includes("full") ? "That class is full." : m.includes("last week") ? "In the last week of term a swap starts next term." :
      m.includes("notice") ? "This course already has a cancellation notice." : m.includes("not taking") ? "That class isn’t taking bookings." : "Couldn’t swap the course.";
  }
}

export type ContactReq = { id: string; sent: string; from_name: string; from_child: string; to_name: string; to_child: string; class: string; status: string; revoked_by: string | null };
export async function contactLog(): Promise<{ rows: ContactReq[]; accepting: number; total: number }> {
  return withSchool(async (q) => ({
    rows: await q<ContactReq>(`select r.id, r.created_at::date::text as sent, fp.first_name || ' ' || fp.last_name as from_name, fs.first_name as from_child,
        tp.first_name || ' ' || tp.last_name as to_name, ts.first_name as to_child, l.name || ' ' || sj.name as class, r.status::text, r.revoked_by
      from contact_requests r join parents fp on fp.id = r.from_parent_id join parents tp on tp.id = r.to_parent_id join students fs on fs.id = r.from_student_id
      join students ts on ts.id = r.to_student_id join course_groups g on g.id = r.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
      order by r.created_at desc limit 50`),
    ...(await q<{ accepting: number; total: number }>(`select count(*) filter (where accepts_contact_requests)::int as accepting, count(*)::int as total from parents`))[0],
  }));
}
export async function stopContact(actorId: string, id: string) {
  await withSchool(async (q) => {
    await q(`update contact_requests set status = 'revoked', revoked_by = 'admin', responded_at = coalesce(responded_at, now()) where id = $1 and status in ('pending','accepted')`, [id]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'revoke', 'contact_request', $2, '{}')`, [actorId, id]);
  });
}
