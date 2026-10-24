-- Database checks. Run against a fresh database after 001–003; any failed check raises an error.
\set ON_ERROR_STOP on

-- price plan totals match the old admin's Finance page
do $$ begin
  assert (select total_pence from price_plans where name = 'KS3') = 27200, 'KS3 total should be £272';
  assert (select total_pence from price_plans where name = 'Pre-GCSE') = 40800, 'Pre-GCSE total should be £408';
  assert (select total_pence from price_plans where name = 'Pre-GCSE core') = 81600, 'Pre-GCSE core (e.g. Science) is £816 on the live site';
  assert (select ends_at - starts_at from lesson_slots l join course_groups g on g.id = l.group_id where g.code = 'PSci26/1' limit 1) = interval '45 minutes', 'Pre-GCSE lessons are 45 minutes';
  assert (select total_pence from price_plans where name = 'GCSE 1-year') = 121800, 'GCSE 1-year total should be £1,218';
  assert (select sum(total_pence) from price_plans where name like 'GCSE 2-year%') = 179200, 'GCSE 2-year course should total £1,792';
  assert (select count(*) from course_groups) = 23, '23 classes seeded';
end $$;

-- every class has exactly as many weekly lessons as its plan says
do $$ begin
  assert not exists (
    select 1 from course_groups g join price_plans p on p.id = g.price_plan_id
    where (select count(*) from lesson_slots l where l.group_id = g.id) <> p.lessons_per_week
  ), 'a class has the wrong number of weekly lessons';
  assert (select count(*) from level_clashes) = 0, 'seed timetable should have no clashes within a level';
end $$;

-- the database refuses to double-book a teacher
do $$
declare g uuid; t uuid; sc uuid; y uuid; begin
  select id, teacher_id, school_id, academic_year_id into g, t, sc, y from course_groups where code = 'PMat26/1';
  begin
    insert into lesson_slots (school_id, academic_year_id, group_id, teacher_id, weekday, starts_at, ends_at)
      values (sc, y, g, t, 2, '13:30', '14:30');   -- Becky already teaches KS3 Maths Tue 13:00-14:00
    raise exception 'teacher double-booking was allowed';
  exception when exclusion_violation then null; end;
  -- back-to-back lessons are fine
  insert into lesson_slots (school_id, academic_year_id, group_id, teacher_id, weekday, starts_at, ends_at)
    values (sc, y, g, t, 2, '15:00', '16:00');
  delete from lesson_slots where group_id = g and weekday = 2 and starts_at = '15:00';
end $$;

-- a clash between two classes at the same level shows up as a warning
do $$
declare g uuid; sc uuid; y uuid; begin
  select id, school_id, academic_year_id into g, sc, y from course_groups where code = 'PGeo26/1';
  insert into lesson_slots (school_id, academic_year_id, group_id, weekday, starts_at, ends_at) values (sc, y, g, 3, '10:00', '10:45'); -- overlaps Pre-GCSE Maths Wed 10:30-11:15
  assert (select count(*) from level_clashes) = 1, 'level clash should be reported';
  delete from lesson_slots where group_id = g and weekday = 3;
end $$;

-- a student can't be enrolled into overlapping classes unless an admin allows it
do $$
declare st uuid; sc uuid; a uuid; b uuid; begin
  select id, school_id into st, sc from students where first_name = 'Cleo';
  select id into a from course_groups where code = 'GEng26/1';   -- Mon 11:30
  select id into b from course_groups where code = 'GLit26/1';   -- Mon 13:00: no clash
  insert into enrolments (school_id, student_id, group_id, status, list_price_pence) values (sc, st, a, 'active', 121800);
  insert into enrolments (school_id, student_id, group_id, status, list_price_pence) values (sc, st, b, 'active', 121800);
  update lesson_slots set starts_at = '11:00', ends_at = '12:00', teacher_id = null where group_id = b and weekday = 1; -- now overlaps English (cover teacher, so no teacher clash)
  begin
    insert into enrolments (school_id, student_id, group_id, status, list_price_pence)
      values (sc, st, (select id from course_groups where code = 'GBio26/1'), 'active', 121800);  -- Bio Mon 09:30: fine
  end;
  assert exists (select 1 from student_clashes(st, b)), 'moved Literature lesson should clash with English';
  update enrolments set status = 'cancelled' where student_id = st and group_id = b;
  begin
    update enrolments set status = 'active' where student_id = st and group_id = b;
    raise exception 'clashing enrolment was allowed';
  exception when exclusion_violation then null; end;
  update enrolments set status = 'active', allow_clash = true where student_id = st and group_id = b;  -- admin override
  update lesson_slots set starts_at = '13:00', ends_at = '14:00', teacher_id = (select teacher_id from course_groups where id = b) where group_id = b and weekday = 1;
  delete from enrolments where student_id = st;
end $$;

-- a student cannot hold two live enrolments in the same class
do $$
declare st uuid; g uuid; sc uuid; begin
  select id, school_id into st, sc from students where first_name = 'Ada';
  select id into g from course_groups where code = 'KMat26/1';
  insert into enrolments (school_id, student_id, group_id, status, list_price_pence) values (sc, st, g, 'active', 27200);
  begin
    insert into enrolments (school_id, student_id, group_id, status, list_price_pence) values (sc, st, g, 'pending', 27200);
    raise exception 'duplicate live enrolment was allowed';
  exception when unique_violation then null; end;
  -- a cancelled enrolment does not block re-enrolling
  update enrolments set status = 'cancelled' where student_id = st and group_id = g;
  insert into enrolments (school_id, student_id, group_id, status, list_price_pence) values (sc, st, g, 'active', 27200);
end $$;

-- refunds can never exceed the amount charged
do $$
declare e uuid; t uuid; sc uuid; begin
  select id, school_id into e, sc from enrolments where status = 'active' limit 1;
  select id into t from terms where number = 1 and school_id = sc;
  insert into instalments (school_id, enrolment_id, term_id, due_on, amount_pence, status) values (sc, e, t, '2026-09-01', 5440, 'paid');
  begin
    update instalments set refunded_pence = 6000 where enrolment_id = e;
    raise exception 'over-refund was allowed';
  exception when check_violation then null; end;
end $$;

-- payroll: lessons generated from the timetable, paid per lesson by level, on the Friday after term ends
do $$
declare t1 uuid; becky uuid; jade uuid; ev uuid; n int; run uuid; begin
  select id into t1 from terms where number = 1 and school_id = (select id from schools where slug = 'ohsoed');
  select t.id into becky from teachers t join users u on u.id = t.user_id where u.name = 'Becky Randle';
  select t.id into jade from teachers t join users u on u.id = t.user_id where u.name = 'Jade Hicks';
  assert term_pay_date(t1) = '2026-10-23', 'Term 1 ends Fri 16 Oct, so pay day is Fri 23 Oct';
  n := generate_lesson_events(t1);
  assert n > 0, 'lessons should be generated';
  assert generate_lesson_events(t1) = 0, 'generating twice must not duplicate lessons';
  assert (select count(*) from lesson_events e join course_groups g on g.id = e.group_id where g.code = 'KMat26/1' and e.term_id = t1) = 6,
    'KS3 Maths (Tuesdays) has 6 lessons in Term 1';
  assert (select count(*) from lesson_events e join course_groups g on g.id = e.group_id where g.code = 'GMat25' and e.term_id = t1) = 12,
    'a class closed to new bookings is still taught: year-2 Maths has 12 lessons';
end $$;

do $$
declare t1 uuid; becky uuid; jade uuid; ks3 int; pre int; gc int; run uuid; begin
  select id into t1 from terms where number = 1 and school_id = (select id from schools where slug = 'ohsoed');
  select t.id into becky from teachers t join users u on u.id = t.user_id where u.name = 'Becky Randle';
  select t.id into jade from teachers t join users u on u.id = t.user_id where u.name = 'Jade Hicks';
  update lesson_events set status = 'taught' where term_id = t1;
  -- Becky's Term 1 pay: count her lessons by level and check the view prices them at £40 / £45 / £50
  select count(*) filter (where l.name = 'KS3'), count(*) filter (where l.name = 'Pre-GCSE'), count(*) filter (where l.name = 'iGCSE')
    into ks3, pre, gc
    from lesson_events e join course_groups g on g.id = e.group_id join levels l on l.id = g.level_id where e.teacher_id = becky and e.term_id = t1;
  assert (select sum(pay_pence) from teacher_term_pay where teacher_id = becky and term_id = t1) = ks3 * 4000 + pre * 4500 + gc * 5000,
    'Becky is paid £40 / £45 / £50 per KS3 / Pre-GCSE / GCSE lesson';
  -- cover: Becky covers one of Jade's KS3 History lessons, so the pay moves to Becky
  update lesson_events set teacher_id = becky, note = 'Cover for Jade'
    where id = (select e.id from lesson_events e join course_groups g on g.id = e.group_id where g.code = 'KHis26/1' and e.term_id = t1 order by lesson_date limit 1);
  assert (select sum(pay_pence) from teacher_term_pay where teacher_id = becky and term_id = t1) = ks3 * 4000 + pre * 4500 + gc * 5000 + 4000, 'cover lesson is paid to Becky';
  -- a cancelled lesson isn't paid
  update lesson_events set status = 'cancelled', note = 'Teacher ill'
    where id = (select e.id from lesson_events e join course_groups g on g.id = e.group_id where g.code = 'PMat26/1' and e.term_id = t1 order by lesson_date limit 1);
  assert (select sum(pay_pence) from teacher_term_pay where teacher_id = becky and term_id = t1) = ks3 * 4000 + (pre - 1) * 4500 + gc * 5000 + 4000, 'cancelled lesson is not paid';
  -- a teacher-specific rate overrides the level rate
  insert into pay_rates (school_id, level_id, teacher_id, rate_pence, valid_from)
    select school_id, level_id, jade, 4200, '2026-09-01' from course_groups where code = 'KHis26/1';
  assert (select pay_pence from teacher_term_pay where teacher_id = jade and term_id = t1 and level = 'KS3')
       = 4200 * (select lessons from teacher_term_pay where teacher_id = jade and term_id = t1 and level = 'KS3'), 'Jade''s own KS3 rate applies';
  delete from pay_rates where teacher_id = jade;
  -- pay run: built as a draft, then locked once approved
  run := build_pay_run(t1);
  assert (select pay_date from pay_runs where id = run) = '2026-10-23', 'pay run dated Fri 23 Oct';
  assert (select count(*) from pay_run_lines where pay_run_id = run) = 4, 'one line per teacher';
  assert (select sum(gross_pence) from pay_run_lines where pay_run_id = run) = (select sum(pay_pence) from teacher_term_pay where term_id = t1), 'run total matches lessons taught';
  update pay_runs set status = 'approved', approved_at = now() where id = run;
  begin
    perform build_pay_run(t1);
    raise exception 'an approved pay run was rebuilt';
  exception when raise_exception then
    if sqlerrm not like 'this pay run is already%' then raise; end if;
  end;
