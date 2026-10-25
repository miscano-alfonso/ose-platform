import "server-only";
import { withSchool } from "./db";
import { money } from "./format";

export type Course = {
  code: string; status: string; capacity: number | null; places_left: number | null;
  is_full: boolean; bookable: boolean; shows_times: boolean; shows_waitlist: boolean; label: string | null;
  level: string; level_order: number; subject: string; colour: string; total_pence: number;
  lessons_per_week: number; course_years: number; course_total_pence: number; teacher: string | null;
  year_label: string; year_start: string; is_next: boolean; slots: { d: number; t: string }[] | null;
};
export type Term = { year_label: string; is_next: boolean; year_start: string; number: number; name: string; starts_on: string; ends_on: string; bills_on: string; break_start: string | null; break_end: string | null };
export type Teacher = { name: string; designation: string | null; bio: string | null; subjects: string[] | null };
export type Bundle = { min_courses: number; percent_off: string };

const COURSE_SQL = `
  select g.code, a.status::text, a.capacity, a.places_left, a.is_full, a.bookable, a.shows_times, a.shows_waitlist, a.label,
         l.name as level, l.sort_order as level_order, sj.name as subject, coalesce(sj.colour, '#8494c2') as colour,
         pp.total_pence, pp.lessons_per_week, pp.course_years, u.name as teacher,
         -- the whole course's price: a 2-year course adds up both years' plans (e.g. iGCSE 2-year = £1,792)
         case when pp.course_years > 1 then (select sum(p2.total_pence)::int from price_plans p2
           where p2.academic_year_id = pp.academic_year_id and p2.level_id = pp.level_id and p2.course_years = pp.course_years)
         else pp.total_pence end as course_total_pence,
         y.label as year_label, to_char(y.starts_on, 'YYYY-MM-DD') as year_start, y.starts_on > current_date as is_next,
         (select json_agg(json_build_object('d', s.weekday, 't', to_char(s.starts_at, 'HH24:MI')) order by s.weekday, s.starts_at)
            from lesson_slots s where s.group_id = g.id) as slots
  from course_group_availability a
  join course_groups g on g.id = a.group_id
  join levels l on l.id = g.level_id
  join subjects sj on sj.id = g.subject_id
  join price_plans pp on pp.id = g.price_plan_id
  join academic_years y on y.id = g.academic_year_id
  left join teachers t on t.id = g.teacher_id
  left join users u on u.id = t.user_id
  where a.status not in ('hidden', 'closed') and a.on_sale and g.continues_group_id is null`;

export async function getCourses(): Promise<Course[]> {
  return withSchool((q) => q<Course>(`${COURSE_SQL} order by y.starts_on, l.sort_order, sj.name, g.code`));
}

/** Bookable groups that are nearly full ("Few spaces left" or "Almost full"). */
export async function getFewPlaces(): Promise<Course[]> {
  return withSchool((q) => q<Course>(`${COURSE_SQL} and a.bookable and a.label in ('Few spaces left', 'Almost full')
    order by a.places_left, l.sort_order, sj.name`));
}

export async function getTerms(): Promise<Term[]> {
  return withSchool((q) => q<Term>(`
    select w.label as year_label, w.is_next, to_char(w.starts_on, 'YYYY-MM-DD') as year_start, t.number, t.name,
           to_char(t.starts_on, 'YYYY-MM-DD') as starts_on, to_char(t.ends_on, 'YYYY-MM-DD') as ends_on, to_char(t.bills_on, 'YYYY-MM-DD') as bills_on,
           to_char(h.starts_on, 'YYYY-MM-DD') as break_start, to_char(h.ends_on, 'YYYY-MM-DD') as break_end
    from website_years w
    join terms t on t.academic_year_id = w.id
    left join lateral (select starts_on, ends_on from holidays h where h.starts_on > t.ends_on order by h.starts_on limit 1) h on true
    where w.terms_ready
    order by w.starts_on, t.number`));
}

