import "server-only";
import { withSchool } from "./db";
import { money } from "./format";
import { withLabelText } from "./course-labels";

export type Course = {
  code: string; status: string; capacity: number | null; places_left: number | null;
  is_full: boolean; bookable: boolean; shows_times: boolean; shows_waitlist: boolean; label: string | null; label_text?: string | null;
  level: string; level_order: number; subject: string; colour: string; total_pence: number;
  lessons_per_week: number; course_years: number; course_total_pence: number; teacher: string | null;
  year_label: string; year_start: string; is_next: boolean; slots: { d: number; t: string }[] | null;
  page_slug: string; teacher_slug: string | null; teacher_photo: string | null;
};
export type Term = { year_label: string; is_next: boolean; year_start: string; number: number; name: string; starts_on: string; ends_on: string; bills_on: string; break_start: string | null; break_end: string | null };
export type Teacher = { name: string; slug: string; designation: string | null; bio: string | null; subjects: string[] | null; qualifications: string[]; photo: string | null };
// a photo uploaded in the admin is served from the database; otherwise the file in public/teachers
const TEACHER_SQL = `select u.name, t.slug, t.designation, t.bio, t.qualifications,
    case when t.photo is not null then '/teacher-photo/' || t.slug || '?v=' || extract(epoch from t.photo_updated_at)::bigint else t.photo_asset end as photo,
    (select array_agg(distinct sj.name order by sj.name) from course_groups g join subjects sj on sj.id = g.subject_id
      where g.teacher_id = t.id and g.status not in ('hidden', 'closed')) as subjects
  from teachers t join users u on u.id = t.user_id`;
export type Bundle = { min_courses: number; percent_off: string };