end $$;

-- reports: Progress comes from Classroom marks via the grading key; grades are GCSE-only; comments needed to submit
do $$
declare sc uuid; st uuid; ks3 uuid; gc uuid; cyc uuid; e1 uuid; e2 uuid; begin
  select id into sc from schools where slug = 'ohsoed';
  assert progress_score(sc, 100) = 5 and progress_score(sc, 95) = 5 and progress_score(sc, 94.9) = 4 and progress_score(sc, 70) = 4
     and progress_score(sc, 69.9) = 3 and progress_score(sc, 50) = 3 and progress_score(sc, 45) = 2 and progress_score(sc, 39.9) = 1 and progress_score(sc, 0) = 1,
     'grading key bands: 95+ = 5, 70-94 = 4, 50-69 = 3, 40-49 = 2, under 40 = 1';
  select id into st from students where first_name = 'Ben';
  select id into ks3 from course_groups where code = 'KMat26/1';
  select id into gc from course_groups where code = 'GBio26/1';
  select id into cyc from report_cycles where name = 'Term 1 Progress Report';
  insert into classroom_coursework (school_id, group_id, coursework_id, title, due_at, max_points) values
    (sc, ks3, 'cw1', 'Fractions quiz', '2026-09-17', 20), (sc, ks3, 'cw2', 'Home study 2', '2026-09-24', 10),
    (sc, ks3, 'cw3', 'Unit test', '2026-10-08', 50), (sc, ks3, 'cw0', 'Holiday work (last year)', '2026-06-30', 10),
    (sc, ks3, 'cw4', 'Home study 4', '2026-10-08', 10), (sc, ks3, 'cw5', 'Home study 5', now() + interval '3 days', 10);
  insert into classroom_submissions (school_id, coursework_id, student_id, state, points, graded_at)
    select sc, cw.id, st, x.state::submission_state, x.pts, x.graded::timestamptz from (values
      ('cw1', 'returned', 16, '2026-09-18'), ('cw2', 'returned', 8, '2026-09-25'), ('cw3', 'returned', 41, '2026-10-09'),
      ('cw0', 'returned', 1, '2026-07-01'), ('cw4', 'assigned', null, null), ('cw5', 'assigned', null, null)) as x(cid, state, pts, graded)
    join classroom_coursework cw on cw.coursework_id = x.cid;
  assert (select count(*) from student_assignments where student_id = st and parent_status = 'overdue') = 1, 'Home study 4 is overdue';
  assert (select count(*) from student_assignments where student_id = st and parent_status = 'due') = 1, 'Home study 5 is due';
  assert (select count(*) from student_assignments where student_id = st and parent_status = 'submitted') = 4, 'four handed in';
  insert into report_entries (school_id, cycle_id, student_id, group_id) values (sc, cyc, st, ks3) returning id into e1;
  assert (select avg_pct from report_lines where id = e1) = 80.7, 'average of this term''s marks only (80, 80, 82)';
  assert (select marked from report_lines where id = e1) = 3, 'work outside the report window is ignored';
  assert (select progress from report_lines where id = e1) = 4, '80.7% is Secure (4)';
  update report_entries set progress_override = 5 where id = e1;
  assert (select progress from report_lines where id = e1) = 5, 'teacher override wins';
  -- can't submit without effort and a real comment
  begin
    update report_entries set status = 'submitted' where id = e1;
    raise exception 'empty report was submitted';
  exception when check_violation then null; end;
  update report_entries set effort = 4, comment = 'Ben works carefully and shows his method clearly.', status = 'submitted' where id = e1;
  -- working/predicted grades only on GCSE courses
  begin
    update report_entries set working_grade = 5 where id = e1;
    raise exception 'KS3 entry accepted a GCSE grade';
  exception when check_violation then null; end;
  insert into report_entries (school_id, cycle_id, student_id, group_id, working_grade, predicted_grade) values (sc, cyc, st, gc, 6, 7) returning id into e2;
  delete from report_entries where id in (e1, e2);
  delete from classroom_coursework where coursework_id like 'cw%';
end $$;

-- waiting list: the 5th sign-up invites everyone and starts a 48-hour priority window; then the course opens to all
do $$
declare g uuid; sc uuid; begin
  select id, school_id into g, sc from course_groups where code = 'KSci26/1';
  insert into waitlist_entries (school_id, group_id, parent_name, child_name, email)
    select sc, g, 'Parent ' || i, 'Child ' || i, 'wl' || i || '@example.test' from generate_series(1, 4) i;
  assert (select status from course_groups where id = g) = 'waitlist', '4 sign-ups: still collecting';
  assert (select count(*) from waitlist_entries where group_id = g and emailed_at is not null) = 0, 'nobody emailed yet';
  assert not can_book(g, 'wl1@example.test'), 'nobody can book while collecting';
  insert into waitlist_entries (school_id, group_id, parent_name, child_name, email) values (sc, g, 'Parent 5', 'Child 5', 'wl5@example.test');
  assert (select status from course_groups where id = g) = 'priority', '5th sign-up starts priority booking';
  assert (select priority_until - now() from course_groups where id = g) between interval '47 hours 59 minutes' and interval '48 hours', '48-hour window';
  assert (select count(*) from waitlist_entries where group_id = g and emailed_at is not null) = 5, 'all 5 families invited';
  assert can_book(g, 'wl3@example.test'), 'invited family can book during priority';
  assert not can_book(g, 'public@example.test'), 'public can''t book during priority';
  assert open_expired_priority() = 0, 'window not over yet';
  update course_groups set priority_until = now() - interval '1 minute' where id = g;
  assert open_expired_priority() = 1, 'one course reached the end of its window';
  assert (select status from course_groups where id = g) = 'open', 'course opens to everyone after 48 hours';
  assert can_book(g, 'public@example.test'), 'anyone can book once open';
  delete from waitlist_entries where group_id = g;
  update course_groups set status = 'waitlist', priority_until = null where id = g;
end $$;

-- Classroom: only students who accepted their invitation get the join-the-lesson reminder
do $$
declare sc uuid; g uuid; ada uuid; ben uuid; ev uuid; begin
  select id, school_id into g, sc from course_groups where code = 'KEng26/1';
  select id into ada from students where first_name = 'Ada';
  select id into ben from students where first_name = 'Ben';
  update students set email = 'ada@student.example', google_account_confirmed = true where id = ada;
  update students set email = 'ben@student.example', google_account_confirmed = true where id = ben;
  insert into enrolments (school_id, student_id, group_id, status, list_price_pence) values (sc, ada, g, 'active', 27200), (sc, ben, g, 'active', 27200);
  insert into classroom_memberships (school_id, group_id, student_id, state, joined_at) values (sc, g, ada, 'joined', now());
  insert into classroom_memberships (school_id, group_id, student_id) values (sc, g, ben);
  select id into ev from lesson_events where group_id = g order by lesson_date limit 1;
  assert (select reminder from lesson_reminder_recipients(ev) where student_id = ada) = 'join_lesson', 'joined student gets the join link';
  assert (select reminder from lesson_reminder_recipients(ev) where student_id = ben) = 'accept_invitation', 'invited student is asked to accept first';
  begin
    update classroom_memberships set state = 'joined' where student_id = ben and group_id = g;
    raise exception 'joined without a joined_at time';
  exception when check_violation then null; end;
  update classroom_memberships set state = 'joined', joined_at = now() where student_id = ben and group_id = g;
  assert (select reminder from lesson_reminder_recipients(ev) where student_id = ben) = 'join_lesson', 'after accepting, Ben gets the join link';
  delete from classroom_memberships where group_id = g; delete from enrolments where group_id = g and student_id in (ada, ben);
end $$;

-- one welcome email lists every class the student was booked onto
do $$
declare sc uuid; ada uuid; g1 uuid; g2 uuid; g3 uuid; begin
  select id, school_id into ada, sc from students where first_name = 'Ada';
  select id into g1 from course_groups where code = 'KEng26/1';
  select id into g2 from course_groups where code = 'KMat26/1';
  select id into g3 from course_groups where code = 'KSci26/1';
  insert into classroom_memberships (school_id, group_id, student_id) values (sc, g1, ada), (sc, g2, ada), (sc, g3, ada);
  assert (select count(*) from student_pending_invitations(ada, true)) = 3, 'three classes in one welcome email';
  assert (select string_agg(course_name, ', ') from student_pending_invitations(ada, true)) = 'KS3 English Language, KS3 Maths, KS3 Science', 'courses listed by name';
  update classroom_memberships set emailed_at = now() where student_id = ada;
  assert (select count(*) from student_pending_invitations(ada, true)) = 0, 'already-emailed invitations are not sent twice';
  update classroom_memberships set state = 'joined', joined_at = now() where student_id = ada and group_id = g1;
  assert (select count(*) from student_pending_invitations(ada)) = 2, 'the reminder lists only the classes still to accept';
  delete from classroom_memberships where student_id = ada and group_id in (g1, g2, g3);
end $$;

