-- Demo Academy: a second school with OH-SO ED's course set-up (years, terms, levels, subjects, prices, classes, timetable)
-- and made-up teachers, families, bookings, payments, attendance, reports, messages, tasters and enquiries. Every name is
-- invented and every email is @example.com / @pupils.example (domains reserved for examples, so nothing can ever be delivered).
-- reset_demo_school() deletes the demo school and builds it again; the dashboard then adds lesson dates and payment plans.
alter table schools add column if not exists is_demo boolean not null default false;

create or replace function reset_demo_school(p_source text default 'ohsoed') returns uuid language plpgsql security definer set search_path = public as $$
declare
  src uuid; demo uuid; y uuid; r record; tid uuid; fid uuid; sid uuid; uid uuid; n int; k int; lvl record;
  kids text[] := array['Ada','Ben','Cleo','Dev','Elsie','Finn','Grace','Hari','Isla','Jonah','Kit','Lola','Milo','Nia','Otto','Pippa','Quinn','Rosa','Sami','Tess','Ula','Vince','Wren','Xander','Yara','Zac','Arlo','Bea','Cosmo','Dora','Eli','Freya','Gus','Hattie','Ivo','Juno'];
  adults text[] := array['Claire','James','Priya','Tom','Hannah','Marcus','Sophie','Ade','Laura','Nikhil','Fiona','Gareth','Mei','Owen','Ruth','Simon','Tanya','Will','Zoe','Dan','Esme','Kofi','Lena','Rob'];
  surn text[] := array['Ashdown','Bramley','Calder','Dunmore','Ellery','Fenwick','Garland','Hollis','Ingram','Jessop','Kerridge','Linford','Marlow','Nettleton','Orme','Pellow','Quarry','Redfern','Selby','Thursby','Upton','Varley','Whitlock','Yardley'];
  heard text[] := array['Word of mouth','Google search','Facebook group','Instagram','Home-ed group'];
  tnames text[][] := array[['Mia','Fletcher','English & Literature'],['Owen','Price','Maths & Geography'],['Ruth','Okafor','Sciences'],['Nina','Sharma','History & Business']];
  ki int := 1; opts uuid[]; want int; gg uuid;