export async function getTeachers(): Promise<Teacher[]> {
  return withSchool((q) => q<Teacher>(`
    select u.name, t.designation, t.bio,
           (select array_agg(distinct sj.name order by sj.name) from course_groups g join subjects sj on sj.id = g.subject_id
             where g.teacher_id = t.id and g.status not in ('hidden', 'closed')) as subjects
    from teachers t join users u on u.id = t.user_id
    where t.archived_at is null order by u.name`));
}

export async function getBundles(): Promise<{ ks3Pence: number; bundles: Bundle[] }> {
  return withSchool(async (q) => {
    const p = await q<{ total_pence: number }>(`
      select pp.total_pence from price_plans pp join levels l on l.id = pp.level_id join website_years w on w.id = pp.academic_year_id
      where l.name = 'KS3' and not w.is_next order by pp.total_pence limit 1`);
    const b = await q<Bundle>(`
      select bd.min_courses, bd.percent_off::text from bundle_discounts bd join website_years w on w.id = bd.academic_year_id
      where not w.is_next and bd.level_id is null order by bd.min_courses`);
    return { ks3Pence: p[0]?.total_pence ?? 0, bundles: b };
  });
}

export type PriceRow = { level: string; years: number; lessons: string; per: string; total: string };
export type Workshop = { title: string; slug: string; starts_at: string; minutes: number; price_pence: number; enrolled_price_pence: number | null;
  summary: string | null; level: string | null; subject: string | null; teacher: string | null; places_left: number | null };

/** The price table: one row per level and course length, from this year's price plans. */
export async function getPriceRows(): Promise<PriceRow[]> {
  const plans = await withSchool((q) => q<{ level: string; level_order: number; course_years: number; lessons_per_week: number; lessons: number; cost: number; total: number }>(`
    select l.name as level, l.sort_order as level_order, pp.course_years, pp.lessons_per_week,
           sum(pp.lessons)::int as lessons, min(pp.cost_per_lesson_pence)::int as cost, sum(pp.total_pence)::int as total
    from price_plans pp join levels l on l.id = pp.level_id join website_years w on w.id = pp.academic_year_id
    where not w.is_next
    group by l.name, l.sort_order, pp.course_years, pp.lessons_per_week
    order by l.sort_order, pp.course_years, pp.lessons_per_week`));
  const rows: PriceRow[] = [];
  for (const p of plans) {
    // same level, same length, same price per lesson (e.g. Pre-GCSE 1 or 2 lessons a week) share a row: "34 / 68"
    const r = rows.find((x) => x.level === p.level && x.years === p.course_years && x.per === money(p.cost));
    if (r) { r.lessons += ` / ${p.lessons}`; r.total += ` / ${money(p.total)}`; }
    else rows.push({ level: p.level, years: p.course_years, lessons: String(p.lessons), per: money(p.cost), total: money(p.total) });
  }
  return rows;
}

/** Published workshops that haven't happened yet. */
export async function getWorkshops(): Promise<Workshop[]> {
  return withSchool((q) => q<Workshop>(`
    select w.title, w.slug, w.starts_at::text, w.minutes, w.price_pence, w.enrolled_price_pence, w.summary,
           l.name as level, sj.name as subject, u.name as teacher,
           case when w.capacity is null then null else greatest(w.capacity - (select count(*) from workshop_bookings b where b.workshop_id = w.id and b.status <> 'cancelled'), 0)::int end as places_left
    from workshops w left join levels l on l.id = w.level_id left join subjects sj on sj.id = w.subject_id
    left join teachers t on t.id = w.teacher_id left join users u on u.id = t.user_id
    where w.status = 'published' and w.starts_at > now()
    order by w.starts_at`));
}

/** Saves a contact-form message for the office to answer. */
export async function saveEnquiry(e: { name: string; email: string; levels: string[]; heard: string | null; message: string | null }) {
  await withSchool((q) => q(`insert into enquiries (school_id, kind, name, email, levels, heard_about, message)
    values (current_school(), 'contact', $1, $2, $3, $4, $5)`, [e.name, e.email, e.levels, e.heard, e.message]));
}
