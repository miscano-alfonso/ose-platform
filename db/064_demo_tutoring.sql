-- Demo Academy: made-up 1:1 lessons, some already taught (one missed) and some coming up over the next fortnight, so the
-- admin's 1:1 tutoring page, the teachers' "1:1s and workshops" and the parents' pages all have something to show.
-- Also gives the demo teachers weekday availability for 1:1s. Run whenever the demo school is made (src/lib/demo.ts).
create or replace function demo_tutoring() returns void language plpgsql security definer set search_path = public as $$
declare demo uuid; r record; n int := 0; d date; st timestamptz; price int; pay int; aud tutoring_audience;
begin
  select id into demo from schools where slug = 'demo-academy' and is_demo; if demo is null then return; end if;
  delete from tutoring_bookings where school_id = demo;
  delete from tutoring_availability where school_id = demo;
  insert into tutoring_availability (school_id, teacher_id, weekday, starts_at, ends_at, valid_from)
    select demo, t.id, wd, '15:30', '19:00', current_date - 120 from teachers t cross join generate_series(1, 5) wd where t.school_id = demo and t.archived_at is null;
  -- one child per family (up to 12), with a teacher who teaches one of their subjects at their level
  for r in select distinct on (s.parent_id) s.id as sid, s.parent_id, s.first_name || ' ' || s.last_name as nm, s.email, g.level_id, g.subject_id, g.teacher_id, sj.name as subj
      from students s join enrolments e on e.student_id = s.id and e.status = 'active' and not e.is_taster join course_groups g on g.id = e.group_id join subjects sj on sj.id = g.subject_id
      where s.school_id = demo and g.teacher_id is not null order by s.parent_id, s.first_name limit 12 loop
    n := n + 1;
    aud := 'enrolled';
    select price_pence, teacher_pay_pence into price, pay from tutoring_rates where school_id = demo and level_id = r.level_id and audience = aud and minutes = 45 order by valid_from desc limit 1;
    price := coalesce(price, 3500); pay := coalesce(pay, 2000);
    -- two past lessons (the 5th child missed one) and one or two coming up
    for k in 1..4 loop
      exit when k = 4 and n % 2 = 0;
      d := case when k <= 2 then current_date - (3 + n + k * 6) else current_date + (n % 9) + (k - 3) * 7 + 1 end;
      while extract(isodow from d) > 5 loop d := d + 1; end loop;
      st := (d + make_time(15 + (n % 3), case when n % 2 = 0 then 30 else 0 end, 0)) at time zone 'Europe/London';
      begin
        insert into tutoring_bookings (school_id, teacher_id, level_id, subject_id, parent_id, student_id, student_name, student_email, focus, audience, starts_at, minutes, price_pence, teacher_pay_pence, status, created_at)
          values (demo, r.teacher_id, r.level_id, r.subject_id, r.parent_id, r.sid, r.nm, r.email,
            (array['Exam technique and past papers', 'Catching up after a missed week', 'Essay planning', 'Revision for the end-of-term test', 'Going over this week’s homework'])[1 + (n + k) % 5],
            aud, st, 45, price, pay, (case when k <= 2 then (case when n = 5 and k = 2 then 'no_show' else 'completed' end) else 'booked' end)::tutoring_status, st - interval '9 days');
      exception when others then null;   -- the teacher is already booked then: skip it
      end;
    end loop;
  end loop;
end $$;
revoke all on function demo_tutoring() from public;
grant execute on function demo_tutoring() to app_user;
do $$ begin if exists (select 1 from schools where slug = 'demo-academy' and is_demo) then perform demo_tutoring(); end if; end $$;
