import "server-only";
import { withSchool } from "./db";

// Admin → Prices & rules: the per-year course rules that every price on the site is worked out from.
export type LevelRule = { level_id: string; level: string; cost: number | null; fee: number | null; terms_per_year: number; final_year_terms: number; set: boolean };
export type SubjectRule = { level_id: string; level: string; subject_id: string; subject: string; lpw: number; years: number };
export type PreviewRow = { level: string; subject: string; yoc: number; years: number; lpw: number; terms: number; weeks: number; lessons: number; cost: number; total: number; now: number | null };

export async function getRules(yearId: string | null) {
  return withSchool(async (q) => {
    const years = await q<{ id: string; label: string; has_rules: boolean; terms: number }>(`select y.id, y.label, exists (select 1 from level_rules r where r.academic_year_id = y.id) as has_rules,
      (select count(*)::int from terms t where t.academic_year_id = y.id) as terms from academic_years y where y.ends_on >= current_date order by y.starts_on`);
    const year = years.find((y) => y.id === yearId) ?? years[0];
    if (!year) return { years, year: null, levels: [], subjects: [], allSubjects: [], preview: [], bundles: [], weeks: [] };
    const levels = await q<LevelRule>(`select l.id as level_id, l.name as level, r.cost_per_lesson_pence as cost, r.registration_fee_pence as fee,
        coalesce(r.terms_per_year, 6) as terms_per_year, coalesce(r.final_year_terms, 6) as final_year_terms, r.level_id is not null as set
      from levels l left join level_rules r on r.level_id = l.id and r.academic_year_id = $1 order by l.sort_order`, [year.id]);
    const subjects = await q<SubjectRule>(`select s.level_id, l.name as level, s.subject_id, sj.name as subject, s.lessons_per_week as lpw, s.course_years as years
      from subject_rules s join levels l on l.id = s.level_id join subjects sj on sj.id = s.subject_id where s.academic_year_id = $1 order by l.sort_order, sj.name`, [year.id]);
    const allSubjects = await q<{ id: string; name: string }>(`select id, name from subjects order by name`);
    const preview = await q<PreviewRow>(`select l.name as level, sj.name as subject, yoc, s.course_years as years, s.lessons_per_week as lpw,
        x.tc as terms, teaching_weeks($1, x.tc) as weeks, greatest(teaching_weeks($1, x.tc) * s.lessons_per_week, 1) as lessons, r.cost_per_lesson_pence as cost,
        greatest(teaching_weeks($1, x.tc) * s.lessons_per_week, 1) * r.cost_per_lesson_pence as total,
        (select max(pp.total_pence) from course_groups g join price_plans pp on pp.id = g.price_plan_id where g.academic_year_id = $1 and g.level_id = s.level_id
           and g.subject_id = s.subject_id and least(pp.year_of_course, s.course_years) = yoc)
         as class_now,
        (select max(pp.total_pence) from price_plans pp where pp.academic_year_id = $1 and pp.level_id = s.level_id and pp.course_years = s.course_years
           and pp.year_of_course = yoc and pp.lessons_per_week = s.lessons_per_week) as plan_now
      from subject_rules s join level_rules r on r.academic_year_id = s.academic_year_id and r.level_id = s.level_id
      join levels l on l.id = s.level_id join subjects sj on sj.id = s.subject_id
      cross join lateral generate_series(1, s.course_years) yoc
      cross join lateral (select case when yoc = s.course_years then r.final_year_terms else r.terms_per_year end as tc) x
      where s.academic_year_id = $1 order by l.sort_order, sj.name, yoc`, [year.id]).then((rows) => rows.map((r) => {
      const x = r as PreviewRow & { class_now: number | null; plan_now: number | null }; return { ...x, now: x.class_now ?? x.plan_now };
    }));
    const bundles = await q<{ id: string; min_courses: number; percent_off: string }>(`select id, min_courses, percent_off::text from bundle_discounts where academic_year_id = $1 and level_id is null order by min_courses`, [year.id]);
    const weeks = await q<{ number: number; weeks: number }>(`select number, ceil((ends_on - starts_on + 1) / 7.0)::int as weeks from terms where academic_year_id = $1 order by number`, [year.id]);
    return { years, year, levels, subjects, allSubjects, preview, bundles, weeks };
  });
}

