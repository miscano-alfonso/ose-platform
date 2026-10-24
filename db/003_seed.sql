-- Seed data for development and testing.
-- Catalogue (levels, subjects, prices, class slots) matches the public OH-SO ED site and admin Finance page (Oct 2026).
-- People are FICTIONAL. Term dates are EXAMPLES until the real 2026/27 dates are confirmed.
-- Course shapes (lessons a week x terms) confirmed by OH-SO ED. Pre-GCSE core is £816 and Pre-GCSE lessons are 45 minutes
-- (from the live course page). The 2-year GCSE split is an ASSUMPTION. Times outside KS3 and Pre-GCSE Science are EXAMPLES.

do $$
declare
  s uuid; demo uuid; y uuid; dy uuid;
  l_ks3 uuid; l_pre uuid; l_ig uuid; l_al uuid;
  pp_ks3 uuid; pp_pre uuid; pp_core uuid; pp_g1 uuid; pp_g2a uuid; pp_g2b uuid;
  sub record; t_rachel uuid; t_becky uuid; t_leanne uuid; t_jade uuid; u uuid;
  par1 uuid; par2 uuid; st1 uuid; st2 uuid; st3 uuid;
begin
  insert into schools (slug, name, legal_name, brand)
  values ('ohsoed', 'OH-SO ED', 'Oh-so Educate Ltd', '{"primary":"#0f1747","accent":"#e3cd4b","font":"Jost"}')
  returning id into s;
  insert into schools (slug, name, brand) values ('demo-academy', 'Demo Academy', '{"primary":"#14532d","accent":"#f59e0b","font":"Nunito Sans"}')
  returning id into demo;

  insert into users (school_id, email, name, role) values (null, 'platform@ohsoedtech.example', 'Platform Admin', 'platform_admin');
  insert into users (school_id, email, name, role) values (s, 'admin@ohsoed.example', 'School Admin', 'school_admin');

  -- calendar (example dates)
  insert into academic_years (school_id, label, starts_on, ends_on) values (s, '2026/27', '2026-09-01', '2027-07-23') returning id into y;
  -- 2026-27 term dates from ohsoed.co.uk/terms (Term 1 is paid on enrolment; the others two weeks before each term)
  insert into terms (school_id, academic_year_id, number, name, starts_on, ends_on, bills_on) values
    (s, y, 1, 'Term 1', '2026-09-07', '2026-10-16', '2026-09-01'),
    (s, y, 2, 'Term 2', '2026-11-02', '2026-12-11', '2026-10-19'),
    (s, y, 3, 'Term 3', '2027-01-04', '2027-02-12', '2026-12-21'),
    (s, y, 4, 'Term 4', '2027-02-22', '2027-03-26', '2027-02-08'),
    (s, y, 5, 'Term 5', '2027-04-19', '2027-05-28', '2027-04-05'),
    (s, y, 6, 'Term 6', '2027-06-07', '2027-07-09', '2027-05-24');
  insert into holidays (school_id, name, starts_on, ends_on) values
    (s, 'Break after Term 1', '2026-10-19', '2026-11-01'),
    (s, 'Break after Term 2', '2026-12-14', '2027-01-03'),
    (s, 'Break after Term 3', '2027-02-15', '2027-02-21'),
    (s, 'Break after Term 4', '2027-03-29', '2027-04-18'),
    (s, 'Break after Term 5', '2027-05-31', '2027-06-06');

  -- levels & subjects
  insert into levels (school_id, name, min_age, max_age, sort_order) values (s, 'KS3', 11, 13, 1) returning id into l_ks3;
  insert into levels (school_id, name, min_age, max_age, sort_order) values (s, 'Pre-GCSE', 13, 14, 2) returning id into l_pre;
  insert into levels (school_id, name, min_age, max_age, sort_order) values (s, 'iGCSE', 14, 16, 3) returning id into l_ig;
  insert into levels (school_id, name, min_age, max_age, sort_order) values (s, 'A-Level', 16, 18, 4) returning id into l_al;
  insert into subjects (school_id, name, colour) values
    (s, 'English Language', '#3d7fd9'), (s, 'English Literature', '#2b5aa8'), (s, 'Maths', '#4f9b6c'),
    (s, 'Geography', '#ee8748'), (s, 'History', '#6a4c9c'), (s, 'Science', '#b9b22c'), (s, 'Business Studies', '#8494c2'),
    (s, 'Biology', '#2f9d8f'), (s, 'Chemistry', '#c2577a'), (s, 'Physics', '#5a6fd6');

  -- price plans: cost per lesson x lessons = year total; one instalment per term the course runs
  insert into price_plans (school_id, academic_year_id, level_id, name, lessons_per_week, term_count, lessons, cost_per_lesson_pence, registration_fee_pence, reminder_days)
    values (s, y, l_ks3, 'KS3', 1, 6, 34, 800, 2500, 18) returning id into pp_ks3;
  insert into price_plans (school_id, academic_year_id, level_id, name, lessons_per_week, term_count, lessons, cost_per_lesson_pence, registration_fee_pence)
    values (s, y, l_pre, 'Pre-GCSE', 1, 6, 34, 1200, 2500) returning id into pp_pre;
  insert into price_plans (school_id, academic_year_id, level_id, name, lessons_per_week, term_count, lessons, cost_per_lesson_pence, registration_fee_pence)
    values (s, y, l_pre, 'Pre-GCSE core', 2, 6, 68, 1200, 2500) returning id into pp_core;
  insert into price_plans (school_id, academic_year_id, level_id, name, lessons_per_week, term_count, lessons, cost_per_lesson_pence, registration_fee_pence)
    values (s, y, l_ig, 'GCSE 1-year', 3, 5, 87, 1400, 2500) returning id into pp_g1;
  insert into price_plans (school_id, academic_year_id, level_id, name, course_years, year_of_course, lessons_per_week, term_count, lessons, cost_per_lesson_pence, registration_fee_pence)
    values (s, y, l_ig, 'GCSE 2-year, year 1', 2, 1, 2, 6, 68, 1400, 2500) returning id into pp_g2a;
  insert into price_plans (school_id, academic_year_id, level_id, name, course_years, year_of_course, lessons_per_week, term_count, lessons, cost_per_lesson_pence, registration_fee_pence)
    values (s, y, l_ig, 'GCSE 2-year, year 2', 2, 2, 2, 5, 60, 1400, 2500) returning id into pp_g2b;

  insert into bundle_discounts (school_id, academic_year_id, level_id, min_courses, percent_off) values
    (s, y, null, 3, 10), (s, y, null, 5, 15);
  insert into coupons (school_id, code, percent_off, valid_to) values (s, 'SIBLING10', 10, '2027-07-23');

  -- teachers (staff names as shown on the public site)
  insert into users (school_id, email, name, role) values (s, 'rachel@ohsoed.example', 'Rachel Rowe', 'teacher') returning id into u;
  insert into teachers (school_id, user_id, designation) values (s, u, 'Science Teacher') returning id into t_rachel;
  insert into users (school_id, email, name, role) values (s, 'becky@ohsoed.example', 'Becky Randle', 'teacher') returning id into u;
  insert into teachers (school_id, user_id, designation) values (s, u, 'Mathematics & Geography Teacher') returning id into t_becky;
  insert into users (school_id, email, name, role) values (s, 'leanne@ohsoed.example', 'Leanne Iacurci', 'teacher') returning id into u;
  insert into teachers (school_id, user_id, designation) values (s, u, 'Principal & English Teacher') returning id into t_leanne;
  insert into users (school_id, email, name, role) values (s, 'jade@ohsoed.example', 'Jade Hicks', 'teacher') returning id into u;
  insert into teachers (school_id, user_id, designation) values (s, u, 'Business & History Teacher') returning id into t_jade;

  -- classes: (level, subject, code, plan, teacher, status)
  insert into course_groups (school_id, academic_year_id, level_id, subject_id, price_plan_id, teacher_id, code, status, capacity, lesson_minutes)
  select s, y, x.lvl, sj.id, x.plan, x.teacher, x.code, x.st::group_status, 12, case when x.lvl = l_pre then 45 else 60 end
  from (values
    (l_ks3, 'English Language',   'KEng26/1', pp_ks3,  t_leanne, 'open'),
    (l_ks3, 'English Literature', 'KLit26/1', pp_ks3,  t_leanne, 'open'),
    (l_ks3, 'Maths',              'KMat26/1', pp_ks3,  t_becky,  'open'),
    (l_ks3, 'Geography',          'KGeo26/1', pp_ks3,  t_becky,  'waitlist'),
    (l_ks3, 'History',            'KHis26/1', pp_ks3,  t_jade,   'waitlist'),
    (l_ks3, 'Science',            'KSci26/1', pp_ks3,  t_rachel, 'waitlist'),
    (l_pre, 'English Language',   'PEng26/1', pp_core, t_leanne, 'open'),
    (l_pre, 'Maths',              'PMat26/1', pp_core, t_becky,  'open'),
    (l_pre, 'Science',            'PSci26/1', pp_core, t_rachel, 'open'),
    (l_pre, 'English Literature', 'PLit26/1', pp_pre,  t_leanne, 'open'),
    (l_pre, 'Geography',          'PGeo26/1', pp_pre,  t_becky,  'open'),
    (l_pre, 'History',            'PHis26/1', pp_pre,  t_jade,   'open'),
    (l_pre, 'Business Studies',   'PBus26/1', pp_pre,  t_jade,   'open'),
    (l_ig,  'English Language',   'GEng26/1', pp_g1,   t_leanne, 'open'),
    (l_ig,  'English Literature', 'GLit26/1', pp_g1,   t_leanne, 'open'),
    (l_ig,  'Biology',            'GBio26/1', pp_g1,   t_rachel, 'open'),
    (l_ig,  'Chemistry',          'GChe26/1', pp_g1,   t_rachel, 'open'),
    (l_ig,  'Physics',            'GPhy26/1', pp_g1,   t_rachel, 'open'),
    (l_ig,  'Maths',              'GMat26/1', pp_g2a,  t_becky,  'open'),
    (l_ig,  'Geography',          'GGeo26/1', pp_g2a,  t_becky,  'open'),
    (l_ig,  'History',            'GHis26/1', pp_g2a,  t_jade,   'open'),
    (l_ig,  'Business Studies',   'GBus26/1', pp_g2a,  t_jade,   'open'),
    (l_ig,  'Maths',              'GMat25', pp_g2b,  t_becky,  'closed')     -- year 2 of the cohort that started in 2025
  ) as x(lvl, subj, code, plan, teacher, st)
  join subjects sj on sj.school_id = s and sj.name = x.subj;

  -- timetable: one row per weekly lesson (60 minutes). KS3 times are from the public site; the rest are examples.
  insert into lesson_slots (school_id, academic_year_id, group_id, teacher_id, weekday, starts_at, ends_at)
  select s, y, g.id, g.teacher_id, x.wd, x.t::time, x.t::time + make_interval(mins => g.lesson_minutes)
  from (values
    ('KEng26/1',2,'11:30'), ('KLit26/1',3,'11:30'), ('KMat26/1',2,'13:00'), ('KGeo26/1',4,'10:30'), ('KHis26/1',4,'09:30'), ('KSci26/1',3,'13:00'),
    ('PEng26/1',1,'09:30'), ('PEng26/1',4,'09:30'), ('PMat26/1',1,'11:30'), ('PMat26/1',3,'10:30'), ('PSci26/1',1,'10:30'), ('PSci26/1',5,'10:30'),
    ('PLit26/1',5,'09:30'), ('PGeo26/1',5,'11:30'), ('PHis26/1',2,'13:00'), ('PBus26/1',3,'13:00'),
    ('GEng26/1',1,'11:30'), ('GEng26/1',3,'09:30'), ('GEng26/1',5,'11:30'),
    ('GLit26/1',1,'13:00'), ('GLit26/1',3,'14:00'), ('GLit26/1',5,'13:00'),
    ('GBio26/1',1,'09:30'), ('GBio26/1',3,'10:30'), ('GBio26/1',5,'09:30'),
    ('GChe26/1',2,'11:30'), ('GChe26/1',4,'09:30'), ('GChe26/1',5,'14:00'),
    ('GPhy26/1',1,'15:00'), ('GPhy26/1',3,'11:30'), ('GPhy26/1',4,'10:30'),
    ('GMat26/1',1,'14:00'), ('GMat26/1',4,'14:00'), ('GMat25',2,'14:00'), ('GMat25',5,'14:00'),
    ('GGeo26/1',2,'09:30'), ('GGeo26/1',4,'13:00'), ('GHis26/1',2,'15:00'), ('GHis26/1',4,'15:00'), ('GBus26/1',3,'15:00'), ('GBus26/1',5,'15:00')
  ) as x(code, wd, t)
  join course_groups g on g.school_id = s and g.code = x.code;

  -- teacher pay per lesson, by level
  insert into pay_rates (school_id, level_id, rate_pence, valid_from) values
    (s, l_ks3, 4000, '2026-09-01'), (s, l_pre, 4500, '2026-09-01'), (s, l_ig, 5000, '2026-09-01');

  -- grading key (from the OH-SO ED report template)
  insert into grade_bands (school_id, score, label, min_pct) values
    (s, 5, 'Exceeding', 95), (s, 4, 'Secure', 70), (s, 3, 'Meeting', 50), (s, 2, 'Working Towards', 40), (s, 1, 'Improvement Needed', 0);
  insert into report_cycles (school_id, academic_year_id, term_id, name, marks_from, marks_to, comments_due, publish_on)
    select s, y, id, 'Term 1 Progress Report', '2026-09-07', '2026-10-23', '2026-10-16', '2026-10-23' from terms where academic_year_id = y and number = 1;

  -- fictional families
  insert into parents (school_id, first_name, last_name, email, heard_about) values (s, 'Test', 'Parent One', 'parent1@example.test', 'Google search') returning id into par1;
  insert into parents (school_id, first_name, last_name, email, heard_about) values (s, 'Test', 'Parent Two', 'parent2@example.test', 'Word of mouth') returning id into par2;
  insert into students (school_id, parent_id, first_name, last_name) values (s, par1, 'Ada', 'Example') returning id into st1;
  insert into students (school_id, parent_id, first_name, last_name) values (s, par1, 'Ben', 'Example') returning id into st2;
  insert into students (school_id, parent_id, first_name, last_name) values (s, par2, 'Cleo', 'Sample') returning id into st3;

  -- 1:1 tutoring: 45-minute sessions. Teachers offer 1:1s in the subjects and levels they teach. Rates are EXAMPLES until confirmed.
  insert into teacher_subjects (teacher_id, level_id, subject_id)
    select distinct teacher_id, level_id, subject_id from course_groups where school_id = s and teacher_id is not null
  on conflict do nothing;
  insert into tutoring_rates (school_id, level_id, audience, minutes, price_pence, teacher_pay_pence, valid_from) values
    (s, l_ks3, 'public', 45, 3500, 2500, '2026-09-01'), (s, l_ks3, 'enrolled', 45, 3000, 2500, '2026-09-01'),
    (s, l_pre, 'public', 45, 3800, 2700, '2026-09-01'), (s, l_pre, 'enrolled', 45, 3200, 2700, '2026-09-01'),
    (s, l_ig,  'public', 45, 4200, 3000, '2026-09-01'), (s, l_ig,  'enrolled', 45, 3500, 3000, '2026-09-01');
  insert into tutoring_availability (school_id, teacher_id, weekday, starts_at, ends_at, valid_from) values
    (s, t_rachel, 1, '16:00', '18:00', '2026-09-01'), (s, t_rachel, 3, '15:00', '17:00', '2026-09-01'),
    (s, t_becky,  2, '15:30', '18:00', '2026-09-01'), (s, t_becky,  4, '16:00', '18:00', '2026-09-01'),
    (s, t_leanne, 3, '16:00', '18:00', '2026-09-01'), (s, t_jade,   4, '16:00', '18:00', '2026-09-01');

  -- workshops / one-off lessons: one free, one paid
  insert into workshops (school_id, title, slug, level_id, subject_id, teacher_id, starts_at, minutes, capacity, price_pence, enrolled_price_pence, teacher_pay_pence, summary, status)
  select s, 'The Chronicles of Narnia Workshop', 'the-chronicles-of-narnia-workshop', l_ks3, sj.id, t_leanne, '2026-11-09 11:30 Europe/London', 45, 20, 0, null, 4000,
         'An introduction to C.S. Lewis''s novel: its characters, plot and fantasy world, through fun, interactive activities.', 'published'
  from subjects sj where sj.school_id = s and sj.name = 'English Literature';
  insert into workshops (school_id, title, slug, level_id, subject_id, teacher_id, starts_at, minutes, capacity, price_pence, enrolled_price_pence, teacher_pay_pence, summary, status)
  select s, 'GCSE Maths: Exam Technique', 'gcse-maths-exam-technique', l_ig, sj.id, t_becky, '2026-11-14 10:00 Europe/London', 90, 12, 1500, 1000, 7500,
         'How to read questions, show working for method marks and manage time in the paper.', 'published'
  from subjects sj where sj.school_id = s and sj.name = 'Maths';

  -- cancellation notice by level, as agreed in the T&Cs (clause 5): KS3 and Pre-GCSE 1 full term, GCSE 2
  update levels set notice_terms = 2 where id = l_ig;
  insert into terms_documents (school_id, version, body_md, key_points) values (s, '2026-09', '(full Terms & Conditions text from ohsoed.co.uk/terms-conditions)',
    '["Enrolment is for the academic year, paid in one instalment per term.", "Cancelling a KS3 or Pre-GCSE course needs one full term''s notice; a GCSE course needs two full terms'' notice.", "You can cancel within 14 days of the course start for a full refund, if your child hasn''t used the learning platforms.", "Lesson and Google Classroom links must not be shared outside the class."]');

  -- second school, so tenancy can be tested
  insert into academic_years (school_id, label, starts_on, ends_on) values (demo, '2026/27', '2026-09-01', '2027-07-23') returning id into dy;
  insert into levels (school_id, name) values (demo, 'KS3');
  insert into parents (school_id, first_name, last_name, email) values (demo, 'Other', 'School Parent', 'parent1@example.test');
