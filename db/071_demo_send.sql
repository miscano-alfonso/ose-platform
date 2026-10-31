-- Demo Academy (31 Oct): made-up SEND details and birthdays coming up, so the demo shows the SEND labels, filters and
-- "SEND in this class" lines, and the "birthdays" line on teachers' lesson cards. demo_send() runs on every demo rebuild
-- (src/lib/demo.ts) and once here; it only touches the demo school.
create or replace function demo_send() returns void language plpgsql security definer set search_path = public as $$
declare demo uuid; r record; n int := 0; used uuid[] := '{}'; offs int[] := array[0, 1, 2, -1, 3, 5, 8, 12];
  prof jsonb := '[
    {"needs": ["ADHD"], "ehcp": false, "details": "ADHD, diagnosed in Year 5. Finds long stretches of listening hard and can drift off.", "adj": "Short tasks with clear steps and a quick check-in at the start. A fidget toy off camera is fine."},
    {"needs": ["Dyslexia"], "ehcp": false, "details": "Dyslexia: reads more slowly than classmates and finds spelling hard.", "adj": "Slides shared before the lesson, extra time on written tasks, and a cream background on documents."},
    {"needs": ["Autism", "Anxiety"], "ehcp": true, "details": "Autistic, with anxiety in new or unexpected situations. Has an EHCP.", "adj": "Warn about any change to the plan. Please don’t ask them to speak without notice; the camera can stay off."},
    {"needs": ["Dyspraxia"], "ehcp": false, "details": "Dyspraxia: handwriting is slow and tiring.", "adj": "Typing instead of handwriting; a photo of written work is fine for homework."},
    {"needs": ["Anxiety"], "ehcp": false, "details": "Anxiety, especially around tests and being put on the spot.", "adj": "Low-stakes quizzes, and praise in the private chat rather than out loud."},
    {"needs": ["Dyscalculia"], "ehcp": false, "details": "Dyscalculia: struggles to hold numbers in mind.", "adj": "Number lines and worked examples on screen; a calculator is allowed."},
    {"needs": ["Hearing"], "ehcp": false, "details": "Mild hearing loss in the left ear.", "adj": "Captions on in Meet, and please repeat other students’ questions."},
    {"needs": ["Speech and language", "ADHD"], "ehcp": true, "details": "Speech and language difficulties and ADHD. Has an EHCP.", "adj": "Give time to answer, and offer the chat as a way to reply."}
  ]';
begin
  select id into demo from schools where slug = 'demo-academy' and is_demo; if demo is null then return; end if;
  delete from student_support where school_id = demo;
  -- SEND: every 4th student (by name) with an active place, so it's spread across the classes; the last one isn't shared with teachers
  for r in select s.id from students s where s.school_id = demo
      and exists (select 1 from enrolments e where e.student_id = s.id and e.status = 'active' and not e.is_taster)
      order by s.last_name, s.first_name loop
    n := n + 1;
    continue when n % 4 <> 1;
    exit when (n / 4) >= jsonb_array_length(prof);
    insert into student_support (student_id, school_id, has_send, details, adjustments, has_ehcp, share_with_teachers, needs)
      values (r.id, demo, 'yes', prof->(n / 4)->>'details', prof->(n / 4)->>'adj', (prof->(n / 4)->>'ehcp')::boolean,
              (n / 4) < jsonb_array_length(prof) - 1,
              array(select jsonb_array_elements_text(prof->(n / 4)->'needs')));
  end loop;
  -- birthdays: one student in each of 8 classes has a birthday between yesterday and 12 days' time (same age as before)
  n := 0;
  for r in select distinct on (g.code) g.code, s.id, s.date_of_birth from course_groups g join enrolments e on e.group_id = g.id and e.status = 'active' and not e.is_taster
      join students s on s.id = e.student_id where g.school_id = demo and s.date_of_birth is not null order by g.code, s.first_name loop
    continue when r.id = any(used);
    n := n + 1; exit when n > array_length(offs, 1);
    update students set date_of_birth = (current_date + offs[n] - make_interval(years => extract(year from age(current_date, r.date_of_birth))::int + case when offs[n] > 0 then 1 else 0 end))::date
      where id = r.id;
    used := used || r.id;
  end loop;
end $$;
revoke all on function demo_send() from public;
grant execute on function demo_send() to app_user;
do $$ begin if exists (select 1 from schools where slug = 'demo-academy' and is_demo) then perform demo_send(); end if; end $$;
