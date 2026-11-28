-- 28 Nov (Alfonso: "I don't see a demo for a solo subscriber"): a second demo school on the Solo plan, Bright Maths Tuition.
-- One person runs it and teaches every class (the demo visitor, shown as Sam Rivers), so the admin dashboard and the
-- teacher's My day are one board, and the menu is the Solo plan's. Made-up families only, like Demo Academy.
--
-- The demo_* helpers (attendance, messages, reports, marking…) were written for Demo Academy. They now work on whichever
-- demo school the caller names with set_config('ose.demo_slug', …, true), Demo Academy when nothing is set.
do $$
declare f record; def text;
begin
  for f in select p.oid from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.proname like 'demo\_%'
      and pg_get_functiondef(p.oid) like '%slug = ''demo-academy''%' loop
    def := replace(pg_get_functiondef(f.oid), 'slug = ''demo-academy''', 'slug = coalesce(nullif(current_setting(''ose.demo_slug'', true), ''''), ''demo-academy'')');
    execute def;
  end loop;
end $$;

create or replace function reset_solo_demo(p_source text default 'ohsoed', p_email text default 'visitor@demo.ohsoedtech.com') returns uuid
language plpgsql security definer set search_path = public as $$
declare
  src uuid; demo uuid; y uuid; r record; tid uuid; uid uuid; fid uuid; sid uuid; ki int := 1; gg uuid; lvl record;
  kids text[] := array['Ada','Ben','Cleo','Dev','Elsie','Finn','Grace','Hari','Isla','Jonah','Kit','Lola','Milo','Nia','Otto','Pippa','Quinn','Rosa'];
  adults text[] := array['Claire','James','Priya','Tom','Hannah','Marcus','Sophie','Ade','Laura','Nikhil','Fiona','Gareth','Mei'];
  surn text[] := array['Ashdown','Bramley','Calder','Dunmore','Ellery','Fenwick','Garland','Hollis','Ingram','Jessop','Kerridge','Linford','Marlow'];
begin
  select id into src from schools where slug = p_source;
  if src is null then raise exception 'source school % not found', p_source; end if;
  delete from schools where slug = 'demo-solo';
  insert into schools (slug, name, brand, is_demo, plan, timezone, currency, taster_places_per_lesson, few_places_at, almost_full_at)
    select 'demo-solo', 'Bright Maths Tuition', '{"primary":"#3b2a6b","accent":"#f2b84b"}'::jsonb, true, 'solo', timezone, currency, taster_places_per_lesson, few_places_at, almost_full_at from schools where id = src
    returning id into demo;
  perform setseed(0.31);

  -- the school year, terms, levels, subjects and prices, as in Demo Academy (from OH-SO ED's set-up)
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
  insert into subjects (id, school_id, name, colour, short_name) select (select new from m where old = s.id), demo, name, colour, short_name from subjects s where school_id = src;
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
  insert into tutoring_rates (school_id, level_id, audience, minutes, price_pence, teacher_pay_pence, valid_from) select demo, (select new from m where old = level_id), audience, minutes, price_pence, teacher_pay_pence, valid_from
    from tutoring_rates where school_id = src;
  insert into attendance_settings select demo, late_grace_minutes, early_grace_minutes, min_minutes, source from attendance_settings where school_id = src;

  -- one person: the owner, who teaches every class (the demo visitor signs in as them)
  insert into users (school_id, email, name, role) values (demo, lower(p_email), 'Sam Rivers', 'school_admin') returning id into uid;
  insert into teachers (school_id, user_id, designation, bio, slug, sort_order) values (demo, uid, 'Maths teacher and founder', 'An example teacher for the Solo demo school.', 'sam-rivers', 1) returning id into tid;
  insert into teacher_subjects select tid, (select new from m where old = ts.level_id), (select new from m where old = ts.subject_id) from (select distinct level_id, subject_id from teacher_subjects ts
    join subjects sj on sj.id = ts.subject_id where sj.school_id = src and sj.name ilike 'maths%') ts on conflict do nothing;

  -- Maths classes only (no A-Level), all taught by the owner
  insert into m select g.id, gen_random_uuid() from course_groups g join subjects sj on sj.id = g.subject_id join levels l on l.id = g.level_id
    where g.school_id = src and g.academic_year_id in (select old from m) and g.status <> 'closed' and sj.name ilike 'maths%' and l.name <> 'A-Level';
  insert into course_groups (id, school_id, academic_year_id, level_id, subject_id, price_plan_id, teacher_id, code, capacity, lesson_minutes, status, waitlist_threshold, priority_hours, description, capacity_mode, sticky_label)
    select (select new from m where old = g.id), demo, (select new from m where old = academic_year_id), (select new from m where old = level_id), (select new from m where old = subject_id),
      (select new from m where old = price_plan_id), tid, code, 8, lesson_minutes, case when status = 'hidden' then 'open'::group_status else status end, waitlist_threshold, priority_hours, description, capacity_mode, sticky_label
    from course_groups g where g.id in (select old from m) and g.school_id = src;
  insert into lesson_slots (school_id, academic_year_id, group_id, teacher_id, weekday, starts_at, ends_at)
    select demo, (select new from m where old = s.academic_year_id), (select new from m where old = s.group_id), tid, weekday, starts_at, ends_at
    from lesson_slots s where s.group_id in (select old from m) and s.one_off_on is null;

  -- a dozen families, each child in the Maths class for their level
  select id into y from academic_years where school_id = demo and current_date between starts_on and ends_on;
  for i in 1..13 loop
    insert into parents (school_id, first_name, last_name, email, phone, heard_about, marketing_opt_in, created_at)
      values (demo, adults[i], surn[i], lower(adults[i] || '.' || surn[i] || '@example.com'), '07700 900' || lpad((300 + i * 7)::text, 3, '0'),
        (array['Word of mouth','Google search','Facebook group','Home-ed group'])[1 + i % 4], i % 4 <> 3, '2025-08-20'::date + (i * 9 || ' days')::interval)
      returning id into fid;
    for c in 1..(case when i % 4 = 0 then 2 else 1 end) loop
      exit when ki > array_length(kids, 1);
      select l.* into lvl from levels l where l.school_id = demo and exists (select 1 from course_groups g where g.level_id = l.id and g.school_id = demo and g.academic_year_id = y
        and g.status in ('open','priority') and exists (select 1 from lesson_slots s where s.group_id = g.id)) order by random() limit 1;
      insert into students (school_id, parent_id, first_name, last_name, email, google_account_confirmed, date_of_birth)
        values (demo, fid, kids[ki], surn[i], lower(kids[ki] || '.' || surn[i] || '@pupils.example'), true, make_date(extract(year from current_date)::int - coalesce(lvl.min_age, 12) - 1, 1 + (ki % 12), 1 + (ki % 27)))
        returning id into sid;
      ki := ki + 1;
      select g.id into gg from course_groups g where g.school_id = demo and g.level_id = lvl.id and g.academic_year_id = y and g.status in ('open','priority')
        and exists (select 1 from lesson_slots s where s.group_id = g.id) order by random() limit 1;
      begin
        insert into enrolments (school_id, student_id, group_id, status, list_price_pence, allow_clash, enrolled_at, source, admin_note)
          values (demo, sid, gg, 'active', 0, true, '2026-08-04'::date + (floor(random() * 30) || ' days')::interval, 'demo',
            'TechSaga terms paid: ' || (select string_agg(case when t2.bills_on <= current_date then '1' else '0' end, '' order by t2.number) from terms t2 where t2.academic_year_id = y));
      exception when others then null;
      end;
    end loop;
  end loop;
  update enrolments set starts_on = enrolled_at::date where school_id = demo;
  insert into enquiries (school_id, kind, name, email, levels, heard_about, message, handled_at, created_at) values
    (demo, 'taster', 'Helen Carter', 'helen.c@example.com', '{KS3}', 'Facebook group', 'Could my daughter try a Maths taster this month?', null, now() - interval '2 days'),
    (demo, 'contact', 'Arjun Patel', 'arjun.p@example.com', '{iGCSE}', 'Google search', 'Do you teach the Higher or Foundation iGCSE paper?', null, now() - interval '4 days');
  return demo;
end $$;
revoke all on function reset_solo_demo(text, text) from public;
grant execute on function reset_solo_demo(text, text) to app_user;

-- Taster journeys for the demo schools, so Admin → Tasters shows every stage: enrolled, waiting for the family,
-- not enrolled, booked another date and replied. (Bookings are made on an upcoming lesson, as the booking check
-- requires, then moved to a lesson a couple of weeks ago.) The emails along the way are recorded as sent.
create or replace function demo_taster_journeys() returns void language plpgsql security definer set search_path = public as $$
declare demo uuid; r record; tr uuid; tb uuid; fut uuid; past uuid; pid uuid; sid uuid; gid uuid; i int := 0; ago int;
  kids text[] := array['Theo','Lily','Arjun','Poppy','Ezra']; surn text[] := array['Ashby','Moran','Shah','Lane','Cole'];
  pars text[] := array['Kate','Ben','Ravi','Emma','Joel']; plan text[] := array['enrolled','waiting','lost','rebooked','replied'];
begin
  select id into demo from schools where slug = coalesce(nullif(current_setting('ose.demo_slug', true), ''), 'demo-academy') and is_demo; if demo is null then return; end if;
  for r in select g.id as gid, g.level_id, g.academic_year_id from course_groups g where g.school_id = demo and g.status in ('open', 'priority')
      and exists (select 1 from lesson_events e where e.group_id = g.id and e.lesson_date between current_date - 25 and current_date - 9)
      and exists (select 1 from lesson_events e where e.group_id = g.id and e.lesson_date > current_date + 1 and e.status = 'scheduled')
      order by g.code limit 5 loop
    i := i + 1; ago := case plan[i] when 'lost' then 23 when 'waiting' then 10 else 16 end;
    select e.id into past from lesson_events e where e.group_id = r.gid and e.lesson_date <= current_date - ago order by e.lesson_date desc limit 1;
    select e.id into fut from lesson_events e where e.group_id = r.gid and e.lesson_date > current_date + 1 and e.status = 'scheduled'
      and (select count(*) from taster_bookings b where b.lesson_event_id = e.id and b.status <> 'cancelled') < 1 order by e.lesson_date limit 1;
    continue when past is null or fut is null;
    insert into taster_requests (school_id, child_name, child_email, parent_first_name, parent_last_name, parent_email, source, created_at)
      values (demo, kids[i] || ' ' || surn[i], lower(kids[i] || '.' || surn[i] || '@pupils.example'), pars[i], surn[i], lower(pars[i] || '.' || surn[i] || '@example.com'), 'website', now() - ((ago + 6) || ' days')::interval)
      returning id into tr;
    insert into taster_bookings (school_id, request_id, lesson_event_id) values (demo, tr, fut) returning id into tb;
    update taster_bookings set lesson_event_id = past, created_at = now() - ((ago + 6) || ' days')::interval,
      status = (case when plan[i] = 'rebooked' then 'no_show' else 'attended' end)::taster_status, classroom_state = 'removed', invited_at = now() - ((ago + 6) || ' days')::interval, removed_at = now() - ((ago - 3) || ' days')::interval
      where id = tb;
    insert into automation_sends (school_id, key, ref, to_email, scheduled_for, created_at, status)
      select demo, k, tb::text, e, null, now() - ((ago + 6) || ' days')::interval + interval '3 minutes', 'sent'
      from (values ('taster_booked', lower(pars[i] || '.' || surn[i] || '@example.com')), ('taster_student_welcome', lower(kids[i] || '.' || surn[i] || '@pupils.example'))) v(k, e)
      on conflict do nothing;
    insert into automation_sends (school_id, key, ref, to_email, scheduled_for, created_at, status)
      values (demo, 'taster_link', tb::text, lower(pars[i] || '.' || surn[i] || '@example.com'), now() - (ago || ' days')::interval - interval '30 minutes', now() - ((ago + 1) || ' days')::interval, 'sent'),
             (demo, case when plan[i] = 'rebooked' then 'taster_missed' else 'taster_follow_up' end, tb::text, lower(pars[i] || '.' || surn[i] || '@example.com'),
               now() - (ago || ' days')::interval + interval '3 hours', now() - (ago || ' days')::interval, 'sent')
      on conflict do nothing;
    if plan[i] = 'lost' then   -- the last reminder a week later, and no reply since
      insert into automation_sends (school_id, key, ref, to_email, scheduled_for, created_at, status)
        values (demo, 'taster_follow_up_final', tb::text, lower(pars[i] || '.' || surn[i] || '@example.com'), null, now() - ((ago - 7) || ' days')::interval, 'sent') on conflict do nothing;
    elsif plan[i] = 'enrolled' then   -- they booked the course: a family account, the child, and a place
      insert into parents (school_id, first_name, last_name, email, marketing_opt_in, created_at) values (demo, pars[i], surn[i], lower(pars[i] || '.' || surn[i] || '@example.com'), true, now() - ((ago - 2) || ' days')::interval)
        returning id into pid;
      insert into students (school_id, parent_id, first_name, last_name, email, google_account_confirmed) values (demo, pid, kids[i], surn[i], lower(kids[i] || '.' || surn[i] || '@pupils.example'), true) returning id into sid;
      update taster_requests set parent_id = pid, student_id = sid where id = tr;
      begin
        insert into enrolments (school_id, student_id, group_id, status, list_price_pence, enrolled_at, starts_on, source)
          values (demo, sid, r.gid, 'active', 0, now() - ((ago - 2) || ' days')::interval, current_date - (ago - 2), 'demo');
      exception when others then null;
      end;
    elsif plan[i] = 'rebooked' then   -- missed it, then chose another date
      insert into taster_requests (school_id, child_name, child_email, parent_first_name, parent_last_name, parent_email, source, created_at)
        values (demo, kids[i] || ' ' || surn[i], lower(kids[i] || '.' || surn[i] || '@pupils.example'), pars[i], surn[i], lower(pars[i] || '.' || surn[i] || '@example.com'), 'website', now() - ((ago - 2) || ' days')::interval)
        returning id into tr;
      select e.id into fut from lesson_events e join course_groups g on g.id = e.group_id where g.school_id = demo and g.id <> r.gid and g.level_id = r.level_id and g.status in ('open', 'priority')
        and e.lesson_date > current_date + 1 and e.status = 'scheduled' order by e.lesson_date limit 1;
      if fut is not null then begin insert into taster_bookings (school_id, request_id, lesson_event_id, created_at) values (demo, tr, fut, now() - ((ago - 2) || ' days')::interval); exception when others then null; end; end if;
    elsif plan[i] = 'replied' then
      insert into inbox_messages (school_id, gmail_id, thread_id, from_name, from_email, subject, snippet, received_at, kind)
        values (demo, 'demo-taster-' || tb, 'demo-taster-' || tb, pars[i] || ' ' || surn[i], lower(pars[i] || '.' || surn[i] || '@example.com'), 'Re: How did ' || kids[i] || '’s taster go?',
          kids[i] || ' loved it! Could we start after half term?', now() - ((ago - 1) || ' days')::interval, 'taster');
    end if;
  end loop;
  -- the confirmation emails for the tasters still to come
  insert into automation_sends (school_id, key, ref, to_email, created_at, status)
    select demo, 'taster_booked', b.id::text, r2.parent_email, b.created_at + interval '3 minutes', 'sent' from taster_bookings b join taster_requests r2 on r2.id = b.request_id
    where b.school_id = demo and b.status = 'booked' on conflict do nothing;
  insert into automation_sends (school_id, key, ref, to_email, created_at, status)
    select demo, 'taster_student_welcome', b.id::text, r2.child_email, b.created_at + interval '3 minutes', 'sent' from taster_bookings b join taster_requests r2 on r2.id = b.request_id
    where b.school_id = demo and b.status = 'booked' on conflict do nothing;
end $$;
revoke all on function demo_taster_journeys() from public;
grant execute on function demo_taster_journeys() to app_user;