-- 1:1 tutoring: enrolled families pay the enrolled rate, everyone else the public rate; no clashes
do $$
declare sc uuid; ks3 uuid; maths uuid; becky uuid; pub uuid; fam uuid; ada uuid; g uuid; b1 uuid; t2 uuid; run uuid; lesson record; begin
  select id into sc from schools where slug = 'ohsoed';
  select id into ks3 from levels where school_id = sc and name = 'KS3';
  select id into maths from subjects where school_id = sc and name = 'Maths';
  select t.id into becky from teachers t join users u on u.id = t.user_id where u.name = 'Becky Randle';
  select id into t2 from terms where school_id = sc and number = 2;
  perform generate_lesson_events(t2);
  -- a website visitor (no enrolments) and a family with a child on a course
  insert into parents (school_id, first_name, last_name, email) values (sc, 'Pat', 'Visitor', 'visitor@example.test') returning id into pub;
  select id, parent_id into ada, fam from students where first_name = 'Ada';
  select id into g from course_groups where code = 'KMat26/1';
  if not is_enrolled_family(fam) then
    insert into enrolments (school_id, student_id, group_id, status, list_price_pence) values (sc, ada, g, 'active', 27200);
  end if;
  assert (tutoring_rate(pub, ks3, 45)).price_pence = 3500, 'public KS3 1:1 rate is £35 (example)';
  assert (tutoring_rate(fam, ks3, 45)).price_pence = 3000, 'enrolled KS3 1:1 rate is £30 (example)';
  -- open times: KS3 Maths is Becky's, Tue 15:30-18:00 and Thu 16:00-18:00, every 30 minutes
  assert (select count(*) from tutoring_open_times(ks3, maths, '2026-11-03', 1)) = 4, 'Tue 3 Nov, 45-minute 1:1s: 15:30, 16:00, 16:30, 17:00';
  assert not exists (select 1 from tutoring_open_times(ks3, maths, '2026-11-02', 7) where teacher_id <> becky), 'only teachers of the subject are offered';
  -- the price comes from the rate card, whatever the website sends
  insert into tutoring_bookings (school_id, teacher_id, level_id, subject_id, parent_id, student_name, starts_at, minutes, price_pence, teacher_pay_pence)
    values (sc, becky, ks3, maths, pub, 'Sam Visitor', '2026-11-03 16:00 Europe/London', 45, 1, 0) returning id into b1;
  assert (select price_pence from tutoring_bookings where id = b1) = 3500 and (select audience from tutoring_bookings where id = b1) = 'public', 'public price applied';
  assert (select count(*) from tutoring_open_times(ks3, maths, '2026-11-03', 1)) = 1, 'a held slot (and the overlapping half hours) are no longer offered';
  begin
    insert into tutoring_bookings (school_id, teacher_id, level_id, subject_id, parent_id, student_id, student_name, starts_at, minutes, price_pence, teacher_pay_pence)
      values (sc, becky, ks3, maths, fam, ada, 'Ada Example', '2026-11-03 16:30 Europe/London', 45, 0, 0);
    raise exception 'double-booked a teacher';
  exception when exclusion_violation then null; end;
  insert into tutoring_bookings (school_id, teacher_id, level_id, subject_id, parent_id, student_id, student_name, starts_at, minutes, price_pence, teacher_pay_pence, status)
    values (sc, becky, ks3, maths, fam, ada, 'Ada Example', '2026-11-05 16:00 Europe/London', 45, 0, 0, 'booked');
  assert (select price_pence from tutoring_bookings where student_id = ada) = 3000, 'enrolled rate applied';
  begin
    insert into tutoring_bookings (school_id, teacher_id, level_id, subject_id, parent_id, student_name, starts_at, minutes, price_pence, teacher_pay_pence)
      values (sc, becky, ks3, maths, pub, 'Sam Visitor', '2026-11-03 13:00 Europe/London', 45, 0, 0);
    raise exception 'booked outside availability';
  exception when raise_exception then if sqlerrm not like '%not available%' then raise; end if; end;
  -- a lesson inside availability blocks the 1:1: put a lesson in Becky's Tuesday 1:1 time and check
  select ev.id, sl.id as slot into lesson from lesson_events ev join lesson_slots sl on sl.id = ev.slot_id
    where ev.teacher_id = becky and ev.term_id = t2 and sl.weekday = 2 order by ev.lesson_date limit 1;
  assert teacher_busy(becky, tstzrange('2026-11-03 13:00 Europe/London', '2026-11-03 13:30 Europe/London')), 'Becky''s Tuesday 13:00 lesson makes her busy';

  -- workshops: free books straight away; paid waits for payment, enrolled families get the lower price; capacity holds
  assert (select places_left from workshop_places where title like 'The Chronicles%') = 20, '20 places';
  insert into workshop_bookings (school_id, workshop_id, parent_id, student_name, student_email)
    select sc, id, pub, 'Sam Visitor', 'sam@student.example' from workshops where slug = 'the-chronicles-of-narnia-workshop';
  assert (select status from workshop_bookings where student_email = 'sam@student.example') = 'booked', 'free workshop is booked at once';
  begin
    insert into workshop_bookings (school_id, workshop_id, parent_id, student_name, student_email)
      select sc, id, pub, 'Sam Visitor', 'sam@student.example' from workshops where slug = 'the-chronicles-of-narnia-workshop';
    raise exception 'same child booked twice';
  exception when unique_violation then null; end;
  insert into workshop_bookings (school_id, workshop_id, parent_id, student_name, student_email)
    select sc, id, fam, 'Ada Example', 'ada@student.example' from workshops where slug = 'gcse-maths-exam-technique';
  insert into workshop_bookings (school_id, workshop_id, parent_id, student_name, student_email)
    select sc, id, pub, 'Sam Visitor', 'sam@student.example' from workshops where slug = 'gcse-maths-exam-technique';
  assert (select b.price_pence from workshop_bookings b join workshops w on w.id = b.workshop_id where w.slug = 'gcse-maths-exam-technique' and b.parent_id = fam) = 1000, 'enrolled price £10';
  assert (select b.price_pence from workshop_bookings b join workshops w on w.id = b.workshop_id where w.slug = 'gcse-maths-exam-technique' and b.parent_id = pub) = 1500, 'public price £15';
  assert (select status from workshop_bookings where parent_id = pub and price_pence = 1500) = 'pending_payment', 'paid workshop waits for payment';
  update workshops set capacity = 2 where slug = 'gcse-maths-exam-technique';
  begin
    insert into workshop_bookings (school_id, workshop_id, parent_id, student_name, student_email)
      select sc, id, pub, 'Another', 'another@student.example' from workshops where slug = 'gcse-maths-exam-technique';
    raise exception 'overbooked a workshop';
  exception when raise_exception then if sqlerrm not like '%full%' then raise; end if; end;
  begin
    update workshops set starts_at = '2026-11-03 13:00 Europe/London' where slug = 'gcse-maths-exam-technique';
    raise exception 'workshop clashed with a lesson';
  exception when raise_exception then if sqlerrm not like '%teaching then%' then raise; end if; end;

  -- payroll: the 1:1 and the workshop Becky taught in Term 2 are paid with her lessons
  update tutoring_bookings set status = 'completed' where id = b1;
  update workshops set status = 'completed' where slug = 'gcse-maths-exam-technique';
  -- a free workshop Becky ran in October half term (between Term 1 and 2) is paid with Term 2
  insert into workshops (school_id, title, slug, teacher_id, starts_at, minutes, teacher_pay_pence, status)
    values (sc, 'Half-term Maths Puzzles', 'half-term-maths', becky, '2026-10-28 10:00 Europe/London', 60, 4000, 'completed');
  run := build_pay_run(t2);
  assert (select extras from pay_run_lines where pay_run_id = run and teacher_id = becky) = 3, 'one 1:1 and two workshops';
  assert (select extras_pence from pay_run_lines where pay_run_id = run and teacher_id = becky) = 2500 + 7500 + 4000, '£25 for the 1:1, £75 and £40 for the workshops';
  assert (select gross_pence - lessons_pence from pay_run_lines where pay_run_id = run and teacher_id = becky) = 14000, 'extras are in the gross';
  delete from pay_runs where id = run; delete from workshops where slug = 'half-term-maths';
  delete from workshop_bookings where parent_id in (pub, fam);
  update workshops set status = 'published', capacity = 12 where slug = 'gcse-maths-exam-technique';
  delete from tutoring_bookings where parent_id in (pub, fam);
  delete from parents where id = pub;
end $$;


-- T&Cs at checkout, and cancelling with notice (KS3 / Pre-GCSE 1 full term, GCSE 2)
do $$
declare sc uuid; par uuid; st uuid; o uuid; ek uuid; eg uuid; gk uuid; gg uuid; doc uuid; ec uuid; begin
  select id into sc from schools where slug = 'ohsoed';
  insert into parents (school_id, first_name, last_name, email, email_verified_at) values (sc, 'Nora', 'Notice', 'nora@example.test', now()) returning id into par;
  insert into students (school_id, parent_id, first_name, last_name, email) values (sc, par, 'Nell', 'Notice', 'nell.notice@gmail.com') returning id into st;
  select id into gk from course_groups where code = 'KLit26/1';
  select id into gg from course_groups where code = 'GBio26/1';
  insert into orders (school_id, parent_id) values (sc, par) returning id into o;
  insert into enrolments (school_id, student_id, group_id, order_id, status, list_price_pence) values (sc, st, gk, o, 'active', 27200) returning id into ek;
  insert into enrolments (school_id, student_id, group_id, order_id, status, list_price_pence, allow_clash) values (sc, st, gg, o, 'active', 121800, true) returning id into eg;
  insert into instalments (school_id, enrolment_id, term_id, due_on, amount_pence, status)
    select sc, ek, t.id, t.bills_on, 4533, case when t.number = 1 then 'paid' else 'scheduled' end::instalment_status from terms t where t.school_id = sc;
  insert into instalments (school_id, enrolment_id, term_id, due_on, amount_pence, status)
    select sc, eg, t.id, t.bills_on, 24360, case when t.number = 1 then 'paid' else 'scheduled' end::instalment_status from terms t where t.school_id = sc and t.number <= 5;
  update students set email = null where id = st;
  begin update orders set status = 'paid' where id = o; raise exception 'paid with no child Google account';
    exception when raise_exception then if sqlerrm not like 'add each child''s Google account%' and sqlerrm not like '%terms%' then raise; end if; end;
  update students set email = 'nell.notice@gmail.com' where id = st;
  -- can't be paid until the parent has agreed to the T&Cs
  begin
    update orders set status = 'paid' where id = o;
    raise exception 'order paid without agreeing to the terms';
  exception when raise_exception then if sqlerrm not like '%terms and conditions%' then raise; end if; end;
  select id into doc from terms_documents where school_id = sc order by published_at desc limit 1;
  begin
    insert into terms_acceptances (school_id, order_id, parent_id, terms_id, notice_confirmed) values (sc, o, par, doc, false);
    raise exception 'acceptance without confirming the notice period';
  exception when check_violation then null; end;
  insert into terms_acceptances (school_id, order_id, parent_id, terms_id, notice_confirmed, ip, user_agent) values (sc, o, par, doc, true, '203.0.113.7', 'test');
  update orders set status = 'paid', paid_at = now() where id = o;
  assert (select notice_terms from enrolments where id = ek) = 1 and (select notice_terms from enrolments where id = eg) = 2, 'notice copied from the level when paid';
  -- a later change to the level's notice doesn't change what was agreed
  update levels set notice_terms = 3 where school_id = sc and name = 'KS3';
  -- cancel both on 11 Oct (in Term 1, after the 14-day cooling-off)
  perform generate_lesson_events(t.id) from terms t where t.school_id = sc and t.number = 1;
  perform cancel_enrolment(ek, '2026-10-11');
  assert (select string_agg(t.name || ':' || i.status, ', ' order by t.starts_on) from instalments i join terms t on t.id = i.term_id where i.enrolment_id = ek)
       = 'Term 1:paid, Term 2:scheduled, Term 3:cancelled, Term 4:cancelled, Term 5:cancelled, Term 6:cancelled', 'KS3: one full term (Term 2) still due';
  perform cancel_enrolment(eg, '2026-10-11');
  assert (select count(*) from instalments where enrolment_id = eg and status = 'scheduled') = 2, 'GCSE: two full terms (Term 2, Term 3) still due';
  assert (select count(*) from instalments where enrolment_id = eg and status = 'cancelled') = 2, 'GCSE: Term 4 and Term 5 not charged';
  assert (select status from enrolments where id = ek) = 'active', 'the course carries on through the notice term';
  begin
    perform cancel_enrolment(ek, '2026-10-12');
    raise exception 'notice given twice';
  exception when raise_exception then if sqlerrm not like 'notice was already given%' then raise; end if; end;
  update levels set notice_terms = 1 where school_id = sc and name = 'KS3';
  -- cooling-off: within 14 days of the first lesson, before joining the Classroom, everything is refunded
  insert into enrolments (school_id, student_id, group_id, status, list_price_pence) select sc, st, id, 'active', 27200 from course_groups where code = 'KMat26/1' returning id into ec;
  insert into instalments (school_id, enrolment_id, term_id, due_on, amount_pence, status) select sc, ec, t.id, t.bills_on, 4533, 'paid' from terms t where t.school_id = sc and t.number = 1;
  perform cancel_enrolment(ec, (select min(lesson_date) + 10 from lesson_events ev join course_groups g on g.id = ev.group_id where g.code = 'KMat26/1'));
  assert (select status from instalments where enrolment_id = ec) = 'refunded' and (select status from enrolments where id = ec) = 'cancelled', 'cooling-off refund';
  delete from instalments where enrolment_id in (ek, eg, ec); delete from terms_acceptances where order_id = o;
  delete from enrolments where id in (ek, eg, ec); delete from orders where id = o; delete from students where id = st; delete from parents where id = par;
