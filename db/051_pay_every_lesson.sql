-- One rule for teacher pay everywhere: every lesson that isn't cancelled is paid to whoever taught it (the Payroll
-- page always counted it this way; the pay run and the teacher's My pay only counted lessons with a Meet join).
create or replace view teacher_term_pay with (security_invoker = true) as
  select e.school_id, e.term_id, e.teacher_id, l.name as level, count(*)::int as lessons,
         sum(coalesce(
           (select r.rate_pence from pay_rates r where r.school_id = e.school_id and r.level_id = g.level_id and r.teacher_id = e.teacher_id and r.valid_from <= e.lesson_date order by r.valid_from desc limit 1),
           (select r.rate_pence from pay_rates r where r.school_id = e.school_id and r.level_id = g.level_id and r.teacher_id is null and r.valid_from <= e.lesson_date order by r.valid_from desc limit 1)
         ))::int as pay_pence
  from lesson_events e
  join course_groups g on g.id = e.group_id
  join levels l on l.id = g.level_id
  where e.status <> 'cancelled' and e.teacher_id is not null
  group by e.school_id, e.term_id, e.teacher_id, l.name;