type Q = (s: string, p?: unknown[]) => Promise<unknown>;
const audit = (q: Q, a: string, act: string, id: string | null, d: unknown) =>
  q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, $2, 'course_rules', $3, $4)`, [a, act, id, JSON.stringify(d)]);

export async function saveRules(actorId: string, yearId: string, levels: { level_id: string; cost: number | null; fee: number; tpy: number; fyt: number }[],
  subjects: { level_id: string; subject_id: string; lpw: number; years: number; remove: boolean }[]) {
  await withSchool(async (q) => {
    for (const l of levels) {
      if (l.cost == null) { await q(`delete from level_rules where academic_year_id = $1 and level_id = $2`, [yearId, l.level_id]); continue; }
      await q(`insert into level_rules (school_id, academic_year_id, level_id, cost_per_lesson_pence, registration_fee_pence, terms_per_year, final_year_terms)
        values (current_school(), $1, $2, $3::int, $4::int, $5::int, $6::int) on conflict (academic_year_id, level_id) do update set cost_per_lesson_pence = excluded.cost_per_lesson_pence,
        registration_fee_pence = excluded.registration_fee_pence, terms_per_year = excluded.terms_per_year, final_year_terms = excluded.final_year_terms`,
        [yearId, l.level_id, l.cost, l.fee, l.tpy, l.fyt]);
    }
    for (const s of subjects) {
      if (s.remove) { await q(`delete from subject_rules where academic_year_id = $1 and level_id = $2 and subject_id = $3`, [yearId, s.level_id, s.subject_id]); continue; }
      await q(`insert into subject_rules (school_id, academic_year_id, level_id, subject_id, lessons_per_week, course_years) values (current_school(), $1, $2, $3, $4::int, $5::int)
        on conflict (academic_year_id, level_id, subject_id) do update set lessons_per_week = excluded.lessons_per_week, course_years = excluded.course_years`,
        [yearId, s.level_id, s.subject_id, s.lpw, s.years]);
    }
    await audit(q, actorId, "save", yearId, { levels: levels.length, subjects: subjects.length });
  });
}

export async function applyRules(actorId: string, yearId: string): Promise<number> {
  return withSchool(async (q) => {
    const n = (await q<{ n: number }>(`select apply_course_rules($1) as n`, [yearId]))[0].n;
    await audit(q, actorId, "apply", yearId, { classes_moved: n });
    return n;
  });
}

export async function copyRules(actorId: string, fromYear: string, toYear: string) {
  await withSchool(async (q) => {
    await q(`insert into level_rules (school_id, academic_year_id, level_id, cost_per_lesson_pence, registration_fee_pence, terms_per_year, final_year_terms)
      select school_id, $2, level_id, cost_per_lesson_pence, registration_fee_pence, terms_per_year, final_year_terms from level_rules where academic_year_id = $1 on conflict do nothing`, [fromYear, toYear]);
    await q(`insert into subject_rules (school_id, academic_year_id, level_id, subject_id, lessons_per_week, course_years)
      select school_id, $2, level_id, subject_id, lessons_per_week, course_years from subject_rules where academic_year_id = $1 on conflict do nothing`, [fromYear, toYear]);
    await q(`insert into bundle_discounts (school_id, academic_year_id, level_id, min_courses, percent_off)
      select school_id, $2, level_id, min_courses, percent_off from bundle_discounts where academic_year_id = $1 on conflict do nothing`, [fromYear, toYear]);
    await audit(q, actorId, "copy", toYear, { from: fromYear });
  });
}

export async function saveBundles(actorId: string, yearId: string, rows: { min: number; pct: number }[]) {
  await withSchool(async (q) => {
    await q(`delete from bundle_discounts where academic_year_id = $1 and level_id is null`, [yearId]);
    for (const r of rows) await q(`insert into bundle_discounts (school_id, academic_year_id, level_id, min_courses, percent_off) values (current_school(), $1, null, $2::int, $3::numeric)`, [yearId, r.min, r.pct]);
    await audit(q, actorId, "bundles", yearId, rows);
  });
}