end $$;

-- parent-to-parent contact: only between parents of classmates, only with consent, details shared only on accept
do $$
declare sc uuid; g uuid; pa uuid; pb uuid; pc uuid; sa uuid; sb uuid; scc uuid; r uuid; r2 uuid; begin
  select id into sc from schools where slug = 'ohsoed';
  select id into g from course_groups where code = 'KGeo26/1';
  insert into parents (school_id, first_name, last_name, email) values (sc, 'Ann', 'Asker', 'ann@example.test') returning id into pa;
  insert into parents (school_id, first_name, last_name, email) values (sc, 'Bob', 'Bee', 'bob@example.test') returning id into pb;
  insert into parents (school_id, first_name, last_name, email) values (sc, 'Cat', 'Cee', 'cat@example.test') returning id into pc;
  insert into students (school_id, parent_id, first_name, last_name) values (sc, pa, 'Alfie', 'Asker') returning id into sa;
  insert into students (school_id, parent_id, first_name, last_name) values (sc, pb, 'Bella', 'Bee') returning id into sb;
  insert into students (school_id, parent_id, first_name, last_name) values (sc, pc, 'Cora', 'Cee') returning id into scc;
  insert into enrolments (school_id, student_id, group_id, status, list_price_pence) values (sc, sa, g, 'active', 27200), (sc, sb, g, 'active', 27200);
  -- Bob hasn't opted in yet
  begin
    insert into contact_requests (school_id, from_parent_id, to_parent_id, group_id, from_student_id, to_student_id) values (sc, pa, pb, g, sa, sb);
    raise exception 'request sent to a parent who has not opted in';
  exception when raise_exception then if sqlerrm not like '%not accepting%' then raise; end if; end;
  update parents set accepts_contact_requests = true where id in (pa, pb, pc);
  -- Cora isn't in the class
  begin
    insert into contact_requests (school_id, from_parent_id, to_parent_id, group_id, from_student_id, to_student_id) values (sc, pa, pc, g, sa, scc);
    raise exception 'request to a parent outside the class';
  exception when raise_exception then if sqlerrm not like '%same class%' then raise; end if; end;
  insert into contact_requests (school_id, from_parent_id, to_parent_id, group_id, from_student_id, to_student_id, message)
    values (sc, pa, pb, g, sa, sb, 'Alfie would love to do the project with Bella') returning id into r;
  assert (select count(*) from shared_contacts(pa)) = 0, 'nothing shared while pending';
  begin
    insert into contact_requests (school_id, from_parent_id, to_parent_id, group_id, from_student_id, to_student_id) values (sc, pb, pa, g, sb, sa);
    raise exception 'two open requests between the same parents';
  exception when unique_violation then null; end;
  begin
    perform respond_contact_request(r, pa, true);
    raise exception 'the asker accepted their own request';
  exception when raise_exception then if sqlerrm <> 'not your request' then raise; end if; end;
  assert respond_contact_request(r, pb, true) = 'accepted', 'Bob accepts';
  assert (select email from shared_contacts(pa)) = 'bob@example.test' and (select email from shared_contacts(pb)) = 'ann@example.test', 'both see each other''s email after accepting';
  assert (select child_first_name from shared_contacts(pa)) = 'Bella', 'only the child''s first name';
  -- either parent can stop sharing
  update contact_requests set status = 'revoked', revoked_by = 'parent' where id = r;
  assert (select count(*) from shared_contacts(pa)) = 0, 'revoked: no longer shared';
  -- a decline (with block) stops repeat requests
  insert into contact_requests (school_id, from_parent_id, to_parent_id, group_id, from_student_id, to_student_id) values (sc, pa, pb, g, sa, sb) returning id into r2;
  assert respond_contact_request(r2, pb, false, true) = 'declined', 'Bob declines and blocks';
  begin
    insert into contact_requests (school_id, from_parent_id, to_parent_id, group_id, from_student_id, to_student_id) values (sc, pa, pb, g, sa, sb);
    raise exception 'asked again after a decline';
  exception when raise_exception then if sqlerrm not like '%not accepting%' then raise; end if; end;
  delete from contact_requests where from_parent_id = pa; delete from parent_blocks where parent_id = pb;
  delete from enrolments where student_id in (sa, sb); delete from students where id in (sa, sb, scc); delete from parents where id in (pa, pb, pc);
end $$;


-- course pages: a sample lesson link must be a Google Drive (or YouTube) recording
do $$
declare sc uuid; lv uuid; sj uuid; begin
  select id into sc from schools where slug = 'ohsoed';
  select id into lv from levels where school_id = sc and name = 'Pre-GCSE';
  select id into sj from subjects where school_id = sc and name = 'Science';
  insert into course_pages (school_id, level_id, subject_id, slug, sample_video_url) values (sc, lv, sj, 'pre-gcse/science', 'https://drive.google.com/file/d/abc123/view');
  begin
    update course_pages set sample_video_url = 'http://example.com/video.mp4' where slug = 'pre-gcse/science';
    raise exception 'accepted a non-Drive video link';
  exception when check_violation then null; end;
  delete from course_pages where slug = 'pre-gcse/science';
end $$;


-- tasters: a parent books several real upcoming lessons in one request; places per lesson are capped; one taster per class per child
do $$
declare sc uuid; g uuid; g2 uuid; ev uuid; gw uuid; r1 uuid; r2 uuid; r3 uuid; begin
  select id into sc from schools where slug = 'ohsoed';
  select id into g from course_groups where code = 'PMat26/1';
  select id into g2 from course_groups where code = 'PSci26/1';
  perform generate_lesson_events(t.id) from terms t where t.school_id = sc and t.number = 2;
  select lesson_event_id into ev from taster_lessons(g, 400) limit 1;
  assert ev is not null, 'the taster page lists upcoming lessons from the timetable';
  assert (select places_left from taster_lessons(g, 400) limit 1) = 2, 'two taster places per lesson';
  insert into taster_requests (school_id, child_name, child_email, parent_first_name, parent_last_name, parent_email) values (sc, 'Harriet', 'h@example.test', 'Megan', 'Cole', 'm@example.test') returning id into r1;
  insert into taster_bookings (school_id, request_id, lesson_event_id) values (sc, r1, ev);
  insert into taster_bookings (school_id, request_id, lesson_event_id) select sc, r1, lesson_event_id from taster_lessons(g2, 400) limit 1;
  assert (select count(*) from taster_list where request_id = r1) = 2 and (select max(tasters_in_request) from taster_list where request_id = r1) = 2, 'one request, two tasters (Maths and Science)';
  begin
    insert into taster_bookings (school_id, request_id, lesson_event_id) select sc, r1, l.lesson_event_id from taster_lessons(g, 400) l offset 1 limit 1;
    raise exception 'second taster for the same class';
  exception when raise_exception then if sqlerrm not like '%already had a taster%' then raise; end if; end;
  insert into taster_requests (school_id, child_name, child_email, parent_first_name, parent_last_name, parent_email) values (sc, 'Oscar', 'o@example.test', 'Tom', 'Bell', 't@example.test') returning id into r2;
  insert into taster_bookings (school_id, request_id, lesson_event_id) values (sc, r2, ev);
  insert into taster_requests (school_id, child_name, child_email, parent_first_name, parent_last_name, parent_email) values (sc, 'Ivy', 'i@example.test', 'Mo', 'Lee', 'mo@example.test') returning id into r3;
  begin
    insert into taster_bookings (school_id, request_id, lesson_event_id) values (sc, r3, ev);
    raise exception 'third taster in one lesson';
  exception when raise_exception then if sqlerrm not like 'no taster places%' then raise; end if; end;
  select id into gw from course_groups where code = 'KSci26/1';
  assert not exists (select 1 from taster_lessons(gw, 400)), 'no tasters for a class on the waiting list';
  delete from taster_requests where school_id = sc;
end $$;


