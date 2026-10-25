-- A-Level price plan, as on the current website's price table: 2-year course, 128 lessons at £16 (£2,048).
-- Two yearly plans of 64 lessons each, paid termly like the 2-year GCSE.
do $$ declare s uuid; y uuid; l uuid; begin
  select id into s from schools where slug = 'ohsoed';
  if s is null then return; end if;
  select id into y from academic_years where school_id = s and label = '2026/27';
  select id into l from levels where school_id = s and name = 'A-Level';
  if y is null or l is null then return; end if;
  insert into price_plans (school_id, academic_year_id, level_id, name, course_years, year_of_course, lessons_per_week, term_count, lessons, cost_per_lesson_pence, registration_fee_pence)
  values (s, y, l, 'A-Level 2-year, year 1', 2, 1, 2, 6, 64, 1600, 2500),
         (s, y, l, 'A-Level 2-year, year 2', 2, 2, 2, 6, 64, 1600, 2500)
  on conflict (academic_year_id, name) do nothing;
  -- this sample workshop isn't a real OH-SO ED event, so keep it off the website
  update workshops set status = 'draft' where school_id = s and slug = 'gcse-maths-exam-technique' and status = 'published';
end $$;
