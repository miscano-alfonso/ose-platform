-- 27 Nov: Demo Academy has work waiting to be marked, so Marking (and My day's marking box, and the /newdashboard
-- screenshots) show what teachers will see: in each class, a piece due 3 days ago that most of the class has handed in
-- (a few late, one sent back to redo) and a piece due in 2 days that some have handed in early. Run on every demo rebuild.
create or replace function demo_marking() returns void language plpgsql security definer set search_path = public as $$
declare demo uuid; g record; cw uuid;
begin
  select id into demo from schools where slug = 'demo-academy' and is_demo;
  if demo is null then return; end if;
  delete from classroom_coursework where school_id = demo and coursework_id like 'demo-mk-%';
  for g in select cg.id from course_groups cg where cg.school_id = demo and exists (select 1 from enrolments x where x.group_id = cg.id and x.status = 'active' and not x.is_taster) loop
    -- due 3 days ago: most handed in, a few late, one returned without a mark to redo
    insert into classroom_coursework (school_id, group_id, coursework_id, title, due_at, max_points, link, description, posted_at)
      values (demo, g.id, 'demo-mk-' || g.id || '-1', 'Essay plan', (current_date - 3)::timestamptz + interval '23 hours 59 minutes', 20, null,
        'Plan your essay: choose three key points, find a quotation or example for each, and write a one-sentence answer to the question. Bullet points are fine.', now() - interval '10 days')
      returning id into cw;
    insert into classroom_submissions (school_id, coursework_id, student_id, state, late, points, turned_in_at)
      select demo, cw, x.student_id,
        (case when r < 0.08 then 'returned' when r < 0.85 then 'turned_in' else 'assigned' end)::submission_state, r between 0.65 and 0.85, null,
        case when r < 0.85 then (current_date - 3)::timestamptz + (case when r between 0.65 and 0.85 then interval '1 day 10 hours' else interval '15 hours' end) end
      from (select x.student_id, random() as r from enrolments x where x.group_id = g.id and x.status = 'active' and not x.is_taster) x;
    -- due in 2 days: some handed in early
    insert into classroom_coursework (school_id, group_id, coursework_id, title, due_at, max_points, link, description, posted_at)
      values (demo, g.id, 'demo-mk-' || g.id || '-2', 'Practice questions', (current_date + 2)::timestamptz + interval '23 hours 59 minutes', 10, null,
        'Answer questions 1 to 6 on the worksheet attached in Classroom. Show your working.', now() - interval '2 days')
      returning id into cw;
    insert into classroom_submissions (school_id, coursework_id, student_id, state, late, points, turned_in_at)
      select demo, cw, x.student_id, (case when r < 0.4 then 'turned_in' else 'assigned' end)::submission_state, false, null,
        case when r < 0.4 then now() - interval '1 day' end
      from (select x.student_id, random() as r from enrolments x where x.group_id = g.id and x.status = 'active' and not x.is_taster) x;
  end loop;
end $$;
revoke all on function demo_marking() from public;
grant execute on function demo_marking() to app_user;
do $$ begin if exists (select 1 from schools where slug = 'demo-academy' and is_demo) then perform demo_marking(); end if; end $$;