-- parents report absences in advance; the register records them as approved absences, which don't count against attendance
do $$
declare sc uuid; g uuid; st uuid; par uuid; e1 uuid; e2 uuid; e3 uuid; other uuid; added boolean := false; begin
  select id into sc from schools where slug = 'ohsoed';
  select id into g from course_groups where code = 'PMat26/1';
  select id, parent_id into st, par from students where first_name = 'Cleo';
  if not exists (select 1 from enrolments where student_id = st and group_id = g and status = 'active') then
    insert into enrolments (school_id, student_id, group_id, status, list_price_pence) values (sc, st, g, 'active', 81600); added := true; end if;
  select id into e1 from lesson_events where group_id = g and lesson_date > current_date order by lesson_date limit 1;
  select id into e2 from lesson_events where group_id = g and lesson_date > current_date order by lesson_date offset 1 limit 1;
  select id into e3 from lesson_events where group_id = g and lesson_date > current_date order by lesson_date offset 2 limit 1;
  insert into absence_notices (school_id, student_id, lesson_event_id, reason, note, reported_by) values (sc, st, e1, 'Medical or dental appointment', 'Orthodontist', par);
  select id into other from parents where id <> par and school_id = sc limit 1;
  begin
    insert into absence_notices (school_id, student_id, lesson_event_id, reason, reported_by) values (sc, st, e2, 'Illness', other);
    raise exception 'another parent reported the absence';
  exception when raise_exception then if sqlerrm not like 'only the child%' then raise; end if; end;
  -- registers taken: absent with a notice becomes an approved absence
  insert into attendance_marks (school_id, lesson_event_id, student_id, mark) values (sc, e1, st, 'absent'), (sc, e2, st, 'present'), (sc, e3, st, 'absent');
  assert (select mark from attendance_marks where lesson_event_id = e1 and student_id = st) = 'approved_absence', 'reported absence is approved';
  assert (select mark from attendance_marks where lesson_event_id = e3 and student_id = st) = 'absent', 'unreported absence stays absent';
  assert (select attendance_pct from student_term_attendance where student_id = st) = 50, 'approved absences are left out: 1 of 2';
  assert (select approved_absences from student_term_attendance where student_id = st) = 1, 'reports show approved absences';
  delete from attendance_marks where student_id = st; delete from absence_notices where student_id = st;
  if added then delete from enrolments where student_id = st and group_id = g; end if;
end $$;


-- a second parent/guardian gets invoices too; marketing needs each person's own consent
do $$
declare sc uuid; par uuid; begin
  select id into sc from schools where slug = 'ohsoed';
  select id into par from parents where email = 'parent1@example.test' and school_id = sc;
  insert into guardians (school_id, parent_id, first_name, last_name, email, relationship, receives_invoices, marketing_requested) values (sc, par, 'Dan', 'Example', 'dan@example.test', 'Parent', true, true);
  assert (select count(*) from invoice_recipients(par)) = 2, 'invoices go to both parents';
  begin
    insert into guardians (school_id, parent_id, first_name, last_name, email) values (sc, par, 'Third', 'Person', 'x@example.test');
    raise exception 'two additional guardians';
  exception when unique_violation then null; end;
  assert not exists (select 1 from marketing_audience where email = 'dan@example.test'), 'no marketing until the guardian confirms';
  update guardians set marketing_confirmed_at = now() where parent_id = par;
  assert exists (select 1 from marketing_audience where email = 'dan@example.test'), 'confirmed: included';
  update guardians set receives_invoices = false where parent_id = par;
  assert (select count(*) from invoice_recipients(par)) = 1, 'invoices to the account holder only';
  delete from guardians where parent_id = par;
end $$;


-- sign-up: a parent must verify their email before paying; SEND is shared with a child's own teachers only with consent
do $$
declare sc uuid; par uuid; st uuid; o uuid; g uuid; becky uuid; leanne uuid; doc uuid; begin
  select id into sc from schools where slug = 'ohsoed';
  insert into parents (school_id, first_name, last_name, email) values (sc, 'Vera', 'Verify', 'vera@example.test') returning id into par;
  insert into email_verifications (school_id, parent_id, code_hash) values (sc, par, sha256(convert_to('246810', 'UTF8')));
  insert into students (school_id, parent_id, first_name, last_name, date_of_birth, year_group) values (sc, par, 'Robin', 'Verify', '2014-03-02', 7) returning id into st;
  update students set email = 'robin.verify@gmail.com' where id = st;
  select id into g from course_groups where code = 'KMat26/1';
  insert into orders (school_id, parent_id) values (sc, par) returning id into o;
  insert into enrolments (school_id, student_id, group_id, order_id, status, list_price_pence) values (sc, st, g, o, 'active', 27200);
  select id into doc from terms_documents where school_id = sc limit 1;
  insert into terms_acceptances (school_id, order_id, parent_id, terms_id, notice_confirmed) values (sc, o, par, doc, true);
  begin
    update orders set status = 'paid' where id = o;
    raise exception 'paid without a verified email';
  exception when raise_exception then if sqlerrm not like '%verified their email%' then raise; end if; end;
  assert not verify_email(par, '111111'), 'wrong code fails';
  assert verify_email(par, '246810'), 'right code verifies';
  update orders set status = 'paid', paid_at = now() where id = o;
  -- SEND: Becky teaches KS3 Maths and sees Robin's support needs; Leanne doesn't
  insert into student_support (school_id, student_id, has_send, details, adjustments, has_ehcp) values (sc, st, 'yes', 'Dyslexia', 'Instructions in writing; extra time', false);
  select t.id into becky from teachers t join users u on u.id = t.user_id where u.name = 'Becky Randle';
  select t.id into leanne from teachers t join users u on u.id = t.user_id where u.name = 'Leanne Iacurci';
  assert exists (select 1 from teacher_student_support(becky) where student_id = st), 'class teacher sees it';
  assert not exists (select 1 from teacher_student_support(leanne) where student_id = st), 'other teachers do not';
  update student_support set share_with_teachers = false where student_id = st;
  assert not exists (select 1 from teacher_student_support(becky) where student_id = st), 'not shared without consent';
  begin
    insert into student_support (school_id, student_id, has_send) values (sc, st, 'no');
    raise exception 'duplicate';
  exception when unique_violation then null; end;
  delete from terms_acceptances where order_id = o; delete from instalments where enrolment_id in (select id from enrolments where order_id = o);
  delete from enrolments where order_id = o; delete from orders where id = o; delete from student_support where student_id = st; delete from students where id = st; delete from parents where id = par;
end $$;


-- messages: only with your child's own teachers; closed conversations take no new messages
do $$
declare sc uuid; par uuid; st uuid; g uuid; becky uuid; leanne uuid; th uuid; added boolean := false; begin
  select id into sc from schools where slug = 'ohsoed';
  select id, parent_id into st, par from students where first_name = 'Cleo';
  select id into g from course_groups where code = 'KMat26/1';
  if not exists (select 1 from enrolments where student_id = st and group_id = g and status = 'active') then insert into enrolments (school_id, student_id, group_id, status, list_price_pence) values (sc, st, g, 'active', 27200); added := true; end if;
  select t.id into becky from teachers t join users u on u.id = t.user_id where u.name = 'Becky Randle';
  select t.id into leanne from teachers t join users u on u.id = t.user_id where u.name = 'Leanne Iacurci';
  insert into message_threads (school_id, parent_id, teacher_id, student_id, subject) values (sc, par, becky, st, 'Homework') returning id into th;
  insert into messages (school_id, thread_id, sender, body) values (sc, th, 'parent', 'Hello'), (sc, th, 'teacher', 'Hi!');
  begin
    if not exists (select 1 from enrolments e join course_groups gg on gg.id = e.group_id where e.student_id = st and e.status = 'active' and gg.teacher_id = leanne) then
      insert into message_threads (school_id, parent_id, teacher_id, student_id, subject) values (sc, par, leanne, st, 'Hi');
      raise exception 'messaged a teacher who does not teach the child';
    end if;
  exception when raise_exception then if sqlerrm not like 'parents can only message teachers%' then raise; end if; end;
  update message_threads set status = 'closed' where id = th;
  begin
    insert into messages (school_id, thread_id, sender, body) values (sc, th, 'parent', 'One more thing');
    raise exception 'wrote to a closed conversation';
  exception when raise_exception then if sqlerrm <> 'this conversation is closed' then raise; end if; end;
  delete from message_threads where id = th; if added then delete from enrolments where student_id = st and group_id = g; end if;
end $$;


-- teacher-started conversations and attachments (type, size and count limits)
do $$
declare sc uuid; par uuid; st uuid; g uuid; becky uuid; th uuid; m uuid; added boolean := false; begin
  select id into sc from schools where slug = 'ohsoed';
  select id, parent_id into st, par from students where first_name = 'Cleo';
  select id into g from course_groups where code = 'KMat26/1';
  if not in_active_class(st, g) then insert into enrolments (school_id, student_id, group_id, status, list_price_pence) values (sc, st, g, 'active', 27200); added := true; end if;
  select t.id into becky from teachers t join users u on u.id = t.user_id where u.name = 'Becky Randle';
  insert into message_threads (school_id, parent_id, teacher_id, student_id, subject, started_by) values (sc, par, becky, st, 'Great quiz', 'teacher') returning id into th;
  insert into messages (school_id, thread_id, sender, body) values (sc, th, 'teacher', 'Well done!') returning id into m;
  begin insert into message_attachments (school_id, message_id, file_name, content_type, size_bytes, storage_key) values (sc, m, 'x.exe', 'application/x-msdownload', 10, 'k7');
    raise exception 'allowed an .exe'; exception when check_violation then null; end;
  begin insert into message_attachments (school_id, message_id, file_name, content_type, size_bytes, storage_key) values (sc, m, 'big.pdf', 'application/pdf', 20000000, 'k8');
    raise exception 'allowed 20 MB'; exception when check_violation then null; end;
  insert into message_attachments (school_id, message_id, file_name, content_type, size_bytes, storage_key)
    select sc, m, 'sheet' || i || '.pdf', 'application/pdf', 1000, 'k' || i from generate_series(1, 5) i;
  begin insert into message_attachments (school_id, message_id, file_name, content_type, size_bytes, storage_key) values (sc, m, 'six.pdf', 'application/pdf', 10, 'k6');
    raise exception 'allowed a 6th file'; exception when raise_exception then if sqlerrm <> 'up to 5 files per message' then raise; end if; end;
  delete from message_threads where id = th; if added then delete from enrolments where student_id = st and group_id = g; end if;
end $$;

