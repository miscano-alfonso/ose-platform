-- Course rules, set per school year in Admin → Prices & rules:
--   per level:   price per lesson, registration fee, terms in a course year, terms in the final (exam) year
--   per subject: lessons per week at each level, and course length in years
-- Lessons in a course year = lessons per week × teaching weeks in its terms (from the term dates).
-- Price = lessons × price per lesson. apply_course_rules(year) rebuilds that year's price plans from the rules
-- and points each class at the right one. Families already booked keep the payments they agreed.
create table if not exists level_rules (
  school_id        uuid not null references schools(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  level_id         uuid not null references levels(id) on delete cascade,
  cost_per_lesson_pence integer not null check (cost_per_lesson_pence >= 0),
  registration_fee_pence integer not null default 0 check (registration_fee_pence >= 0),
  terms_per_year   smallint not null default 6 check (terms_per_year between 1 and 6),
  final_year_terms smallint not null default 6 check (final_year_terms between 1 and 6),
  primary key (academic_year_id, level_id)
);
create table if not exists subject_rules (
  school_id        uuid not null references schools(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  level_id         uuid not null references levels(id) on delete cascade,
  subject_id       uuid not null references subjects(id) on delete cascade,
  lessons_per_week smallint not null check (lessons_per_week between 1 and 5),
  course_years     smallint not null default 1 check (course_years between 1 and 3),
  primary key (academic_year_id, level_id, subject_id)
);
grant select, insert, update, delete on level_rules, subject_rules to app_user;
alter table level_rules enable row level security;
alter table subject_rules enable row level security;
drop policy if exists school_isolation on level_rules;
create policy school_isolation on level_rules to app_user using (school_id = current_school()) with check (school_id = current_school());
drop policy if exists school_isolation on subject_rules;
create policy school_isolation on subject_rules to app_user using (school_id = current_school()) with check (school_id = current_school());

-- Teaching weeks in terms 1..n of a year (each term counted in whole weeks)
create or replace function teaching_weeks(p_year uuid, p_terms int) returns int language sql stable as $$
  select coalesce(sum(ceil((t.ends_on - t.starts_on + 1) / 7.0)), 0)::int from terms t where t.academic_year_id = p_year and t.number <= p_terms
$$;

-- Rebuild a year's price plans from its rules. Returns how many classes changed plan.
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
      else
        update price_plans set term_count = tc, lessons = greatest(teaching_weeks(p_year, tc) * r.lessons_per_week, 1),
          cost_per_lesson_pence = r.cost_per_lesson_pence, registration_fee_pence = r.registration_fee_pence where id = pid;
      end if;
      -- a class keeps its year of the course (a year-2 class stays year 2)
      update course_groups g set price_plan_id = pid
        from price_plans cur
        where cur.id = g.price_plan_id and g.academic_year_id = p_year and g.level_id = r.level_id and g.subject_id = r.subject_id
          and g.price_plan_id <> pid and least(cur.year_of_course, r.course_years) = yoc;
      get diagnostics k = row_count; n := n + k;
    end loop;
  end loop;
  -- plans no class uses any more
  delete from price_plans pp where pp.academic_year_id = p_year and not exists (select 1 from course_groups g where g.price_plan_id = pp.id);
  return n;
end $$;

-- Start the rules from how 2026/27 is set up today (nothing is changed until Apply is pressed in the admin)
insert into level_rules (school_id, academic_year_id, level_id, cost_per_lesson_pence, registration_fee_pence, terms_per_year, final_year_terms)
  select pp.school_id, pp.academic_year_id, pp.level_id, max(pp.cost_per_lesson_pence), max(pp.registration_fee_pence),
    coalesce(max(pp.term_count) filter (where pp.year_of_course < pp.course_years), max(pp.term_count)),
    coalesce(min(pp.term_count) filter (where pp.year_of_course = pp.course_years), max(pp.term_count))
  from price_plans pp group by pp.school_id, pp.academic_year_id, pp.level_id
  on conflict do nothing;
insert into subject_rules (school_id, academic_year_id, level_id, subject_id, lessons_per_week, course_years)
  select distinct on (g.academic_year_id, g.level_id, g.subject_id) g.school_id, g.academic_year_id, g.level_id, g.subject_id, pp.lessons_per_week, pp.course_years
  from course_groups g join price_plans pp on pp.id = g.price_plan_id
  order by g.academic_year_id, g.level_id, g.subject_id, (g.continues_group_id is null) desc, g.code
  on conflict do nothing;