begin
  select id into src from schools where slug = p_source;
  if src is null then raise exception 'source school % not found', p_source; end if;
  delete from schools where slug = 'demo-academy';
  insert into schools (slug, name, brand, is_demo, timezone, currency, taster_places_per_lesson, few_places_at, almost_full_at)
    select 'demo-academy', 'Demo Academy', '{"primary":"#14532d","accent":"#f59e0b"}'::jsonb, true, timezone, currency, taster_places_per_lesson, few_places_at, almost_full_at from schools where id = src
    returning id into demo;
  perform setseed(0.42);

  -- id maps from OH-SO ED's rows to the demo's
  create temp table m (old uuid primary key, new uuid not null) on commit drop;
  for r in select * from academic_years where school_id = src and ends_on >= current_date - 30 loop
    insert into academic_years (school_id, label, starts_on, ends_on, sales_open_on) values (demo, r.label, r.starts_on, r.ends_on, r.sales_open_on) returning id into y;
    insert into m values (r.id, y);
  end loop;
  insert into m select t.id, gen_random_uuid() from terms t where t.school_id = src and t.academic_year_id in (select old from m);
  insert into terms (id, school_id, academic_year_id, number, name, starts_on, ends_on, bills_on)
    select (select new from m where old = t.id), demo, (select new from m where old = t.academic_year_id), number, name, starts_on, ends_on, bills_on from terms t where t.id in (select old from m);
  insert into holidays (school_id, name, starts_on, ends_on) select demo, name, starts_on, ends_on from holidays where school_id = src and ends_on >= current_date - 400;
  insert into m select id, gen_random_uuid() from levels where school_id = src;
  insert into levels (id, school_id, name, min_age, max_age, sort_order, notice_terms) select (select new from m where old = l.id), demo, name, min_age, max_age, sort_order, notice_terms from levels l where school_id = src;
  insert into m select id, gen_random_uuid() from subjects where school_id = src;
  insert into subjects (id, school_id, name, colour) select (select new from m where old = s.id), demo, name, colour from subjects s where school_id = src;
  insert into level_rules select demo, (select new from m where old = academic_year_id), (select new from m where old = level_id), cost_per_lesson_pence, registration_fee_pence, terms_per_year, final_year_terms
    from level_rules where school_id = src and academic_year_id in (select old from m);
  insert into subject_rules select demo, (select new from m where old = academic_year_id), (select new from m where old = level_id), (select new from m where old = subject_id), lessons_per_week, course_years
    from subject_rules where school_id = src and academic_year_id in (select old from m);
  insert into bundle_discounts (school_id, academic_year_id, level_id, min_courses, percent_off) select demo, (select new from m where old = academic_year_id), (select new from m where old = level_id), min_courses, percent_off
    from bundle_discounts where school_id = src and academic_year_id in (select old from m);
  insert into m select id, gen_random_uuid() from price_plans where school_id = src and academic_year_id in (select old from m);
  insert into price_plans (id, school_id, academic_year_id, level_id, name, course_years, year_of_course, lessons_per_week, term_count, lessons, cost_per_lesson_pence, registration_fee_pence, reminder_days)
    select (select new from m where old = p.id), demo, (select new from m where old = academic_year_id), (select new from m where old = level_id), name, course_years, year_of_course, lessons_per_week, term_count, lessons, cost_per_lesson_pence, registration_fee_pence, reminder_days
    from price_plans p where school_id = src and academic_year_id in (select old from m);
  insert into grade_bands (school_id, score, label, min_pct, progress_text, effort_text) select demo, score, label, min_pct, progress_text, effort_text from grade_bands where school_id = src;
  insert into tutoring_rates (school_id, level_id, audience, minutes, price_pence, teacher_pay_pence, valid_from) select demo, (select new from m where old = level_id), audience, minutes, price_pence, teacher_pay_pence, valid_from from tutoring_rates where school_id = src;
  insert into attendance_settings select demo, late_grace_minutes, early_grace_minutes, min_minutes, source from attendance_settings where school_id = src;

  -- four made-up teachers, each standing in for one of OH-SO ED's (same subjects, so the timetable has no clashes)
  n := 0;
  for r in select t.id, t.sort_order from teachers t where t.school_id = src and t.archived_at is null and exists (select 1 from course_groups g where g.teacher_id = t.id) order by t.sort_order, t.id loop
    n := n + 1; k := ((n - 1) % 4) + 1;
    insert into users (school_id, email, name, role) values (demo, lower(tnames[k][1] || '.' || tnames[k][2] || n || '@example.com'), tnames[k][1] || ' ' || tnames[k][2] || case when n > 4 then ' ' || n else '' end, 'teacher') returning id into uid;
    insert into teachers (school_id, user_id, designation, bio, slug, sort_order) values (demo, uid, tnames[k][3] || ' teacher', 'An example teacher for the demo school.', lower(tnames[k][1] || '-' || tnames[k][2] || n), n) returning id into tid;
    insert into m values (r.id, tid);
    insert into teacher_subjects select tid, (select new from m where old = level_id), (select new from m where old = subject_id) from teacher_subjects where teacher_id = r.id;
  end loop;
  insert into pay_rates (school_id, level_id, teacher_id, rate_pence, valid_from) select demo, (select new from m where old = level_id), (select new from m where old = teacher_id), rate_pence, valid_from from pay_rates where school_id = src;

  -- classes and their weekly times
  insert into m select g.id, gen_random_uuid() from course_groups g where g.school_id = src and g.academic_year_id in (select old from m) and g.status <> 'closed';
  insert into course_groups (id, school_id, academic_year_id, level_id, subject_id, price_plan_id, teacher_id, code, capacity, lesson_minutes, status, waitlist_threshold, priority_hours, description, capacity_mode, sticky_label)
    select (select new from m where old = g.id), demo, (select new from m where old = academic_year_id), (select new from m where old = level_id), (select new from m where old = subject_id),
      (select new from m where old = price_plan_id), (select new from m where old = teacher_id), code, capacity, lesson_minutes, status, waitlist_threshold, priority_hours, description, capacity_mode, sticky_label
    from course_groups g where g.id in (select old from m);
  insert into lesson_slots (school_id, academic_year_id, group_id, teacher_id, weekday, starts_at, ends_at)
    select demo, (select new from m where old = s.academic_year_id), (select new from m where old = s.group_id), (select new from m where old = s.teacher_id), weekday, starts_at, ends_at
    from lesson_slots s where s.group_id in (select old from m);

  -- families and children, booked onto open classes at their level
  select id into y from academic_years where school_id = demo and current_date between starts_on and ends_on;
  for i in 1..24 loop
    insert into parents (school_id, first_name, last_name, email, phone, heard_about, address, marketing_opt_in, accepts_contact_requests, created_at)
      values (demo, adults[i], surn[i], lower(adults[i] || '.' || surn[i] || '@example.com'), '07700 900' || lpad((100 + i * 7)::text, 3, '0'), heard[1 + (i % 5)],
        (10 + i * 3) || ' ' || (array['Elm','Mill','Church','Park','Station','Orchard'])[1 + i % 6] || ' Road, ' || (array['Bath','Frome','Wells','Bristol'])[1 + i % 4], i % 4 <> 3, i % 3 = 0,
        case when i < 15 then '2025-08-20'::date else '2026-08-10'::date end + (i || ' days')::interval)
      returning id into fid;
    for c in 1..(case when random() < 0.3 then 2 else 1 end) loop
      exit when ki > array_length(kids, 1);
      select * into lvl from levels where school_id = demo and name <> 'A-Level' order by random() limit 1;
      insert into students (school_id, parent_id, first_name, last_name, email, google_account_confirmed, date_of_birth)
        values (demo, fid, kids[ki], surn[i], lower(kids[ki] || '.' || surn[i] || '@pupils.example'), true,
          make_date(extract(year from current_date)::int - coalesce(lvl.min_age, 12) - 1, 1 + (ki % 12), 1 + (ki % 27)))
        returning id into sid;
      ki := ki + 1;
      select array_agg(g2.id order by random()) into opts from course_groups g2 where g2.school_id = demo and g2.level_id = lvl.id and g2.academic_year_id = y and g2.status = 'open'
        and exists (select 1 from lesson_slots s where s.group_id = g2.id);
      want := least(coalesce(array_length(opts, 1), 0), 1 + floor(random() * random() * 4)::int + case when random() < 0.2 then 2 else 0 end);
      for j in 1..want loop
        gg := opts[j];
        begin
          insert into enrolments (school_id, student_id, group_id, status, list_price_pence, allow_clash, enrolled_at, source, admin_note)
            values (demo, sid, gg, 'active', 0, true, case when random() < 0.12 then '2026-09-14'::date + (floor(random() * 20) || ' days')::interval else '2026-08-04'::date + (floor(random() * 30) || ' days')::interval end,
              'demo', 'TechSaga terms paid: ' || (select string_agg(case when t2.bills_on <= current_date then '1' else '0' end, '' order by t2.number) from terms t2 where t2.academic_year_id = y));
        exception when others then null;   -- a full class: skip it
        end;
      end loop;
    end loop;
  end loop;
  update enrolments set starts_on = enrolled_at::date where school_id = demo;

  -- waiting list, enquiries and tasters (lesson dates come later, so taster bookings are added by demo_activity)
  insert into waitlist_entries (school_id, group_id, level_id, subject_id, parent_name, child_name, email, created_at)
    select demo, g2.id, g2.level_id, g2.subject_id, w.p, w.c, w.e, current_date - w.d from (values ('Alison Brook','Theo','alison.brook@example.com',50), ('Sunil Mehta','Anya','sunil.mehta@example.com',40),
      ('Kate Driscoll','Rory','kate.d@example.com',30), ('Grace Okafor','Sam','grace.o@example.com',20), ('Jo Pemberton','Alfie','jo.pemberton@example.com',10)) w(p, c, e, d)
    cross join lateral (select id, level_id, subject_id from course_groups where school_id = demo and status = 'waitlist' order by code limit 1) g2;
  insert into enquiries (school_id, kind, name, email, levels, heard_about, message, handled_at, created_at) values
    (demo, 'taster', 'Helen Carter', 'helen.c@example.com', '{KS3}', 'Facebook group', 'Could my daughter try a Maths taster this month?', null, now() - interval '2 days'),
    (demo, 'contact', 'Arjun Patel', 'arjun.p@example.com', '{iGCSE}', 'Google search', 'Do you cover the Edexcel iGCSE Biology specification?', null, now() - interval '4 days'),
    (demo, 'contact', 'Beth Rowan', 'beth.r@example.com', '{Pre-GCSE,iGCSE}', 'Word of mouth', 'Is there a sibling discount?', now() - interval '6 days', now() - interval '9 days'),
    (demo, 'taster', 'Marcus Lee', 'marcus.lee@example.com', '{Pre-GCSE}', 'Instagram', 'Interested in Pre-GCSE English for my son.', null, now() - interval '12 days');
  return demo;