-- student chat: class chat for class members only, private chats only between classmates, blocked words, hidden messages
do $$
declare sc uuid; g uuid; a uuid; b uuid; outsider uuid; becky uuid; leanne uuid; cc uuid; dc uuid; m uuid; eb uuid; added uuid[] := '{}'; begin
  select id into sc from schools where slug = 'ohsoed';
  select id, teacher_id into g, becky from course_groups where code = 'KMat26/1';
  select t.id into leanne from teachers t join users u on u.id = t.user_id where u.name = 'Leanne Iacurci';
  select id into a from students where first_name = 'Cleo';
  if not in_active_class(a, g) then insert into enrolments (school_id, student_id, group_id, status, list_price_pence) values (sc, a, g, 'active', 27200); added := added || a; end if;
  select s.id into b from students s where s.id <> a and s.school_id = sc order by s.first_name limit 1;
  if not in_active_class(b, g) then insert into enrolments (school_id, student_id, group_id, status, list_price_pence) values (sc, b, g, 'active', 27200); added := added || b; end if;
  insert into students (school_id, parent_id, first_name, last_name) select sc, parent_id, 'Olly', 'Outsider' from students where id = a returning id into outsider;
  -- chat is off by default: a student can't post until a parent turns it on
  update students set chat_access = 'none' where id = a;
  insert into student_chats (school_id, kind, group_id) values (sc, 'class', g) returning id into cc;
  begin insert into student_chat_messages (school_id, chat_id, sender_student_id, body) values (sc, cc, a, 'hello'); raise exception 'posted with chat off';
    exception when raise_exception then if sqlerrm <> 'chat is turned off for this student' then raise; end if; end;
  delete from student_chats where id = cc;
  perform set_chat_access(a, 'class_and_private', (select parent_id from students where id = a));
  assert exists (select 1 from consent_events where student_id = a and purpose = 'student_chat' and granted), 'chat opt-in recorded';
  update students set chat_access = 'class' where id = b;
  begin perform start_direct_chat(a, b); raise exception 'private chat without both opt-ins';
    exception when raise_exception then if sqlerrm <> 'private chat needs both parents to allow it' then raise; end if; end;
  update students set chat_access = 'class_and_private' where id = b;
  update students set chat_access = 'class_and_private' where id = outsider;
  insert into chat_blocked_words (school_id, word) values (sc, 'stupid') on conflict do nothing;
  insert into student_chats (school_id, kind, group_id) values (sc, 'class', g) returning id into cc;
  insert into student_chat_messages (school_id, chat_id, sender_student_id, body) values (sc, cc, a, 'Is homework due Wednesday?');
  insert into student_chat_messages (school_id, chat_id, sender_teacher_id, body) values (sc, cc, becky, 'Yes, Wednesday!');
  begin insert into student_chat_messages (school_id, chat_id, sender_student_id, body) values (sc, cc, outsider, 'hi');
    raise exception 'outsider posted'; exception when raise_exception then if sqlerrm <> 'only students in this class can post here' then raise; end if; end;
  if leanne is distinct from becky then begin insert into student_chat_messages (school_id, chat_id, sender_teacher_id, body) values (sc, cc, leanne, 'hi');
    raise exception 'other teacher posted'; exception when raise_exception then if sqlerrm not like 'only this class%' then raise; end if; end; end if;
  begin insert into student_chat_messages (school_id, chat_id, sender_student_id, body) values (sc, cc, a, 'that is STUPID');
    raise exception 'blocked word allowed'; exception when raise_exception then if sqlerrm <> 'message contains words that are not allowed' then raise; end if; end;
  dc := start_direct_chat(a, b);
  assert start_direct_chat(b, a) = dc, 'reopening a chat should reuse it';
  insert into student_chat_messages (school_id, chat_id, sender_student_id, body) values (sc, dc, b, 'Revise together?') returning id into m;
  begin perform start_direct_chat(a, outsider); raise exception 'chat with non-classmate';
    exception when raise_exception then if sqlerrm <> 'students can only chat with classmates' then raise; end if; end;
  insert into student_chat_reports (school_id, message_id, reported_by) values (sc, m, a);
  update student_chat_messages set hidden_at = now() where id = m;
  assert (select body from student_chat_feed where id = m) = 'Message removed by staff', 'hidden message should be masked';
  -- once they no longer share a class the private chat is read-only
  select id into eb from enrolments where student_id = b and group_id = g and status = 'active';
  update enrolments set status = 'cancelled' where id = eb;
  if not shares_active_class(a, b) then
    begin insert into student_chat_messages (school_id, chat_id, sender_student_id, body) values (sc, dc, a, 'still there?');
      raise exception 'posted after leaving'; exception when raise_exception then if sqlerrm not like 'this chat is read-only%' then raise; end if; end;
  end if;
  update enrolments set status = 'active' where id = eb;
  delete from student_chats where id in (cc, dc); delete from students where id = outsider;
  update students set chat_access = 'none' where id in (a, b); delete from consent_events where student_id in (a, b);
  delete from enrolments where group_id = g and student_id = any(added);
end $$;

-- rewards: only your own students, whole-school leaderboard per term, winners after the term ends, ties refused
do $$
declare sc uuid; g uuid; becky uuid; leanne uuid; a uuid; b uuid; t1 uuid; t1end date; added uuid[] := '{}'; n int; begin
  select id into sc from schools where slug = 'ohsoed';
  select id, teacher_id into g, becky from course_groups where code = 'KMat26/1';
  select t.id into leanne from teachers t join users u on u.id = t.user_id where u.name = 'Leanne Iacurci';
  select id into a from students where first_name = 'Cleo';
  select s.id into b from students s where s.id <> a and s.school_id = sc order by s.first_name limit 1;
  foreach n in array array[1, 2] loop null; end loop;
  if not in_active_class(a, g) then insert into enrolments (school_id, student_id, group_id, status, list_price_pence) values (sc, a, g, 'active', 27200); added := added || a; end if;
  if not in_active_class(b, g) then insert into enrolments (school_id, student_id, group_id, status, list_price_pence) values (sc, b, g, 'active', 27200); added := added || b; end if;
  select id, ends_on into t1, t1end from terms where school_id = sc and number = 1 order by starts_on desc limit 1;
  insert into reward_prizes (school_id, place, description) values (sc, 1, '£25 book voucher'), (sc, 2, '£15 book voucher'), (sc, 3, '£10 book voucher') on conflict do nothing;
  insert into reward_points (school_id, student_id, teacher_id, group_id, points, reason, awarded_on) values
    (sc, a, becky, g, 5, 'Excellent work', t1end - 3), (sc, a, becky, g, 2, 'Great effort', t1end - 2), (sc, b, becky, g, 3, 'Helping others', t1end - 1);
  if leanne is distinct from becky then begin insert into reward_points (school_id, student_id, teacher_id, group_id, points, reason) values (sc, a, leanne, g, 1, 'x');
    raise exception 'gave points outside own class'; exception when raise_exception then if sqlerrm not like 'teachers can only give points%' then raise; end if; end; end if;
  begin insert into reward_points (school_id, student_id, teacher_id, group_id, points, reason) values (sc, a, becky, g, 50, 'x');
    raise exception 'allowed 50 points'; exception when check_violation then null; end;
  assert (select rank from term_leaderboard(t1) where student_id = a) = 1, 'Cleo should top the leaderboard';
  assert (select points from term_leaderboard(t1) where student_id = a) = 7, 'Cleo should have 7 points';
  if current_date <= t1end then
    begin perform confirm_reward_winners(t1); raise exception 'confirmed before term end';
      exception when raise_exception then if sqlerrm not like 'winners can be confirmed once%' then raise; end if; end;
  end if;
  delete from reward_points where group_id = g and reason in ('Excellent work', 'Great effort', 'Helping others') and student_id in (a, b);
  delete from enrolments where group_id = g and student_id = any(added);
end $$;

-- attendance from Meet: marks are measured against the timetabled start/end; office corrections survive a re-sync
do $$
declare sc uuid; g uuid; par uuid; ev uuid; st_at timestamptz; a uuid; b uuid; c uuid; d uuid; e uuid; m record; begin
  select id into sc from schools where slug = 'ohsoed';
  select id into g from course_groups where code = 'KMat26/1';
  select parent_id into par from students where first_name = 'Cleo';
  select le.id, (le.lesson_date + s.starts_at) at time zone 'Europe/London' into ev, st_at
    from lesson_events le join lesson_slots s on s.id = le.slot_id where le.group_id = g order by le.lesson_date limit 1;
  insert into students (school_id, parent_id, first_name, last_name) values (sc, par, 'Ontime', 'T') returning id into a;
  insert into students (school_id, parent_id, first_name, last_name) values (sc, par, 'Latey', 'T') returning id into b;
  insert into students (school_id, parent_id, first_name, last_name) values (sc, par, 'Leaver', 'T') returning id into c;
  insert into students (school_id, parent_id, first_name, last_name) values (sc, par, 'Missing', 'T') returning id into d;
  insert into students (school_id, parent_id, first_name, last_name) values (sc, par, 'Blip', 'T') returning id into e;
  insert into enrolments (school_id, student_id, group_id, status, list_price_pence) select sc, x, g, 'active', 27200 from unnest(array[a, b, c, d, e]) x;
  -- the teacher opened the Meet 40 minutes early: that must not make anyone late
  insert into meet_sessions (school_id, lesson_event_id, student_id, joined_at, left_at) values
    (sc, ev, a, st_at - interval '3 minutes', st_at + interval '60 minutes'),
    (sc, ev, b, st_at + interval '12 minutes', st_at + interval '60 minutes'),
    (sc, ev, c, st_at, st_at + interval '30 minutes'),
    (sc, ev, e, st_at + interval '1 minute', st_at + interval '3 minutes');
  perform compute_attendance(ev);
  assert (select mark from attendance_marks where lesson_event_id = ev and student_id = a) = 'present', 'joined early is present';
  assert (select mark from attendance_marks where lesson_event_id = ev and student_id = b) = 'late', 'joined 12 min after the timetabled start is late';
  assert (select mark::text || left_early from attendance_marks where lesson_event_id = ev and student_id = c) = 'presenttrue', 'left 30 min in is present + left early';
  assert (select mark from attendance_marks where lesson_event_id = ev and student_id = d) = 'absent', 'no Meet join is absent';
  assert (select mark from attendance_marks where lesson_event_id = ev and student_id = e) = 'absent', 'under the minimum minutes is absent';
  -- the office matches a signed-out join to the missing student; the next sync must not undo it
  update attendance_marks set mark = 'present', source = 'admin', correction_note = 'joined signed out (iPad)' where lesson_event_id = ev and student_id = d;
  perform compute_attendance(ev);
  assert (select mark from attendance_marks where lesson_event_id = ev and student_id = d) = 'present', 'office correction survives a re-sync';
  assert (select left_early from student_term_attendance where student_id = c) = 1, 'left early counted';
  delete from attendance_marks where lesson_event_id = ev and student_id in (a, b, c, d, e);
  delete from enrolments where student_id in (a, b, c, d, e); delete from students where id in (a, b, c, d, e);
