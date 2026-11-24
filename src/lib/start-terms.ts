import "server-only";

// When a new pupil starts a course (24 Nov). Parents choose "This term" or "Next term"; the price is the course year's
// price × the share of the year's lessons in the terms from the start term on (so short terms count properly), plus any
// later years of the course in full. Joining part-way through a term pays for the whole term (Alfonso, 24 Nov). Joining rules (Alfonso, 24 Nov): a 1-year GCSE can only be joined in Term 1;
// a 2-year GCSE only in Terms 1–2 of its first year. KS3 and Pre-GCSE can be joined any term.
type Q = <T = Record<string, unknown>>(s: string, p?: unknown[]) => Promise<T[]>;
export type StartKey = "this" | "next";
export type StartOption = { key: StartKey; term: number; termName: string; from: string | null; lessons: number; yearLessons: number; terms: number; pence: number;
  paidLessons: number; perLessonPence: number; laterLessons: number; laterPence: number };   // pence = paidLessons × perLessonPence + later years

export const gcseLevel = (level: string) => /^i?gcse\b/i.test(level.trim());
export function latestStartTerm(level: string, courseYears: number, yearOfCourse: number): number {
  if (!gcseLevel(level)) return 6;
  if (yearOfCourse > 1) return 0;          // a later year of a GCSE course isn't joined on the website
  return courseYears === 1 ? 1 : 2;
}

/** The start options for each group, priced. `firstYearPence` is the group's price plan for this year, `laterPence` any later years. */
export async function startOptions(q: Q, groups: { id: string; level: string; courseYears: number; yearOfCourse: number; firstYearPence: number; laterPence: number; yearTerms: number; laterTerms: number;
  perLessonPence: number; planLessons: number; laterLessons: number }[]): Promise<Map<string, StartOption[]>> {
  const out = new Map<string, StartOption[]>();
  if (!groups.length) return out;
  const rows = await q<{ group_id: string; number: number; name: string; starts_on: string; ends_on: string; current: boolean; left_here: number; first_here: string | null; year_total: number; left_from: number }>(`
    with g as (select id, academic_year_id from course_groups where id = any($1::uuid[])),
    t as (select g.id as group_id, t.id as term_id, t.number, t.name, t.starts_on, t.ends_on from g join terms t on t.academic_year_id = g.academic_year_id),
    cur as (select group_id, min(number) as number from t where ends_on >= current_date group by group_id),
    ev as (select e.group_id, e.lesson_date, e.term_id from lesson_events e join g on g.id = e.group_id where e.status <> 'cancelled')
    select t.group_id, t.number, t.name, t.starts_on::text, t.ends_on::text, t.number = cur.number as current,
      (select count(*)::int from ev where ev.group_id = t.group_id and ev.term_id = t.term_id and ev.lesson_date > current_date) as left_here,
      (select min(ev.lesson_date)::text from ev where ev.group_id = t.group_id and ev.term_id = t.term_id and ev.lesson_date > current_date) as first_here,
      (select count(*)::int from ev where ev.group_id = t.group_id) as year_total,
      (select count(*)::int from ev join t t2 on t2.term_id = ev.term_id and t2.group_id = ev.group_id where ev.group_id = t.group_id and t2.number >= t.number) as left_from
    from t join cur on cur.group_id = t.group_id where t.number in (cur.number, cur.number + 1) order by t.group_id, t.number`, [groups.map((g) => g.id)]);
  for (const g of groups) {
    const last = latestStartTerm(g.level, g.courseYears, g.yearOfCourse);
    const opts: StartOption[] = [];
    for (const r of rows.filter((x) => x.group_id === g.id)) {
      if (r.number > last) continue;
      if (r.year_total > 0 && r.left_from <= 0) continue;   // no lessons left from then
      // no timetable yet: share by terms instead of lessons
      const share = r.year_total > 0 ? Math.min(1, r.left_from / r.year_total) : Math.max(0, g.yearTerms - r.number + 1) / Math.max(1, g.yearTerms);
      // the same sum as swap_course (db/094): the plan's lessons × the share left, × the price per lesson
      const paid = Math.round(g.planLessons * share);
      opts.push({ key: r.current ? "this" : "next", term: r.number, termName: r.name, from: r.first_here, lessons: r.left_from, yearLessons: r.year_total,
        terms: Math.max(1, g.yearTerms - r.number + 1) + g.laterTerms, pence: paid * g.perLessonPence + g.laterPence,
        paidLessons: paid, perLessonPence: g.perLessonPence, laterLessons: g.laterLessons, laterPence: g.laterPence });
    }
    // "This term" with no lessons left in it (its last week) gives way to "Next term"
    const here = (o: StartOption) => rows.find((x) => x.group_id === g.id && x.number === o.term);
    out.set(g.id, opts.filter((o) => !(o.key === "this" && (here(o)?.year_total ?? 0) > 0 && (here(o)?.left_here ?? 0) === 0)));
  }
  return out;
}
