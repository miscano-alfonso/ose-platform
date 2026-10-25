drop function if exists course_price(uuid);
-- The price of a whole course starting with a given plan. Each later year of a 2- or 3-year course is priced from
-- the following school year's plan (its own term dates, e.g. a 6- or 5-week term depending on Easter), when that
-- year is set up; until then from this year's plan for that year of the course.
create or replace function course_price(p_plan uuid) returns table (total_pence int, terms int, lessons int) language sql stable as $$
  with base as (select pp.*, y.starts_on from price_plans pp join academic_years y on y.id = pp.academic_year_id where pp.id = p_plan),
  parts as (
    select k, coalesce(nxt.id, cur.id) as plan_id
    from base b cross join generate_series(b.year_of_course::int, b.course_years::int) k
    left join lateral (select p2.id from price_plans p2 join academic_years y2 on y2.id = p2.academic_year_id
        where p2.school_id = b.school_id and p2.level_id = b.level_id and p2.course_years = b.course_years and p2.year_of_course = k
          and p2.lessons_per_week = b.lessons_per_week and k > b.year_of_course
          and y2.id = (select y3.id from academic_years y3 where y3.school_id = b.school_id and y3.starts_on > b.starts_on
                       order by y3.starts_on offset (k - b.year_of_course - 1) limit 1)
        limit 1) nxt on true
    left join lateral (select p2.id from price_plans p2 where p2.academic_year_id = b.academic_year_id and p2.level_id = b.level_id
        and p2.course_years = b.course_years and p2.year_of_course = k order by (p2.lessons_per_week = b.lessons_per_week) desc limit 1) cur on true)
  select sum(pp.total_pence)::int, sum(pp.term_count)::int, sum(pp.lessons)::int from parts join price_plans pp on pp.id = parts.plan_id
$$;