end $$;

-- swapping a course: this term (charge or refund the difference) or next term (nothing to pay now)
do $$
declare sc uuid; par uuid; st uuid; kmat uuid; pgeo uuid; keng uuid; t1 uuid; e1 uuid; r record; begin
  select id into sc from schools where slug = 'ohsoed';
  select parent_id into par from students where first_name = 'Cleo';
  insert into students (school_id, parent_id, first_name, last_name) values (sc, par, 'Swapper', 'T') returning id into st;
  select id into kmat from course_groups where code = 'KMat26/1'; select id into pgeo from course_groups where code = 'PGeo26/1'; select id into keng from course_groups where code = 'KEng26/1';
  select id into t1 from terms where school_id = sc and number = 1 order by starts_on desc limit 1;
  -- KS3 Maths, Term 1 paid (£45.33)
  insert into enrolments (school_id, student_id, group_id, status, list_price_pence) values (sc, st, kmat, 'active', 27200) returning id into e1;
  insert into instalments (school_id, enrolment_id, term_id, due_on, amount_pence, status)
    select sc, e1, t.id, t.bills_on, 4533 + case when t.number = 1 then 2 else 0 end, case when t.number = 1 then 'paid' else 'scheduled' end::instalment_status
    from terms t where t.school_id = sc and t.academic_year_id = (select academic_year_id from course_groups where id = kmat);
  -- swap to Pre-GCSE Geography from the current term: £68.00 - £45.35 = £22.65 to pay now
  select * into r from swap_course(e1, pgeo, 'current', (select starts_on + 20 from terms where id = t1));
  assert r.pay_now_pence = 6800 - 4535 and r.refund_now_pence = 0, 'dearer course this term: pay the difference, got ' || r.pay_now_pence;
  assert (select status from enrolments where id = e1) = 'swapped', 'old course is swapped';
  assert (select count(*) from instalments where enrolment_id = e1 and status = 'scheduled') = 0, 'old future instalments stopped';
  assert (select count(*) from instalments where enrolment_id = r.to_enrolment and term_id <> t1) = 5, 'new course billed for terms 2-6';
  assert (select amount_pence from instalments where enrolment_id = r.to_enrolment and term_id = t1) = r.pay_now_pence, 'difference charged now';
  update instalments set status = 'paid', paid_at = now() where enrolment_id = r.to_enrolment and term_id = t1;   -- Stripe charged it
  -- swap back down to KS3 English from the current term: refund the difference on the paid term
  select * into r from swap_course(r.to_enrolment, keng, 'current', (select starts_on + 21 from terms where id = t1));
  assert r.refund_now_pence = 6800 - 4535 and r.pay_now_pence = 0, 'cheaper course this term: refund the difference, got ' || r.refund_now_pence;
  -- swap KS3 English to KS3 Maths from NEXT term: nothing now, old class runs to the end of the term
  e1 := r.to_enrolment;
  select * into r from swap_course(e1, kmat, 'next', (select starts_on + 22 from terms where id = t1));
  assert r.pay_now_pence = 0 and r.refund_now_pence = 0 and r.starts_term = 'Term 2', 'next term: nothing to pay now';
  assert (select status from enrolments where id = e1) = 'active' and (select last_billed_term_id from enrolments where id = e1) = t1, 'old class runs to end of term';
  assert not exists (select 1 from instalments i join terms t on t.id = i.term_id where i.enrolment_id = e1 and t.number > 1 and i.status = 'scheduled'), 'old course not billed after this term';
  assert (select starts_on from enrolments where id = r.to_enrolment) = (select starts_on from terms where school_id = sc and number = 2 order by starts_on desc limit 1), 'new class starts next term';
  begin perform swap_course(r.to_enrolment, r.to_enrolment, 'current'); exception when others then null; end;
  begin perform swap_course(r.to_enrolment, pgeo, 'current', (select ends_on - 2 from terms where id = t1)); raise exception 'swapped now in the last week';
    exception when raise_exception then if sqlerrm <> 'in the last week of term a swap starts next term' then raise; end if; end;
  update course_groups set capacity = 0 where id = pgeo;
  begin perform swap_course(r.to_enrolment, pgeo, 'next', (select starts_on + 22 from terms where id = t1)); raise exception 'swapped into a full class';
    exception when raise_exception then if sqlerrm <> 'that class is full' then raise; end if; end;
  update course_groups set capacity = 12 where id = pgeo;
  delete from swap_adjustments where from_enrolment_id in (select id from enrolments where student_id = st);
  delete from instalments where enrolment_id in (select id from enrolments where student_id = st);
  update enrolments set swapped_from_id = null where student_id = st; delete from enrolments where student_id = st; delete from students where id = st;
end $$;

-- data protection: consent history, rights requests, logged SEND reads, family export, erasure, retention
do $$
declare sc uuid; par uuid; st uuid; admin_u uuid; out jsonb; rq uuid; g uuid; e uuid; t1 uuid; n int; begin
  select id into sc from schools where slug = 'ohsoed';
  perform default_retention(sc);
  select id into admin_u from users where school_id = sc and role = 'school_admin' limit 1;
  insert into parents (school_id, first_name, last_name, email) values (sc, 'Gdpr', 'Parent', 'gdpr.parent@example.com') returning id into par;
  insert into students (school_id, parent_id, first_name, last_name) values (sc, par, 'Gdpr', 'Child') returning id into st;
  insert into student_support (student_id, school_id, has_send, details, share_with_teachers) values (st, sc, 'yes', 'Dyslexia', false);
  -- consent history: the latest event wins
  insert into consent_events (school_id, parent_id, purpose, granted, notice_version, source) values (sc, par, 'marketing_email', true, '2026-10', 'signup');
  insert into consent_events (school_id, parent_id, purpose, granted, notice_version) values (sc, par, 'marketing_email', false, '2026-10');
  assert (select granted from current_consents where parent_id = par and purpose = 'marketing_email') = false, 'withdrawal wins';
  -- SEND read by an admin is logged; a teacher who doesn't teach the child is refused
  perform read_student_support(st, admin_u, 'office check');
  assert (select count(*) from sensitive_access_log where student_id = st and what = 'send_details') = 1, 'SEND read logged';
  begin perform read_student_support(st, (select u.id from users u join teachers t on t.user_id = u.id limit 1)); raise exception 'teacher saw SEND';
    exception when raise_exception then if sqlerrm <> 'not allowed to see this student''s support details' then raise; end if; end;
  -- access request: one month to reply; export contains the child and their support needs
  insert into privacy_requests (school_id, parent_id, requester_email, kind) values (sc, par, 'gdpr.parent@example.com', 'access') returning id into rq;
  assert (select due_on from privacy_requests where id = rq) = (current_date + interval '1 month')::date, 'one month deadline';
  out := export_family_data(par, admin_u);
  assert out->'children'->0->'student'->>'first_name' = 'Gdpr' and out->'children'->0->'support_needs'->>'details' = 'Dyslexia', 'export has child + SEND';
  assert out->'parent' ? 'email' and not (out->'parent' ? 'stripe_customer_id'), 'export leaves out internal ids';
  -- erasure is refused while a course is active
  select id into g from course_groups where code = 'KMat26/1';
  insert into enrolments (school_id, student_id, group_id, status, list_price_pence) values (sc, st, g, 'active', 27200) returning id into e;
  begin perform erase_family(par); raise exception 'erased with an active course';
    exception when raise_exception then if sqlerrm not like 'cancel the active courses first%' then raise; end if; end;
  update enrolments set status = 'cancelled', ended_at = now() where id = e;
  select id into t1 from terms where school_id = sc and number = 1 order by starts_on desc limit 1;
  insert into instalments (school_id, enrolment_id, term_id, due_on, amount_pence, status) values (sc, e, t1, current_date, 4533, 'paid');
  insert into privacy_requests (school_id, parent_id, requester_email, kind) values (sc, par, 'gdpr.parent@example.com', 'erasure') returning id into rq;
  out := erase_family(par, rq);
  assert (select first_name from students where id = st) = 'Erased' and (select email from parents where id = par) like 'erased-%@invalid', 'names gone';
  assert not exists (select 1 from student_support where student_id = st), 'SEND gone';
  assert (select amount_pence from instalments where enrolment_id = e) = 4533, 'payment record kept for HMRC';
  assert (select status from privacy_requests where id = rq) = 'done', 'request closed';
  -- retention: an old enquiry with no booking is removed; a recent one stays
  insert into enquiries (school_id, name, email, created_at) values (sc, 'Old Enquirer', 'old.enq@example.com', now() - interval '13 months'), (sc, 'New Enquirer', 'new.enq@example.com', now());
  select removed into n from run_retention(sc) where data_kind = 'enquiry';
  assert n >= 1 and exists (select 1 from enquiries where email = 'new.enq@example.com') and not exists (select 1 from enquiries where email = 'old.enq@example.com'), 'retention removes only expired enquiries';
  -- breach log: a risky breach can't be closed without an ICO report time
  begin insert into data_breaches (school_id, found_at, what_happened, data_involved, risk, closed_at) values (sc, now(), 'test', 'names', 'risk', now()); raise exception 'closed a reportable breach with no ICO report';
    exception when check_violation then null; end;
  -- Children's Code default
  assert (select leaderboard_name from students where id = st) = 'first_initial', 'leaderboard shows first name + initial by default';
  delete from enquiries where email = 'new.enq@example.com';
  delete from instalments where enrolment_id = e; delete from enrolments where id = e; delete from privacy_requests where parent_id = par;
  delete from sensitive_access_log where student_id = st or (what = 'family_export' and viewer_user_id = admin_u);
  delete from consent_events where school_id = sc and parent_id is null and notice_version = '2026-10';
  delete from students where id = st; delete from parents where id = par;
end $$;

