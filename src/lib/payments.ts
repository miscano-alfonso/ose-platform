import "server-only";
import { withSchool } from "./db";

// Payment schedules: one instalment per term for each active course place.
// Price per term = the whole course's price (both years of a 2-year course) less the student's bundle discount,
// split evenly over every term of the course — the same way TechSaga charged, so existing families see no change.
// Terms already paid in TechSaga (from the import note "TechSaga terms paid: 110000") are marked paid.
export type ScheduleReport = { places: number; instalments: number; markedPaid: number; skipped: number };

export async function buildSchedules(actorId: string): Promise<ScheduleReport> {
  const rep: ScheduleReport = { places: 0, instalments: 0, markedPaid: 0, skipped: 0 };
  await withSchool(async (q) => {
    const rows = await q<{ id: string; student_id: string; year_id: string; plan_id: string; term_count: number; level_id: string; course_years: number; note: string | null }>(`
      select e.id, e.student_id, g.academic_year_id as year_id, pp.id as plan_id, pp.term_count, pp.level_id, pp.course_years, e.admin_note as note
      from enrolments e join course_groups g on g.id = e.group_id join price_plans pp on pp.id = g.price_plan_id
      where e.status = 'active' and not e.is_taster and not exists (select 1 from instalments i where i.enrolment_id = e.id)`);
    for (const e of rows) {
      // courses this student takes this year decide the bundle discount (3 = 10%, 5 = 15%)
      const count = (await q<{ n: number }>(`select count(*)::int as n from enrolments x join course_groups g on g.id = x.group_id
        where x.student_id = $1 and g.academic_year_id = $2 and x.status in ('pending','active') and not x.is_taster`, [e.student_id, e.year_id]))[0].n;
      const pct = Number((await q<{ p: string | null }>(`select max(percent_off)::text as p from bundle_discounts
        where academic_year_id = $1 and (level_id is null or level_id = $2) and min_courses <= $3::int`, [e.year_id, e.level_id, count]))[0].p ?? 0);
      // the whole course: every year's plan for this level and course length
      const course = (await q<{ total: number; terms: number }>(`select sum(total_pence)::int as total, sum(term_count)::int as terms from price_plans
        where academic_year_id = $1 and level_id = $2 and course_years = $3::int and (course_years > 1 or id = $4::uuid)`, [e.year_id, e.level_id, e.course_years, e.plan_id]))[0];
      const perTerm = Math.round((course.total * (1 - pct / 100)) / course.terms);
      const list = Math.round((course.total * e.term_count) / course.terms);
      const terms = await q<{ id: string; number: number; bills_on: string }>(`select id, number, bills_on::text from terms
        where academic_year_id = $1 and number <= $2::int order by number`, [e.year_id, e.term_count]);
      if (!terms.length) { rep.skipped++; continue; }
      const paid = /TechSaga terms paid: ([01]{6})/.exec(e.note ?? "")?.[1] ?? "";
      for (const t of terms) {
        const isPaid = paid[t.number - 1] === "1";
        await q(`insert into instalments (school_id, enrolment_id, term_id, due_on, amount_pence, status, paid_at)
          values (current_school(), $1, $2, $3::date, $4::int, $5::text::instalment_status, case when $5::text = 'paid' then $3::date::timestamptz end)`,
          [e.id, t.id, t.bills_on, perTerm, isPaid ? "paid" : "scheduled"]);
        rep.instalments++; if (isPaid) rep.markedPaid++;
      }
      await q(`update enrolments set list_price_pence = $2::int, discount_pence = $2::int - $3::int where id = $1`, [e.id, list, perTerm * e.term_count]);
      rep.places++;
    }
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, detail) values (current_school(), $1, 'build', 'payment_schedules', $2)`,
      [actorId, JSON.stringify(rep)]);
  });
  return rep;
}

export type TermTotal = { number: number; name: string; bills_on: string; due: number; paid: number; scheduled: number; failed: number; places: number };
export type FamilyPay = { id: string; name: string; email: string; places: number; unscheduled: number; paid: number; total: number;
  next_on: string | null; next_due: number; overdue: number; techsaga_next: number | null;
  grid: { n: number; amount: number; status: string }[] };

export async function getPayments(): Promise<{ year: string | null; terms: TermTotal[]; families: FamilyPay[]; unscheduled: number }> {
  return withSchool(async (q) => {
    const year = (await q<{ id: string; label: string }>(`select id, label from academic_years where current_date between starts_on and ends_on
      union all (select id, label from academic_years where starts_on > current_date order by starts_on limit 1) limit 1`))[0];
    if (!year) return { year: null, terms: [], families: [], unscheduled: 0 };
    const terms = await q<TermTotal>(`select t.number, t.name, t.bills_on::text,
        coalesce(sum(i.amount_pence) filter (where i.status not in ('cancelled','waived')), 0)::int as due,
        coalesce(sum(i.amount_pence - i.refunded_pence) filter (where i.status in ('paid','part_refunded')), 0)::int as paid,
        coalesce(sum(i.amount_pence) filter (where i.status = 'scheduled'), 0)::int as scheduled,
        coalesce(sum(i.amount_pence) filter (where i.status = 'failed'), 0)::int as failed,
        count(i.id) filter (where i.status not in ('cancelled','waived'))::int as places
      from terms t left join instalments i on i.term_id = t.id where t.academic_year_id = $1 group by t.id order by t.number`, [year.id]);
    const families = await q<FamilyPay>(`
      with x as (select s.parent_id, i.* , e.id as eid from instalments i join enrolments e on e.id = i.enrolment_id join students s on s.id = e.student_id
                 join terms t on t.id = i.term_id where t.academic_year_id = $1),
           nxt as (select parent_id, min(due_on) filter (where status = 'scheduled' and due_on >= current_date) as d from x group by parent_id)
      select p.id, p.first_name || ' ' || p.last_name as name, p.email::text,
        (select count(*)::int from enrolments e join students s on s.id = e.student_id where s.parent_id = p.id and e.status = 'active' and not e.is_taster) as places,
        (select count(*)::int from enrolments e join students s on s.id = e.student_id where s.parent_id = p.id and e.status = 'active' and not e.is_taster
           and not exists (select 1 from instalments i where i.enrolment_id = e.id)) as unscheduled,
        coalesce((select sum(amount_pence - refunded_pence) from x where x.parent_id = p.id and status in ('paid','part_refunded')), 0)::int as paid,
        coalesce((select sum(amount_pence) from x where x.parent_id = p.id and status not in ('cancelled','waived')), 0)::int as total,
        nxt.d::text as next_on,
        coalesce((select sum(amount_pence) from x where x.parent_id = p.id and status = 'scheduled' and due_on = nxt.d), 0)::int as next_due,
        coalesce((select sum(amount_pence) from x where x.parent_id = p.id and status in ('scheduled','failed') and due_on < current_date), 0)::int as overdue,
        coalesce((select json_agg(json_build_object('n', t.number, 'amount', g.amount, 'status', g.status) order by t.number)
          from terms t cross join lateral (select coalesce(sum(x.amount_pence) filter (where x.status not in ('cancelled','waived')), 0)::int as amount,
              case when count(*) = 0 then 'none' when bool_and(x.status in ('paid','part_refunded','cancelled','waived','refunded')) then
                case when bool_and(x.status in ('cancelled','waived')) then 'waived' else 'paid' end
                when bool_or(x.status = 'failed') then 'failed' when bool_or(x.status in ('paid','part_refunded')) then 'part' else 'scheduled' end as status
            from x where x.parent_id = p.id and x.term_id = t.id) g where t.academic_year_id = $1), '[]') as grid,
        (replace(substring(p.admin_note from 'next due £([0-9,]+\.[0-9]{2})'), ',', '')::numeric * 100)::int as techsaga_next
      from parents p left join nxt on nxt.parent_id = p.id
      where exists (select 1 from students s join enrolments e on e.student_id = s.id where s.parent_id = p.id)
      order by p.last_name, p.first_name`, [year.id]);
    return { year: year.label, terms, families, unscheduled: families.reduce((n, f) => n + f.unscheduled, 0) };
  });
}

/** Admin fix-ups for one family's term: mark it paid (e.g. TechSaga took it), waive it, or put it back to be charged. */
export async function setFamilyTerm(actorId: string, parentId: string, termNumber: number, to: "paid" | "waived" | "scheduled") {
  await withSchool(async (q) => {
    const from = to === "scheduled" ? ["paid", "waived", "failed"] : ["scheduled", "failed"];
    const rows = await q<{ id: string }>(`update instalments i set status = $4::text::instalment_status,
        paid_at = case when $4::text = 'paid' then now() else null end
      from enrolments e, students s, terms t, academic_years y
      where e.id = i.enrolment_id and s.id = e.student_id and t.id = i.term_id and y.id = t.academic_year_id
        and s.parent_id = $1 and t.number = $2::int and current_date <= y.ends_on and i.status::text = any($3::text[])
        and i.stripe_payment_intent_id is null
      returning i.id`, [parentId, termNumber, from, to]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'set_term', 'parent', $2, $3)`,
      [actorId, parentId, JSON.stringify({ term: termNumber, to, instalments: rows.length })]);
  });
}