end $$;

-- After the dashboard has added the lesson dates and payment plans: attendance, reports, messages, points, tasters, Classroom work.
create or replace function demo_activity() returns void language plpgsql security definer set search_path = public as $$
declare demo uuid; ev record; e record; cyc uuid; tr uuid; th uuid; t record; cw uuid; low uuid[]; x numeric;
begin
  select id into demo from schools where slug = 'demo-academy' and is_demo; if demo is null then return; end if;
  perform setseed(0.17);
  select array_agg(id) into low from (select id from students where school_id = demo order by first_name limit 2) s;
  -- attendance for every lesson taught so far (from each child's start date), as if from Google Meet
  for ev in select le.id, le.group_id, le.lesson_date, s.starts_at from lesson_events le join lesson_slots s on s.id = le.slot_id
      where le.school_id = demo and le.lesson_date < current_date and le.status <> 'cancelled' loop
    update lesson_events set status = 'taught' where id = ev.id;
    for e in select student_id from enrolments where group_id = ev.group_id and status = 'active' and not is_taster and coalesce(starts_on, enrolled_at::date) <= ev.lesson_date loop
      x := random(); if e.student_id = any(low) then x := x * 2.4; end if;
      insert into attendance_marks (school_id, lesson_event_id, student_id, mark, source, minutes_present, joined_at, left_at, left_early)
        values (demo, ev.id, e.student_id, (case when x < 0.84 then 'present' when x < 0.9 then 'late' when x < 0.97 then 'absent' else 'approved_absence' end)::attendance_mark, 'meet',
          case when x < 0.9 then 40 + floor(random() * 6)::int end,
          case when x < 0.9 then (ev.lesson_date + ev.starts_at + ((case when x < 0.84 then -2 else 8 end) || ' minutes')::interval) at time zone 'Europe/London' end,
          case when x < 0.9 then (ev.lesson_date + ev.starts_at + interval '45 minutes') at time zone 'Europe/London' end, random() < 0.05)
        on conflict do nothing;
    end loop;
  end loop;
  -- two failed payments to chase
  update instalments set status = 'failed', attempts = 2, paid_at = null where id in (select i.id from instalments i where i.school_id = demo and i.status = 'paid' order by i.due_on desc, i.id limit 2);
  -- Classroom work with marks, so reports have a marks average
  for t in select g.id as gid, g.teacher_id from course_groups g where g.school_id = demo and exists (select 1 from enrolments x where x.group_id = g.id) loop
    for w in 1..4 loop
      insert into classroom_coursework (school_id, group_id, coursework_id, title, due_at, max_points, link)
        values (demo, t.gid, 'demo-' || t.gid || '-' || w, (array['Home study 1','Home study 2','Unit quiz','Term 2 assessment'])[w], (date '2026-09-11' + (w * 9))::timestamptz, 20, null) returning id into cw;
      insert into classroom_submissions (school_id, coursework_id, student_id, state, late, points, graded_at, turned_in_at)
        select demo, cw, x.student_id, 'returned', random() < 0.08, round((9 + random() * 11)::numeric, 0), (date '2026-09-12' + (w * 9))::timestamptz, (date '2026-09-11' + (w * 9))::timestamptz
        from enrolments x where x.group_id = t.gid and x.status = 'active' and not x.is_taster;
    end loop;
  end loop;
  -- a report round being written: some submitted, some drafts, some approved
  select id into cyc from report_cycles where school_id = demo and status <> 'published' order by comments_due limit 1;
  if cyc is null then
    insert into report_cycles (school_id, academic_year_id, term_id, name, marks_from, marks_to, comments_due, publish_on)
      select demo, t2.academic_year_id, t2.id, 'Term 2 Progress Report', t2.starts_on - 60, t2.ends_on, t2.ends_on - 5, t2.ends_on + 2 from terms t2
      where t2.school_id = demo and t2.number = 2 and t2.academic_year_id = (select id from academic_years where school_id = demo and current_date between starts_on and ends_on)
      returning id into cyc;
  end if;
  insert into report_entries (school_id, cycle_id, student_id, group_id, teacher_id, effort, comment, status, submitted_at)
    select demo, cyc, x.student_id, x.group_id, g.teacher_id,
      case when r < 0.75 then 3 + floor(random() * 3)::int end,
      case when r < 0.75 then st.first_name || (array[' has settled well into this subject and contributes confidently in live lessons.',' works hard and home study tasks are completed on time and to a good standard.',' asks thoughtful questions and is making steady progress.'])[1 + floor(random() * 3)::int]
        || ' To improve, ' || st.first_name || ' should keep reviewing class notes each week.' end,
      (case when r < 0.3 then 'submitted' when r < 0.45 then 'approved' when r < 0.75 then 'draft' else 'todo' end)::report_entry_status, case when r < 0.45 then now() - interval '1 day' end
    from (select x.*, random() as r from enrolments x where x.school_id = demo and x.status = 'active' and not x.is_taster) x
    join students st on st.id = x.student_id join course_groups g on g.id = x.group_id
    on conflict do nothing;
  -- messages between parents and teachers
  for e in select x.student_id, s.parent_id, g.teacher_id, sj.name as subj, row_number() over (order by x.id) as n from enrolments x join students s on s.id = x.student_id
      join course_groups g on g.id = x.group_id join subjects sj on sj.id = g.subject_id where x.school_id = demo and x.status = 'active' and g.teacher_id is not null order by x.id limit 5 loop
    insert into message_threads (school_id, parent_id, teacher_id, student_id, subject, status, created_at, last_message_at, started_by)
      values (demo, e.parent_id, e.teacher_id, e.student_id, (array['Homework question','Missed lesson','Reading list','Worried about the test','Calculator'])[e.n], 'open', now() - (e.n * 2 || ' days')::interval, now() - (e.n * 2 || ' days')::interval, 'parent')
      returning id into th;
    insert into messages (school_id, thread_id, sender, body, created_at) values
      (demo, th, 'parent', (array['Hi, my child found this week’s homework hard. Is there anything we can practise at home?','We’ll miss Wednesday’s lesson for a dentist appointment. Could we catch up?','Could you recommend some reading for the holidays?','They’re anxious about the end-of-term test.','Which calculator should we buy?'])[e.n], now() - (e.n * 2 || ' days')::interval);
    if e.n % 2 = 1 then insert into messages (school_id, thread_id, sender, body, created_at) values (demo, th, 'teacher', 'Thanks for letting me know. I’ve added some practice to Classroom; ten minutes a day is plenty.', now() - (e.n * 2 - 1 || ' days')::interval); end if;
    if e.n = 3 then update message_threads set status = 'closed' where id = th; end if;
  end loop;
  -- reward points
  insert into reward_points (school_id, student_id, teacher_id, group_id, points, reason, awarded_on)
    select demo, x.student_id, g.teacher_id, x.group_id, 1 + floor(random() * 3)::int, (array['Great answer in class','Excellent homework','Helping a classmate','Brilliant effort'])[1 + floor(random() * 4)::int], current_date - floor(random() * 40)::int
    from enrolments x join course_groups g on g.id = x.group_id where x.school_id = demo and x.status = 'active' and not x.is_taster and g.teacher_id is not null and random() < 0.6;
  -- two taster requests with bookings next week
  for e in select le.id as ev, row_number() over (order by le.lesson_date, le.id) as n from lesson_events le join course_groups g on g.id = le.group_id
      where le.school_id = demo and le.lesson_date between current_date + 1 and current_date + 10 and g.status in ('open','priority') order by le.lesson_date limit 2 loop
    insert into taster_requests (school_id, child_name, child_email, parent_first_name, parent_last_name, parent_email, message)
      values (demo, (array['Isaac','Maya'])[e.n], (array['isaac.trial@pupils.example','maya.trial@pupils.example'])[e.n], (array['Helen','Marcus'])[e.n], (array['Carter','Lee'])[e.n], (array['helen.c@example.com','marcus.lee@example.com'])[e.n], 'Looking forward to it!')
      returning id into tr;
    begin insert into taster_bookings (school_id, request_id, lesson_event_id) values (demo, tr, e.ev); exception when others then null; end;
  end loop;
end $$;

revoke all on function reset_demo_school(text) from public;
revoke all on function demo_activity() from public;
grant execute on function reset_demo_school(text) to app_user;
grant execute on function demo_activity() to app_user;
update schools set is_demo = true where slug = 'demo-academy';