end $$;

-- data protection defaults: retention schedule and the suppliers that process personal data for OH-SO ED
do $$ declare s uuid; begin
  for s in select id from schools loop perform default_retention(s); end loop;
  select id into s from schools where slug = 'ohsoed';
  insert into processors (school_id, name, purpose, data, location, transfer_safeguard) values
    (s, 'Google (Workspace for Education)', 'Classroom, Meet, school email accounts', 'Student and teacher names, emails, classwork, Meet participation', 'EU/US', 'Google Cloud DPA; UK Extension to the EU-US Data Privacy Framework'),
    (s, 'Stripe', 'Card payments and refunds', 'Parent name, email, card details (held by Stripe only), payment amounts', 'UK/EU/US', 'Stripe DPA; UK IDTA'),
    (s, 'AttendList', 'Meet attendance (until the platform reads Meet directly)', 'Student names, emails, join/leave times', 'To confirm', 'To confirm: DPA and transfer terms'),
    (s, 'Anthropic (Claude)', 'Report-comment and admin assistants; reminder emails', 'Student first names, marks, earlier comments; class lists', 'US', 'Anthropic commercial terms + DPA; UK IDTA/Addendum'),
    (s, 'Hosting provider (to choose)', 'Website, dashboards and database', 'All platform data', 'UK/EU preferred', 'DPA; UK/EU region'),
    (s, 'Email delivery provider (to choose)', 'Automatic emails', 'Names and email addresses', 'To confirm', 'DPA');
end $$;
