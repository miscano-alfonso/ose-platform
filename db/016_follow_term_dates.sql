-- Prices follow the rules and the term dates (agreed Oct 2026): every plan's lessons = lessons a week × teaching weeks.
-- 1) Families already booked keep the whole-course price they agreed (TechSaga's), even when the plans change.
alter table enrolments add column if not exists course_total_pence integer;
update enrolments e set course_total_pence = (
    select sum(p2.total_pence)::int from course_groups g join price_plans pp on pp.id = g.price_plan_id
    join price_plans p2 on p2.academic_year_id = pp.academic_year_id and p2.level_id = pp.level_id and p2.course_years = pp.course_years
      and (pp.course_years > 1 or p2.id = pp.id)
    where g.id = e.group_id)
  where e.course_total_pence is null and e.status in ('pending', 'active');

-- 2) Apply also refreshes plans no subject rule covers (e.g. A-Level), and keeps them rather than deleting them.
create or replace function apply_course_rules(p_year uuid) returns int language plpgsql as $$
declare r record; yoc int; tc int; pid uuid; nm text; n int := 0; k int;
begin
  for r in select s.*, lr.cost_per_lesson_pence, lr.registration_fee_pence, lr.terms_per_year, lr.final_year_terms, l.name as level_name
           from subject_rules s join level_rules lr on lr.academic_year_id = s.academic_year_id and lr.level_id = s.level_id
           join levels l on l.id = s.level_id where s.academic_year_id = p_year loop
    for yoc in 1..r.course_years loop
      tc := case when yoc = r.course_years then r.final_year_terms else r.terms_per_year end;
      select id into pid from price_plans where academic_year_id = p_year and level_id = r.level_id and course_years = r.course_years
        and year_of_course = yoc and lessons_per_week = r.lessons_per_week order by name limit 1;
      if pid is null then
        nm := r.level_name || case when r.course_years > 1 then ' ' || r.course_years || '-year, year ' || yoc
                                   when r.level_name ilike '%gcse%' and r.level_name not ilike 'pre%' then ' 1-year' else '' end
              || ', ' || r.lessons_per_week || ' lesson' || case when r.lessons_per_week > 1 then 's' else '' end || ' a week';
        insert into price_plans (school_id, academic_year_id, level_id, name, course_years, year_of_course, lessons_per_week, term_count, lessons, cost_per_lesson_pence, registration_fee_pence)
          values (r.school_id, p_year, r.level_id, nm, r.course_years, yoc, r.lessons_per_week, tc,
                  greatest(teaching_weeks(p_year, tc) * r.lessons_per_week, 1), r.cost_per_lesson_pence, r.registration_fee_pence)
          returning id into pid;
      end if;
      update course_groups g set price_plan_id = pid
        from price_plans cur
        where cur.id = g.price_plan_id and g.academic_year_id = p_year and g.level_id = r.level_id and g.subject_id = r.subject_id
          and g.price_plan_id <> pid and least(cur.year_of_course, r.course_years) = yoc;
      get diagnostics k = row_count; n := n + k;
    end loop;
  end loop;
  -- every plan of the year: terms from its level's rule, lessons from the term dates, price from the level's price per lesson
  update price_plans pp set
      term_count = case when pp.year_of_course = pp.course_years then lr.final_year_terms else lr.terms_per_year end,
      lessons = greatest(teaching_weeks(p_year, case when pp.year_of_course = pp.course_years then lr.final_year_terms else lr.terms_per_year end) * pp.lessons_per_week, 1),
      cost_per_lesson_pence = lr.cost_per_lesson_pence, registration_fee_pence = lr.registration_fee_pence
    from level_rules lr where lr.academic_year_id = p_year and lr.level_id = pp.level_id and pp.academic_year_id = p_year;
  -- plans nothing uses and no rule asks for
  delete from price_plans pp where pp.academic_year_id = p_year
    and not exists (select 1 from course_groups g where g.price_plan_id = pp.id)
    and exists (select 1 from subject_rules s where s.academic_year_id = p_year and s.level_id = pp.level_id)
    and not exists (select 1 from subject_rules s where s.academic_year_id = p_year and s.level_id = pp.level_id
                    and s.lessons_per_week = pp.lessons_per_week and s.course_years = pp.course_years);
  return n;
end $$;

-- 3) Apply the rules to every current year now
select apply_course_rules(y.id) from academic_years y where y.ends_on >= current_date and exists (select 1 from level_rules r where r.academic_year_id = y.id);