const COURSE_SQL = `
  select g.code, a.status::text, a.capacity, a.places_left, a.is_full, a.bookable, a.shows_times, a.shows_waitlist, a.label,
         l.name as level, l.sort_order as level_order, sj.name as subject, coalesce(sj.colour, '#8494c2') as colour,
         pp.total_pence, pp.lessons_per_week, pp.course_years, u.name as teacher, t.slug as teacher_slug,
         case when t.photo is not null then '/teacher-photo/' || t.slug else t.photo_asset end as teacher_photo,
         lower(regexp_replace(l.name, '[^A-Za-z0-9]+', '-', 'g')) || '/' || lower(regexp_replace(sj.name, '[^A-Za-z0-9]+', '-', 'g')) as page_slug,
         -- the whole course's price: a 2-year course adds up both years' plans (e.g. iGCSE 2-year = £1,792)
         (select total_pence from course_price(pp.id)) as course_total_pence,
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
  return withLabelText(await withSchool((q) => q<Course>(`${COURSE_SQL} order by y.starts_on, l.sort_order, sj.name, g.code`)));
}

/** Homepage "Space Available": classes set to show by hand, plus open classes with places left (unless hidden by hand). */
export type SpaceCourse = { code: string; level: string; subject: string; colour: string; year_label: string; homepage_order: number | null };
export async function getSpaceAvailable(): Promise<SpaceCourse[]> {
  return withSchool((q) => q<SpaceCourse>(`
    select distinct on (l.sort_order, sj.name) g.code, l.name as level, sj.name as subject, coalesce(sj.colour, '#8494c2') as colour, y.label as year_label,
           g.homepage_order, l.sort_order as lo
    from course_group_availability a join course_groups g on g.id = a.group_id join levels l on l.id = g.level_id
    join subjects sj on sj.id = g.subject_id join academic_years y on y.id = g.academic_year_id
    where g.continues_group_id is null and a.on_sale and a.status not in ('hidden', 'closed')
      and (g.homepage = 'show' or (g.homepage = 'auto' and a.bookable))
    order by l.sort_order, sj.name, (g.homepage = 'show') desc, y.starts_on`))
    .then((rows) => rows.sort((a, b) => (a.homepage_order ?? 999) - (b.homepage_order ?? 999)));
}

/** Bookable groups that are nearly full ("Few spaces left" or "Almost full"). */
export async function getFewPlaces(): Promise<Course[]> {
  return withLabelText(await withSchool((q) => q<Course>(`${COURSE_SQL} and a.bookable and a.label in ('Few spaces left', 'Almost full')
    order by a.places_left, l.sort_order, sj.name`)));
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
  return withSchool((q) => q<Teacher>(`${TEACHER_SQL} where t.archived_at is null order by t.sort_order, u.name`));
}

export async function getTeacher(slug: string): Promise<Teacher | null> {
  return withSchool(async (q) => (await q<Teacher>(`${TEACHER_SQL} where t.archived_at is null and t.slug = $1`, [slug]))[0] ?? null);
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
    select distinct on (l.sort_order, pp.course_years, pp.lessons_per_week) l.name as level, l.sort_order as level_order, pp.course_years, pp.lessons_per_week,
           c.lessons, pp.cost_per_lesson_pence as cost, c.total_pence as total
    from price_plans pp join levels l on l.id = pp.level_id join website_years w on w.id = pp.academic_year_id
    cross join lateral course_price(pp.id) c
    where not w.is_next and pp.year_of_course = 1
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

/** Price calculator: every subject and level on sale, priced from the price plans (2-year courses as the whole course). */
export type CalcOption = { level: string; label: string; total_pence: number; terms: number; fee_pence: number };
export type CalcSubject = { subject: string; options: CalcOption[] };
export type CalcYear = { label: string; start: string; subjects: CalcSubject[]; bundles: { min_courses: number; percent_off: number }[] };
export async function getCalculator(): Promise<CalcYear[]> {
  return withSchool(async (q) => {
    const years = await q<{ id: string; label: string; start: string }>(`select id, label, to_char(starts_on, 'YYYY-MM-DD') as start from website_years order by starts_on`);
    const out: CalcYear[] = [];
    for (const y of years) {
      const rows = await q<{ subject: string; level: string; years: number; total_pence: number; terms: number; fee_pence: number }>(`
        select distinct on (sj.name, l.sort_order) sj.name as subject, l.name as level, pp.course_years as years,
          (select total_pence from course_price(pp.id)) as total_pence,
          (select terms from course_price(pp.id)) as terms,
          pp.registration_fee_pence as fee_pence
        from course_groups g join subjects sj on sj.id = g.subject_id join levels l on l.id = g.level_id join price_plans pp on pp.id = g.price_plan_id
        where g.academic_year_id = $1 and g.status not in ('hidden', 'closed') and g.continues_group_id is null
        order by sj.name, l.sort_order, pp.total_pence`, [y.id]);
      const subjects = new Map<string, CalcOption[]>();
      for (const r of rows) {
        const label = /gcse/i.test(r.level) && !/^pre/i.test(r.level) || /a-level/i.test(r.level) ? `${r.level} (${r.years} year${r.years > 1 ? "s" : ""})` : r.level;
        (subjects.get(r.subject) ?? subjects.set(r.subject, []).get(r.subject)!).push({ level: r.level, label, total_pence: r.total_pence, terms: r.terms, fee_pence: r.fee_pence });
      }
      const order = ["English Language", "English Literature", "Maths", "Science", "Geography", "History", "Business Studies", "Biology", "Chemistry", "Physics"];
      const list = [...subjects.entries()].map(([subject, options]) => ({ subject, options }))
        .sort((a, b) => (order.indexOf(a.subject) + 1 || 99) - (order.indexOf(b.subject) + 1 || 99) || a.subject.localeCompare(b.subject));
      const bundles = (await q<{ min_courses: number; percent_off: string }>(`select min_courses, percent_off::text from bundle_discounts where academic_year_id = $1 and level_id is null order by min_courses`, [y.id]))
        .map((b) => ({ min_courses: b.min_courses, percent_off: Number(b.percent_off) }));
      if (list.length) out.push({ label: y.label, start: y.start, subjects: list, bundles });
    }
    return out;
  });
}

/** A course's detail page: content from course_pages plus every class of it on sale (times, teacher, price). */
export type CoursePage = { level: string; subject: string; colour: string; topics: { title: string; text: string }[]; exam_board: string | null; intro: string | null; video: string | null; video_title: string | null; groups: Course[] };
export async function getCoursePage(slug: string): Promise<CoursePage | null> {
  return withSchool(async (q) => {
    const groups = await withLabelText(await q<Course>(`select * from (${COURSE_SQL}) c where c.page_slug = $1 order by c.year_start, c.code`, [slug]));
    const page = (await q<{ level: string; subject: string; colour: string; topics: { title: string; text: string }[]; exam_board: string | null; intro: string | null; video: string | null; video_title: string | null }>(`
      select l.name as level, sj.name as subject, coalesce(sj.colour, '#8494c2') as colour, cp.topics, cp.exam_board, cp.intro, cp.sample_video_url as video, cp.sample_title as video_title
      from course_pages cp join levels l on l.id = cp.level_id join subjects sj on sj.id = cp.subject_id where cp.slug = $1 and cp.published`, [slug]))[0];
    if (!page && !groups.length) return null;
    return { level: page?.level ?? groups[0].level, subject: page?.subject ?? groups[0].subject, colour: page?.colour ?? groups[0].colour,
      topics: page?.topics ?? [], exam_board: page?.exam_board ?? null, intro: page?.intro ?? null, video: page?.video ?? null, video_title: page?.video_title ?? null, groups };
  });
}

/** The home page's "live now" and "next" tiles: today's lessons (London time), the one on now and the next to start. */
export type NowLesson = { level: string; subject: string; teacher: string | null; starts: string; ends: string; date: string; page_slug: string | null };
export async function getNowNext(): Promise<{ live: NowLesson | null; next: NowLesson | null }> {
  try {
    return await withSchool(async (q) => {
      const rows = await q<NowLesson & { state: string }>(`with n as (select (now() at time zone 'Europe/London') as t)
        select l.name as level, sj.name as subject, split_part(u.name, ' ', 1) as teacher, to_char(sl.starts_at,'HH24:MI') as starts, to_char(sl.ends_at,'HH24:MI') as ends,
          ev.lesson_date::text as date, (select cp.slug from course_pages cp where cp.level_id = g.level_id and cp.subject_id = g.subject_id limit 1) as page_slug,
          case when ev.lesson_date = (select t::date from n) and sl.starts_at <= (select t::time from n) and sl.ends_at > (select t::time from n) then 'live' else 'next' end as state
        from lesson_events ev join lesson_slots sl on sl.id = ev.slot_id join course_groups g on g.id = ev.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
        left join teachers t on t.id = coalesce(ev.teacher_id, sl.teacher_id) left join users u on u.id = t.user_id
        where ev.status = 'scheduled' and g.status <> 'hidden'
          and (ev.lesson_date > (select t::date from n) or (ev.lesson_date = (select t::date from n) and sl.ends_at > (select t::time from n)))
        order by ev.lesson_date, sl.starts_at limit 6`);
      return { live: rows.find((r) => r.state === "live") ?? null, next: rows.find((r) => r.state === "next") ?? null };
    });
  } catch { return { live: null, next: null }; }
}