-- each child's own Google account: not a parent's email, not shared, Gmail or confirmed
do $$
declare sc uuid; par uuid; st uuid; st2 uuid; begin
  select id into sc from schools where slug = 'ohsoed';
  insert into parents (school_id, first_name, last_name, email) values (sc, 'Acct', 'Parent', 'acct.parent@gmail.com') returning id into par;
  insert into students (school_id, parent_id, first_name, last_name) values (sc, par, 'Acct', 'Child') returning id into st;
  begin update students set email = 'Acct.Parent@gmail.com' where id = st; raise exception 'allowed parent email';
    exception when raise_exception then if sqlerrm not like 'a child needs their own Google account%' then raise; end if; end;
  begin update students set email = 'acct.child@school.org' where id = st; raise exception 'allowed unconfirmed non-Gmail';
    exception when raise_exception then if sqlerrm not like 'not a Gmail address%' then raise; end if; end;
  update students set email = 'acct.child@school.org', google_account_confirmed = true where id = st;
  update students set email = 'Acct.Child@Gmail.com' where id = st;
  assert (select email from students where id = st) = 'acct.child@gmail.com', 'stored lower-case';
  insert into students (school_id, parent_id, first_name, last_name) values (sc, par, 'Acct', 'Twin') returning id into st2;
  begin update students set email = 'acct.child@gmail.com' where id = st2; raise exception 'allowed shared email';
    exception when raise_exception then if sqlerrm <> 'another child already uses this email' then raise; end if; end;
  delete from students where id in (st, st2); delete from parents where id = par;
end $$;

-- tenancy: as the app user, each school sees only its own rows
select id as ose_id from schools where slug = 'ohsoed' \gset
-- class capacity: open until full, then waiting list only; admin overrides; automatic sticky labels
do $$
declare sc uuid; par uuid; g uuid; kgeo uuid; n int; st uuid[] := '{}'; x uuid; i int; w uuid; av record; begin
  select id into sc from schools where slug = 'ohsoed';
  select parent_id into par from students where first_name = 'Cleo';
  select id into g from course_groups where code = 'PHis26/1'; select id into kgeo from course_groups where code = 'KGeo26/1';
  n := group_taken(g);
  update course_groups set capacity = n + 4 where id = g;
  assert (select label from course_group_availability where group_id = g) = 'Few spaces left', 'four places left: few spaces';
  update course_groups set capacity = n + 2 where id = g;
  select * into av from course_group_availability where group_id = g;
  assert av.label = 'Almost full' and av.places_left = 2 and av.shows_times and av.bookable, 'two places left: almost full, still bookable';
  for i in 1..2 loop
    insert into students (school_id, parent_id, first_name, last_name) values (sc, par, 'Cap' || i, 'T') returning id into x; st := st || x;
    insert into enrolments (school_id, student_id, group_id, status, list_price_pence) values (sc, x, g, 'active', 40800);
  end loop;
  select * into av from course_group_availability where group_id = g;
  assert av.is_full and av.shows_waitlist and not av.shows_times and not av.bookable and av.label is null, 'full: waiting list, no times, no label';
  assert not can_book(g, 'anyone@example.test'), 'a full class cannot be booked';
  insert into students (school_id, parent_id, first_name, last_name) values (sc, par, 'Cap3', 'T') returning id into x; st := st || x;
  begin insert into enrolments (school_id, student_id, group_id, status, list_price_pence) values (sc, x, g, 'active', 40800); raise exception 'booked a full class';
    exception when raise_exception then if sqlerrm <> 'that class is full' then raise; end if; end;
  -- admin override: keep taking bookings past capacity
  update course_groups set capacity_mode = 'keep_open' where id = g;
  assert (select bookable and shows_times from course_group_availability where group_id = g), 'keep_open: bookable past capacity';
  insert into enrolments (school_id, student_id, group_id, status, list_price_pence) values (sc, x, g, 'active', 40800);
  update course_groups set capacity_mode = 'auto', capacity = n + 10 where id = g;
  -- admin override: close early
  update course_groups set capacity_mode = 'full' where id = g;
  assert (select is_full and shows_waitlist from course_group_availability where group_id = g), 'marked full with places left';
  update course_groups set capacity_mode = 'auto', sticky_label = 'new_group' where id = g;
  assert (select label from course_group_availability where group_id = g) = 'New Group!', 'manual label wins';
  update course_groups set sticky_label = 'off' where id = g;
  assert (select label from course_group_availability where group_id = g) is null, 'label switched off';
  update course_groups set sticky_label = 'auto' where id = g;
  assert (select label from course_group_availability where group_id = kgeo) = 'New Group Launching Soon!', 'collecting sign-ups: launching soon';
  -- a place comes up in a full class: the first family on its waiting list is invited
  update course_groups set capacity = n + 3 where id = g;
  insert into waitlist_entries (school_id, group_id, parent_name, child_name, email) values (sc, g, 'First', 'In line', 'first@example.test') returning id into w;
  insert into waitlist_entries (school_id, group_id, parent_name, child_name, email) values (sc, g, 'Second', 'In line', 'second@example.test');
  update enrolments set status = 'cancelled' where student_id = st[1] and group_id = g;
  assert (select emailed_at is not null from waitlist_entries where id = w), 'first on the list invited';
  assert (select count(*) from waitlist_entries where group_id = g and emailed_at is null) = 1, 'only one place, only one invite';
  delete from waitlist_entries where group_id = g;
  delete from enrolments where student_id = any(st); delete from students where id = any(st);
  update course_groups set capacity = 12 where id = g;
end $$;

-- next year: prepared early, on the website and bookable from its sales date (1 March)
do $$
declare sc uuid; y uuid; ny uuid; par uuid; st uuid; g uuid; n_old int; n_new int; begin
  select id into sc from schools where slug = 'ohsoed';
  select id into y from academic_years where school_id = sc and label = '2026/27';
  select parent_id into par from students where first_name = 'Cleo';
  assert (select sales_open_on from academic_years where id = y) = '2026-03-01', 'this year went on sale on 1 March';
  ny := prepare_next_year(y, '2027/28', '2027-09-06', '2028-07-21');
  assert (select sales_open_on from academic_years where id = ny) = '2027-03-01', 'next year goes on sale on 1 March by default';
  select count(*) into n_old from course_groups g join price_plans p on p.id = g.price_plan_id where g.academic_year_id = y and g.status <> 'hidden' and g.continues_group_id is null and p.year_of_course = 1;
  select count(*) into n_new from course_groups where academic_year_id = ny and continues_group_id is null;
  assert n_new = n_old, 'every class copied for the new intake';
  select id into g from course_groups where academic_year_id = ny and code = 'KEng27/1';
  assert g is not null, 'new code KEng27/1';
  assert group_taken(g) = 0 and (select google_course_id is null from course_groups where id = g), 'no students, no Classroom yet';
  assert (select count(*) from lesson_slots where group_id = g) = (select count(*) from lesson_slots s join course_groups o on o.id = s.group_id where o.code = 'KEng26/1'), 'weekly lesson times copied';
  assert (select count(*) from price_plans where academic_year_id = ny) = (select count(*) from price_plans where academic_year_id = y), 'price plans copied';
  if exists (select 1 from course_groups g2 join price_plans p on p.id = g2.price_plan_id where g2.academic_year_id = y and p.course_years = 2 and p.year_of_course = 1) then
    assert exists (select 1 from course_groups where academic_year_id = ny and continues_group_id is not null and status = 'closed'), 'year 2 of a 2-year course carries on, not sold';
  end if;
  -- before 1 March: not on the website, can't be booked
  assert not exists (select 1 from website_years where id = ny), 'next year hidden before its sales date';
  assert exists (select 1 from website_years where id = y and not is_next), 'this year shown';
  assert not (select bookable from course_group_availability where group_id = g), 'not bookable before its sales date';
  insert into students (school_id, parent_id, first_name, last_name) values (sc, par, 'Early', 'Bird') returning id into st;
  begin insert into enrolments (school_id, student_id, group_id, status, list_price_pence) values (sc, st, g, 'pending', 27200); raise exception 'booked next year too early';
    exception when raise_exception then if sqlerrm <> 'bookings for 2027/28 open on 1 March 2027' then raise; end if; end;
  -- from the sales date: both years on the website, next year bookable
  update academic_years set sales_open_on = current_date where id = ny;
  assert exists (select 1 from website_years where id = ny and is_next), 'next year shown from its sales date';
  assert (select bookable from course_group_availability where group_id = g), 'bookable from its sales date';
  insert into enrolments (school_id, student_id, group_id, status, list_price_pence) values (sc, st, g, 'pending', 27200);
  delete from enrolments where student_id = st; delete from students where id = st;
  delete from academic_years where id = ny;
end $$;

select id as demo_id from schools where slug = 'demo-academy' \gset
set role app_user;
select set_config('app.school_id', :'ose_id', false);
do $$ begin
  assert (select count(*) from schools) = 1, 'OH-SO ED should only see itself';
  assert (select count(*) from parents) = 2, 'OH-SO ED should see its 2 parents only';
  assert (select count(*) from parents where email = 'parent1@example.test') = 1, 'same email in another school stays hidden';
end $$;

-- writing a row for another school is refused
do $$ begin
  begin
    insert into parents (school_id, first_name, last_name, email)
      values ((select gen_random_uuid()), 'X', 'Y', 'x@example.test');
    raise exception 'cross-school insert was allowed';
  exception when insufficient_privilege then null; end;
end $$;

-- the money ledger is append-only for the app
do $$ declare p uuid; begin
  select id into p from parents limit 1;
  insert into ledger_entries (school_id, parent_id, kind, amount_pence, stripe_object_id) values (current_school(), p, 'charge', 5440, 'pi_test_1');
  begin
    update ledger_entries set amount_pence = 1;
    raise exception 'ledger update was allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into ledger_entries (school_id, parent_id, kind, amount_pence, stripe_object_id) values (current_school(), p, 'charge', 5440, 'pi_test_1');
    raise exception 'duplicate Stripe event was recorded twice';
  exception when unique_violation then null; end;
end $$;

select set_config('app.school_id', :'demo_id', false);
do $$ begin
  assert (select count(*) from course_groups) = 0, 'Demo Academy sees none of OH-SO ED''s classes';
  assert (select count(*) from teacher_term_pay) = 0, 'Demo Academy can''t see OH-SO ED''s payroll through the view';
  assert (select count(*) from pay_run_lines) = 0, 'Demo Academy can''t see OH-SO ED''s pay runs';
  assert (select count(*) from report_cycles) = 0, 'Demo Academy can''t see OH-SO ED''s reports';
  assert (select count(*) from parents) = 1, 'Demo Academy sees only its own parent';
end $$;

-- no school set = no rows at all
select set_config('app.school_id', '', false);
do $$ begin assert (select count(*) from students) = 0, 'no school context must show nothing'; end $$;
reset role;

\echo 'ALL DATABASE CHECKS PASSED'
