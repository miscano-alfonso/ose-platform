-- OH-SO platform: core schema (milestone 1)
-- Multi-school from day one: every school-owned row carries school_id, and
-- row-level security (002_rls.sql) stops one school ever reading another's data.
-- Money is stored in pence (integer) to avoid rounding errors.

create extension if not exists citext;
create extension if not exists btree_gist;   -- lets the database refuse double-booked teachers

-- ---------- tenancy & people ----------
create table schools (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name            text not null,
  legal_name      text,
  timezone        text not null default 'Europe/London',
  currency        char(3) not null default 'GBP',
  brand           jsonb not null default '{}'::jsonb,      -- colours, font, logo asset
  stripe_account_id text,                                   -- Stripe Connect account per school
  created_at      timestamptz not null default now()
);

create type user_role as enum ('platform_admin', 'school_admin', 'teacher', 'parent');

create table users (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid references schools(id) on delete cascade,  -- null only for platform admins
  email           citext not null,
  name            text not null,
  role            user_role not null,
  phone           text,
  password_hash   text,                                     -- null when sign-in is by email link only
  created_at      timestamptz not null default now(),
  unique (school_id, email),
  check ((role = 'platform_admin') = (school_id is null))
);

create table teachers (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  user_id         uuid not null unique references users(id) on delete cascade,
  designation     text,
  bio             text,
  photo_asset     text,                                     -- photo shown on course pages, workshops and the teachers page
  archived_at     timestamptz
);

create table parents (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  user_id         uuid unique references users(id) on delete set null,
  first_name      text not null,
  last_name       text not null,
  email           citext not null,
  phone           text,
  heard_about     text,
  stripe_customer_id text,
  created_at      timestamptz not null default now(),
  unique (school_id, email)
);

create table students (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  parent_id       uuid not null references parents(id) on delete restrict,
  first_name      text not null,
  last_name       text not null,
  known_as        text,                                     -- "Class name" in the old admin
  email           citext,                                   -- Google account used for Classroom/Meet
  gender          text,
  date_of_birth   date,
  created_at      timestamptz not null default now()
);

-- ---------- calendar ----------
create table academic_years (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  label           text not null,                            -- '2026/27'
  starts_on       date not null,
  ends_on         date not null,
  unique (school_id, label),
  check (ends_on > starts_on)
);

create table terms (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  number          smallint not null check (number between 1 and 6),
  name            text not null,
  starts_on       date not null,
  ends_on         date not null,
  bills_on        date not null,                            -- date the instalment for this term is charged
  unique (academic_year_id, number),
  check (ends_on >= starts_on)
);

create table holidays (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  name            text not null,
  starts_on       date not null,
  ends_on         date not null,
  check (ends_on >= starts_on)
);

-- ---------- catalogue ----------
create table levels (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  name            text not null,                            -- KS3, Pre-GCSE, iGCSE, A-Level
  min_age         smallint,
  max_age         smallint,
  sort_order      smallint not null default 0,
  unique (school_id, name)
);

create table subjects (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  name            text not null,
  colour          text check (colour ~ '^#[0-9a-fA-F]{6}$'),
  unique (school_id, name)
);

create table teacher_subjects (
  teacher_id      uuid not null references teachers(id) on delete cascade,
  level_id        uuid not null references levels(id) on delete cascade,
  subject_id      uuid not null references subjects(id) on delete cascade,
  primary key (teacher_id, level_id, subject_id)
);

-- What a course costs and how it runs, for one year of the course.
-- Course shapes (confirmed by OH-SO ED, Oct 2026):
--   KS3                       1 lesson a week, 6 terms
--   Pre-GCSE core subjects    2 lessons a week, 6 terms   (English, Maths, Science)
--   GCSE 1-year courses       3 lessons a week, 5 terms   (English, Literature, single sciences)
--   GCSE 2-year courses       year 1: 2 a week, 6 terms; year 2: 2 a week, 5 terms
-- A 2-year course has one plan per course year; each year is enrolled and billed on its own.
create table price_plans (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  level_id        uuid not null references levels(id) on delete cascade,
  name            text not null,                            -- e.g. 'GCSE 2-year, year 1'
  course_years    smallint not null default 1 check (course_years between 1 and 3),
  year_of_course  smallint not null default 1,
  lessons_per_week smallint not null check (lessons_per_week between 1 and 5),
  term_count      smallint not null check (term_count between 1 and 6),   -- runs in terms 1..term_count; one instalment per term
  lessons         smallint not null check (lessons > 0),    -- lessons charged for this course year
  cost_per_lesson_pence integer not null check (cost_per_lesson_pence >= 0),
  registration_fee_pence integer not null default 0 check (registration_fee_pence >= 0),
  reminder_days   smallint not null default 15,             -- days before a charge that parents are reminded
  total_pence     integer generated always as (cost_per_lesson_pence * lessons) stored,
  unique (academic_year_id, name),
  check (year_of_course between 1 and course_years)
);

-- Multi-subject discounts (homepage: 3 courses = 10% off, 5 courses = 15% off)
create table bundle_discounts (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  level_id        uuid references levels(id) on delete cascade,   -- null = any level
  min_courses     smallint not null check (min_courses >= 2),
  percent_off     numeric(5,2) not null check (percent_off > 0 and percent_off < 100),
  unique (academic_year_id, level_id, min_courses)
);

create table coupons (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  code            citext not null,
  percent_off     numeric(5,2) check (percent_off > 0 and percent_off <= 100),
  amount_off_pence integer check (amount_off_pence > 0),
  valid_from      date,
  valid_to        date,
  max_redemptions integer,
  active          boolean not null default true,
  unique (school_id, code),
  check ((percent_off is null) <> (amount_off_pence is null))
);

-- A class: one subject at one level for one academic year, taught in one or more weekly lessons
-- waitlist: collecting sign-ups (no days/times shown) · priority: waiting-list families have 48 hours to book · open: anyone can book
create type group_status as enum ('open', 'waitlist', 'priority', 'closed', 'hidden');

create table course_groups (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  level_id        uuid not null references levels(id),
  subject_id      uuid not null references subjects(id),
  price_plan_id   uuid not null references price_plans(id),
  teacher_id      uuid references teachers(id) on delete set null,   -- main teacher
  continues_group_id uuid references course_groups(id),             -- year 2 of a 2-year course points at its year 1 class
  code            text not null,                            -- e.g. KEng26
  capacity        smallint,
  lesson_minutes  smallint not null default 60 check (lesson_minutes between 15 and 180),
  status          group_status not null default 'open',
  waitlist_threshold smallint not null default 5,       -- sign-ups needed before the course opens
  priority_hours  smallint not null default 48,         -- head start the waiting list gets
  priority_until  timestamptz,                          -- set when the threshold is reached
  google_course_id text,
  meet_url        text,
  description     text,
  unique (school_id, code)
);

-- Course detail page content (topics, teacher intro) shown on the website, edited in the page editor
create table course_pages (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  level_id        uuid not null references levels(id) on delete cascade,
  subject_id      uuid not null references subjects(id) on delete cascade,
  slug            text not null,                            -- e.g. pre-gcse/science
  intro           text,
  topics          jsonb not null default '[]'::jsonb,       -- [{title, text}]
  extra_blocks    jsonb not null default '[]'::jsonb,       -- other page-editor blocks
  sample_video_url text check (sample_video_url ~ '^https://(drive\.google\.com|www\.youtube\.com|youtu\.be)/'),  -- the chosen recorded lesson (Google Drive, shared "anyone with the link")
  sample_title    text,
  published       boolean not null default false,
  unique (school_id, slug),
  unique (school_id, level_id, subject_id)
);

-- The timetable: each weekly lesson of a class, placed by an admin.
-- The database refuses a slot that double-books a teacher in the same academic year.
create table lesson_slots (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  group_id        uuid not null references course_groups(id) on delete cascade,
  teacher_id      uuid references teachers(id) on delete set null,   -- usually the class teacher; can differ (cover, split classes)
  weekday         smallint not null check (weekday between 1 and 7),  -- ISO: 1 = Monday
  starts_at       time not null,
  ends_at         time not null,
  minutes         int4range generated always as (int4range(
                    (extract(hour from starts_at) * 60 + extract(minute from starts_at))::int,
                    (extract(hour from ends_at) * 60 + extract(minute from ends_at))::int)) stored,
  check (ends_at > starts_at),
  exclude using gist (teacher_id with =, academic_year_id with =, weekday with =, minutes with &&)
    where (teacher_id is not null)
);
create index lesson_slots_group on lesson_slots (group_id);

-- ---------- enrolment & billing ----------
create type enrolment_status as enum ('pending', 'active', 'swapped', 'cancelled', 'completed');

create table orders (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  parent_id       uuid not null references parents(id),
  status          text not null default 'open' check (status in ('open', 'paid', 'abandoned', 'failed')),
  coupon_id       uuid references coupons(id),
  subtotal_pence  integer not null default 0,
  discount_pence  integer not null default 0,
  registration_fee_pence integer not null default 0,
  first_payment_pence integer not null default 0,           -- what checkout charges today
  stripe_checkout_session_id text unique,
  created_at      timestamptz not null default now(),
  paid_at         timestamptz
);

create table enrolments (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  student_id      uuid not null references students(id) on delete restrict,
  group_id        uuid not null references course_groups(id) on delete restrict,
  order_id        uuid references orders(id),
  status          enrolment_status not null default 'pending',
  is_taster       boolean not null default false,
  list_price_pence integer not null,                        -- price plan total at enrolment time
  discount_pence  integer not null default 0,               -- bundle + coupon share
  swapped_from_id uuid references enrolments(id),
  allow_clash     boolean not null default false,           -- admin accepted a timetable clash for this student
  enrolled_at     timestamptz not null default now(),
  ended_at        timestamptz,
  end_reason      text
);
-- one live enrolment per student per class
create unique index enrolments_one_live on enrolments (student_id, group_id)
  where status in ('pending', 'active');

create type instalment_status as enum ('scheduled', 'processing', 'paid', 'failed', 'refunded', 'part_refunded', 'cancelled', 'waived');

create table instalments (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  enrolment_id    uuid not null references enrolments(id) on delete cascade,
  term_id         uuid not null references terms(id),
  due_on          date not null,
  amount_pence    integer not null check (amount_pence >= 0),
  status          instalment_status not null default 'scheduled',
  attempts        smallint not null default 0,
  stripe_payment_intent_id text,
  paid_at         timestamptz,
  refunded_pence  integer not null default 0 check (refunded_pence >= 0),
  unique (enrolment_id, term_id),
  check (refunded_pence <= amount_pence)
);
create index instalments_due on instalments (school_id, due_on) where status = 'scheduled';

-- Registration fee: once per student per academic year
create table registration_fees (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  student_id      uuid not null references students(id),
  academic_year_id uuid not null references academic_years(id),
  order_id        uuid references orders(id),
  amount_pence    integer not null,
  paid_at         timestamptz,
  unique (student_id, academic_year_id)
);

-- Every movement of money, mirrored from Stripe webhooks (append-only)
create table ledger_entries (
  id              bigserial primary key,
  school_id       uuid not null references schools(id) on delete cascade,
  parent_id       uuid not null references parents(id),
  kind            text not null check (kind in ('charge', 'refund', 'failed_charge')),
  amount_pence    integer not null,
  instalment_id   uuid references instalments(id),
  order_id        uuid references orders(id),
  stripe_object_id text unique,                              -- pi_/re_/ch_ id: makes webhooks idempotent
  created_at      timestamptz not null default now()
);

-- ---------- leads ----------
create table waitlist_entries (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  level_id        uuid references levels(id),
  subject_id      uuid references subjects(id),
  group_id        uuid references course_groups(id),
  parent_name     text not null,
  child_name      text not null,
  email           citext not null,
  emailed_at      timestamptz,                              -- when they were invited to book (threshold reached)
  enrolled_at     timestamptz,
  created_at      timestamptz not null default now()
);

-- When the 5th family joins a class's waiting list: invite everyone on it and start the 48-hour priority window.
create or replace function waitlist_check_threshold() returns trigger language plpgsql as $$
declare g course_groups%rowtype; n int;
begin
  if new.group_id is null then return new; end if;
  select * into g from course_groups where id = new.group_id for update;
  if g.status <> 'waitlist' then return new; end if;
  select count(*) into n from waitlist_entries where group_id = new.group_id and enrolled_at is null;
  if n >= g.waitlist_threshold then
    update course_groups set status = 'priority', priority_until = now() + make_interval(hours => g.priority_hours) where id = g.id;
    update waitlist_entries set emailed_at = now() where group_id = g.id and emailed_at is null;   -- the email job sends to rows stamped here
  end if;
  return new;
end $$;
create trigger waitlist_threshold after insert on waitlist_entries for each row execute function waitlist_check_threshold();

-- Run every few minutes: priority windows that have ended open the course to everyone.
create or replace function open_expired_priority() returns integer language plpgsql as $$
declare n int;
begin
  update course_groups set status = 'open' where status = 'priority' and priority_until <= now();
  get diagnostics n = row_count;
  return n;
end $$;

-- Who may book a class right now: anyone when open; during priority, only families invited from the waiting list.
create or replace function can_book(p_group uuid, p_email citext) returns boolean language sql stable as $$
  select case g.status
    when 'open' then true
    when 'priority' then exists (select 1 from waitlist_entries w where w.group_id = g.id and w.email = p_email and w.emailed_at is not null)
    else false end
  from course_groups g where g.id = p_group
$$;

create table enquiries (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  kind            text not null default 'contact' check (kind in ('contact', 'taster')),
  name            text not null,
  email           citext not null,
  levels          text[] not null default '{}',
  heard_about     text,
  message         text,
  handled_at      timestamptz,
  created_at      timestamptz not null default now()
);

create table audit_log (
  id              bigserial primary key,
  school_id       uuid references schools(id) on delete cascade,
  actor_user_id   uuid references users(id) on delete set null,
  action          text not null,
  entity          text not null,
  entity_id       uuid,
  detail          jsonb,
  created_at      timestamptz not null default now()
);

-- ---------- timetable checks ----------
-- Lessons of class `g` that overlap lessons of the student's other live classes.
create or replace function student_clashes(p_student uuid, p_group uuid)
returns table (clashing_group uuid, weekday smallint, starts_at time, ends_at time)
language sql stable as $$
  select o.group_id, o.weekday, o.starts_at, o.ends_at
  from lesson_slots n
  join enrolments e on e.student_id = p_student and e.status in ('pending', 'active') and e.group_id <> p_group
  join lesson_slots o on o.group_id = e.group_id and o.weekday = n.weekday and o.minutes && n.minutes
  where n.group_id = p_group
$$;

-- Enrolling a student into a class that clashes with their timetable is refused unless an admin allows it.
create or replace function enrolments_check_clash() returns trigger language plpgsql as $$
begin
  if new.status in ('pending', 'active') and not new.allow_clash
     and exists (select 1 from student_clashes(new.student_id, new.group_id)) then
    raise exception 'timetable clash: this class overlaps another of the student''s classes'
      using errcode = 'exclusion_violation';
  end if;
  return new;
end $$;
create trigger enrolments_no_clash before insert or update of group_id, status, allow_clash on enrolments
  for each row execute function enrolments_check_clash();

-- Classes at the same level and course year whose lessons overlap: a student can't take both. Shown to admins as warnings.
create or replace view level_clashes with (security_invoker = true) as
  select a.school_id, a.academic_year_id, ga.level_id, a.group_id as group_a, b.group_id as group_b, a.weekday,
         greatest(a.starts_at, b.starts_at) as from_time, least(a.ends_at, b.ends_at) as to_time
  from lesson_slots a
  join lesson_slots b on b.academic_year_id = a.academic_year_id and b.weekday = a.weekday
                     and a.minutes && b.minutes and a.group_id < b.group_id
  join course_groups ga on ga.id = a.group_id
  join course_groups gb on gb.id = b.group_id and gb.level_id = ga.level_id
  join price_plans pa on pa.id = ga.price_plan_id
  join price_plans pb on pb.id = gb.price_plan_id and pb.year_of_course = pa.year_of_course;   -- year-2 classes are a different cohort

-- ---------- lessons as they happen ----------
-- One row per lesson on a real date, generated from the timetable for each term (holidays skipped).
-- Attendance registers and teacher pay both hang off this table.
create type lesson_status as enum ('scheduled', 'taught', 'cancelled');

create table lesson_events (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  slot_id         uuid not null references lesson_slots(id) on delete cascade,
  group_id        uuid not null references course_groups(id) on delete cascade,
  term_id         uuid not null references terms(id) on delete cascade,
  lesson_date     date not null,
  teacher_id      uuid references teachers(id),          -- who actually taught it (cover changes this)
  status          lesson_status not null default 'scheduled',
  note            text,                                   -- e.g. 'Cover for Jade', 'Cancelled: teacher ill'
  unique (slot_id, lesson_date)
);
create index lesson_events_teacher on lesson_events (teacher_id, lesson_date);

create or replace function generate_lesson_events(p_term uuid) returns integer language plpgsql as $$
declare n integer;
begin
  insert into lesson_events (school_id, slot_id, group_id, term_id, lesson_date, teacher_id)
  select s.school_id, s.id, s.group_id, t.id, d::date, s.teacher_id
  from terms t
  join lesson_slots s on s.academic_year_id = t.academic_year_id
  join course_groups g on g.id = s.group_id and g.status <> 'hidden'
  join price_plans p on p.id = g.price_plan_id and t.number <= p.term_count     -- a 5-term course has no term-6 lessons
  cross join generate_series(t.starts_on, t.ends_on, interval '1 day') d
  where t.id = p_term
    and extract(isodow from d) = s.weekday
    and not exists (select 1 from holidays h where h.school_id = t.school_id and d::date between h.starts_on and h.ends_on)
  on conflict (slot_id, lesson_date) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------- teacher pay ----------
-- Teachers are paid per lesson taught, at a rate set by level (OH-SO ED: KS3 £40, Pre-GCSE £45, GCSE £50).
-- A teacher-specific rate, when set, overrides the level rate.
create table pay_rates (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  level_id        uuid not null references levels(id) on delete cascade,
  teacher_id      uuid references teachers(id) on delete cascade,   -- null = the rate for everyone at this level
  rate_pence      integer not null check (rate_pence >= 0),
  valid_from      date not null,
  unique nulls not distinct (school_id, level_id, teacher_id, valid_from)
);

-- Pay day: the Friday after the last day of term (terms end on a Friday, so one week later).
create or replace function term_pay_date(p_term uuid) returns date language sql stable as $$
  select (ends_on + ((5 - extract(isodow from ends_on)::int + 7) % 7) + 7)::date from terms where id = p_term
$$;

create type pay_run_status as enum ('draft', 'approved', 'paid');

create table pay_runs (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  term_id         uuid not null references terms(id) on delete cascade,
  pay_date        date not null,
  status          pay_run_status not null default 'draft',
  approved_by     uuid references users(id),
  approved_at     timestamptz,
  paid_at         timestamptz,
  unique (term_id)
);

create table pay_run_lines (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  pay_run_id      uuid not null references pay_runs(id) on delete cascade,
  teacher_id      uuid not null references teachers(id),
  lessons         integer not null,
  lessons_pence   integer not null,
  extras          integer not null default 0,              -- 1:1s and workshops taught
  extras_pence    integer not null default 0,
  adjustments_pence integer not null default 0,           -- one-offs: training, marking, deductions
  adjustment_note text,
  gross_pence     integer generated always as (lessons_pence + extras_pence + adjustments_pence) stored,
  unique (pay_run_id, teacher_id)
);

-- What each teacher has earned in a term: every taught lesson at the rate in force on that day.
create or replace view teacher_term_pay with (security_invoker = true) as
  select e.school_id, e.term_id, e.teacher_id, l.name as level, count(*)::int as lessons,
         sum(coalesce(
           (select r.rate_pence from pay_rates r where r.school_id = e.school_id and r.level_id = g.level_id and r.teacher_id = e.teacher_id and r.valid_from <= e.lesson_date order by r.valid_from desc limit 1),
           (select r.rate_pence from pay_rates r where r.school_id = e.school_id and r.level_id = g.level_id and r.teacher_id is null and r.valid_from <= e.lesson_date order by r.valid_from desc limit 1)
         ))::int as pay_pence
  from lesson_events e
  join course_groups g on g.id = e.group_id
  join levels l on l.id = g.level_id
  where e.status = 'taught' and e.teacher_id is not null
  group by e.school_id, e.term_id, e.teacher_id, l.name;

-- build_pay_run(term) is defined after the 1:1 and workshop tables (it pays those too).

-- ---------- termly reports ----------
-- Each subject on a report has: Progress 1-5 (from Google Classroom marks, mapped through the grading key),
-- Effort 1-5 (teacher), Working and Predicted grades 9-1 (GCSE courses only) and a teacher comment ("Targets").
create table grade_bands (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  score           smallint not null check (score between 1 and 5),
  label           text not null,                            -- Exceeding, Secure, Meeting, Working Towards, Improvement Needed
  min_pct         numeric(5,2) not null check (min_pct between 0 and 100),
  progress_text   text,
  effort_text     text,
  unique (school_id, score)
);

-- Google Classroom work, synced for each class: what was set, and each student's submission.
-- Parents see due / overdue / submitted lists; reports use the marks on returned work.
create table classroom_coursework (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  group_id        uuid not null references course_groups(id) on delete cascade,
  coursework_id   text not null unique,                     -- Google Classroom courseWork id
  title           text not null,
  due_at          timestamptz,
  max_points      numeric(7,2) check (max_points > 0),      -- null = not marked
  link            text,                                     -- alternateLink into Classroom
  created_at      timestamptz not null default now()
);

create type submission_state as enum ('assigned', 'turned_in', 'returned');

create table classroom_submissions (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  coursework_id   uuid not null references classroom_coursework(id) on delete cascade,
  student_id      uuid not null references students(id) on delete cascade,
  state           submission_state not null default 'assigned',
  late            boolean not null default false,
  turned_in_at    timestamptz,
  points          numeric(7,2) check (points >= 0),
  rubric          jsonb,                                    -- rubric criteria and levels, as returned by Classroom
  graded_at       timestamptz,
  unique (coursework_id, student_id)
);

-- What a parent sees for each piece of work
create or replace view student_assignments with (security_invoker = true) as
  select s.id, s.school_id, s.student_id, c.group_id, c.title, c.due_at, c.link, c.max_points, s.points, s.state, s.late, s.turned_in_at,
         case when s.state in ('turned_in', 'returned') then 'submitted'
              when c.due_at is not null and c.due_at < now() then 'overdue'
              else 'due' end as parent_status
  from classroom_submissions s join classroom_coursework c on c.id = s.coursework_id;

create type report_cycle_status as enum ('writing', 'review', 'published');

create table report_cycles (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  term_id         uuid references terms(id),
  name            text not null,                            -- 'Term 1 Progress Report', 'End of Year Progress Report'
  marks_from      date not null,                            -- Classroom work graded in this window counts
  marks_to        date not null,
  comments_due    date not null,
  publish_on      date not null,
  status          report_cycle_status not null default 'writing',
  published_at    timestamptz,
  unique (academic_year_id, name)
);

create type report_entry_status as enum ('todo', 'draft', 'submitted', 'returned', 'approved');

create table report_entries (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  cycle_id        uuid not null references report_cycles(id) on delete cascade,
  student_id      uuid not null references students(id) on delete cascade,
  group_id        uuid not null references course_groups(id) on delete cascade,
  teacher_id      uuid references teachers(id),
  progress_override smallint check (progress_override between 1 and 5),  -- teacher can overrule the marks-based score
  effort          smallint check (effort between 1 and 5),
  working_grade   smallint check (working_grade between 1 and 9),        -- GCSE only
  predicted_grade smallint check (predicted_grade between 1 and 9),      -- GCSE only
  comment         text,
  status          report_entry_status not null default 'todo',
  review_note     text,                                     -- why an admin sent it back
  submitted_at    timestamptz,
  approved_at     timestamptz,
  approved_by     uuid references users(id),
  unique (cycle_id, student_id, group_id),
  check (status not in ('submitted', 'approved') or (effort is not null and length(coalesce(comment, '')) >= 20))
);

-- Grading key: the band a percentage falls in
create or replace function progress_score(p_school uuid, p_pct numeric) returns smallint language sql stable as $$
  select score from grade_bands where school_id = p_school and min_pct <= p_pct order by min_pct desc limit 1
$$;

-- Working and predicted grades only apply to GCSE courses
create or replace function report_entries_gcse_only() returns trigger language plpgsql as $$
begin
  if (new.working_grade is not null or new.predicted_grade is not null) and not exists (
       select 1 from course_groups g join levels l on l.id = g.level_id where g.id = new.group_id and l.name ilike '%GCSE%' and l.name not ilike 'Pre-%') then
    raise exception 'working and predicted grades are for GCSE courses only' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger report_entries_gcse before insert or update on report_entries for each row execute function report_entries_gcse_only();

-- Each line of a report: marks average for the cycle, the Progress score (teacher override wins), and everything else.
create or replace view report_lines with (security_invoker = true) as
  select r.id, r.school_id, r.cycle_id, r.student_id, r.group_id, l.name as level, sj.name as subject,
         m.avg_pct, m.marked,
         coalesce(r.progress_override, progress_score(r.school_id, m.avg_pct)) as progress,
         r.effort, r.working_grade, r.predicted_grade, r.comment, r.status
  from report_entries r
  join report_cycles c on c.id = r.cycle_id
  join course_groups g on g.id = r.group_id
  join levels l on l.id = g.level_id
  join subjects sj on sj.id = g.subject_id
  left join lateral (
    select round(avg(cs.points / cw.max_points * 100), 1) as avg_pct, count(*)::int as marked
    from classroom_submissions cs join classroom_coursework cw on cw.id = cs.coursework_id
    where cw.group_id = r.group_id and cs.student_id = r.student_id and cs.state = 'returned'
      and cs.points is not null and cw.max_points is not null and cs.graded_at::date between c.marks_from and c.marks_to
  ) m on true;

-- ---------- Google Classroom membership ----------
-- After booking, the student is invited to the class's Google Classroom. They become a member only when they accept,
-- and only members can join the lesson's Google Meet. Parents never get Classroom or Meet access.
create type classroom_state as enum ('invited', 'joined', 'removed');

create table classroom_memberships (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  group_id        uuid not null references course_groups(id) on delete cascade,
  student_id      uuid not null references students(id) on delete cascade,
  google_invitation_id text,
  state           classroom_state not null default 'invited',
  invited_at      timestamptz not null default now(),
  emailed_at      timestamptz,                         -- set when the welcome email listing this class went out
  last_reminded_at timestamptz,
  joined_at       timestamptz,
  unique (group_id, student_id),
  check ((state = 'joined') = (joined_at is not null))
);

-- Classroom invitations still to accept, one row per class. The welcome email lists every class a student
-- was booked onto (p_unsent_only = true: invitations not yet emailed), so a parent booking three courses
-- means one email with three "👉 <course>" lines, not three emails. The reminder email uses p_unsent_only = false.
create or replace function student_pending_invitations(p_student uuid, p_unsent_only boolean default false)
returns table (membership_id uuid, group_id uuid, course_name text, google_invitation_id text, invited_at timestamptz)
language sql stable as $$
  select m.id, g.id, l.name || ' ' || sj.name, m.google_invitation_id, m.invited_at
  from classroom_memberships m
  join course_groups g on g.id = m.group_id
  join levels l on l.id = g.level_id
  join subjects sj on sj.id = g.subject_id
  where m.student_id = p_student and m.state = 'invited' and (not p_unsent_only or m.emailed_at is null)
  order by l.name, sj.name
$$;

-- Who gets which lesson reminder: members get the "join the lesson" email; students still to accept
-- their invitation get one that asks them to accept it first (they can't join the Meet until they do).
create or replace function lesson_reminder_recipients(p_event uuid)
returns table (student_id uuid, student_email citext, reminder text) language sql stable as $$
  select st.id, st.email,
         case when m.state = 'joined' then 'join_lesson' else 'accept_invitation' end
  from lesson_events ev
  join enrolments e on e.group_id = ev.group_id and e.status = 'active'
  join students st on st.id = e.student_id
  left join classroom_memberships m on m.group_id = ev.group_id and m.student_id = st.id
  where ev.id = p_event and ev.status <> 'cancelled' and coalesce(m.state, 'invited') <> 'removed'
$$;

-- =====================================================================================================
-- ---------- 1:1 tutoring ----------
-- Anyone can book a 1:1 with a teacher by subject. Families with a child on a course (an active enrolment)
-- pay the "enrolled" rate and book from the Parent dashboard; everyone else books on the website at the
-- "public" rate (they get a parent record too, with no enrolments, so they can come back and later enrol).
-- Adding minutes to a timestamptz doesn't depend on the time zone, so this is safe to mark immutable
-- (Postgres can't tell, and generated columns need it).
create or replace function plus_minutes(t timestamptz, m int) returns timestamptz
language sql immutable parallel safe as $$ select t + make_interval(mins => m) $$;

create type tutoring_audience as enum ('public', 'enrolled');
create type tutoring_status as enum ('pending_payment', 'booked', 'completed', 'cancelled', 'no_show');

create table tutoring_rates (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  level_id        uuid not null references levels(id) on delete cascade,
  audience        tutoring_audience not null,
  minutes         smallint not null default 45 check (minutes in (30, 45, 60, 90)),   -- OH-SO ED 1:1s are 45 minutes
  price_pence     integer not null check (price_pence >= 0),
  teacher_pay_pence integer not null check (teacher_pay_pence >= 0),
  valid_from      date not null,
  unique (school_id, level_id, audience, minutes, valid_from)
);

-- When each teacher offers 1:1s (weekly pattern). Lessons, workshops and other 1:1s are removed from it.
create table tutoring_availability (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  teacher_id      uuid not null references teachers(id) on delete cascade,
  weekday         smallint not null check (weekday between 1 and 7),
  starts_at       time not null,
  ends_at         time not null,
  valid_from      date not null default current_date,
  valid_to        date,
  check (ends_at > starts_at)
);

create table tutoring_bookings (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  teacher_id      uuid not null references teachers(id),
  level_id        uuid not null references levels(id),
  subject_id      uuid not null references subjects(id),
  parent_id       uuid not null references parents(id),
  student_id      uuid references students(id),             -- set for enrolled families
  student_name    text not null,
  student_email   citext,                                   -- the Google account the Meet invite goes to
  focus           text,                                     -- "what would you like help with?"
  audience        tutoring_audience not null,
  starts_at       timestamptz not null,
  minutes         smallint not null default 45,
  during          tstzrange generated always as (tstzrange(starts_at, plus_minutes(starts_at, minutes))) stored,
  price_pence     integer not null,
  teacher_pay_pence integer not null,
  status          tutoring_status not null default 'pending_payment',
  stripe_payment_intent_id text unique,
  hold_until      timestamptz,                              -- pending_payment holds the slot for 15 minutes
  created_at      timestamptz not null default now(),
  exclude using gist (teacher_id with =, during with &&) where (status in ('pending_payment', 'booked', 'completed'))
);
create index tutoring_bookings_parent on tutoring_bookings (parent_id);

-- ---------- workshops / one-off lessons ----------
-- Free or paid (price 0 = free). Shown on the website with their own page; booked like a course but once.
create type workshop_status as enum ('draft', 'published', 'cancelled', 'completed');

create table workshops (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  title           text not null,
  slug            text not null,
  level_id        uuid references levels(id),
  subject_id      uuid references subjects(id),
  teacher_id      uuid references teachers(id),
  starts_at       timestamptz not null,
  minutes         smallint not null default 45 check (minutes between 15 and 240),
  during          tstzrange generated always as (tstzrange(starts_at, plus_minutes(starts_at, minutes))) stored,
  capacity        smallint check (capacity > 0),
  price_pence     integer not null default 0 check (price_pence >= 0),   -- 0 = free
  enrolled_price_pence integer check (enrolled_price_pence >= 0),         -- optional lower price for enrolled families
  teacher_pay_pence integer not null default 0,
  summary         text,
  body            jsonb not null default '[]',              -- page blocks, same editor as course pages
  image_url       text,
  status          workshop_status not null default 'draft',
  google_classroom_id text,
  created_at      timestamptz not null default now(),
  unique (school_id, slug)
);

create table workshop_bookings (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  workshop_id     uuid not null references workshops(id) on delete cascade,
  parent_id       uuid not null references parents(id),
  student_id      uuid references students(id),
  student_name    text not null,
  student_email   citext not null,
  price_pence     integer not null default 0,
  status          text not null default 'booked' check (status in ('pending_payment', 'booked', 'cancelled', 'attended', 'absent')),
  stripe_payment_intent_id text unique,
  created_at      timestamptz not null default now()
);
create unique index workshop_bookings_once on workshop_bookings (workshop_id, student_email) where status <> 'cancelled';

alter table ledger_entries add column tutoring_booking_id uuid references tutoring_bookings(id),
                           add column workshop_booking_id uuid references workshop_bookings(id);

-- Is the teacher already teaching then? Checks timetabled lessons, 1:1s and workshops.
create or replace function teacher_busy(p_teacher uuid, p_range tstzrange, p_skip uuid default null)
returns boolean language sql stable as $$
  select exists (
    select 1 from lesson_events ev join lesson_slots sl on sl.id = ev.slot_id join schools s on s.id = ev.school_id
    where ev.teacher_id = p_teacher and ev.status <> 'cancelled'
      and tstzrange((ev.lesson_date + sl.starts_at) at time zone s.timezone, (ev.lesson_date + sl.ends_at) at time zone s.timezone) && p_range)
  or exists (select 1 from tutoring_bookings b where b.teacher_id = p_teacher and b.id is distinct from p_skip
             and b.status in ('pending_payment', 'booked', 'completed') and b.during && p_range
             and (b.status <> 'pending_payment' or b.hold_until > now()))
  or exists (select 1 from workshops w where w.teacher_id = p_teacher and w.id is distinct from p_skip
             and w.status in ('draft', 'published') and w.during && p_range)
$$;

create or replace function is_enrolled_family(p_parent uuid) returns boolean language sql stable as $$
  select exists (select 1 from enrolments e join students st on st.id = e.student_id
                 where st.parent_id = p_parent and e.status in ('active', 'pending'))
$$;

-- The rate a family pays: enrolled families get the enrolled rate.
create or replace function tutoring_rate(p_parent uuid, p_level uuid, p_minutes int default 45, p_on date default current_date)
returns tutoring_rates language sql stable as $$
  select r.* from tutoring_rates r
  where r.level_id = p_level and r.minutes = p_minutes and r.valid_from <= p_on
    and r.audience = case when p_parent is not null and is_enrolled_family(p_parent) then 'enrolled' else 'public' end::tutoring_audience
  order by r.valid_from desc limit 1
$$;

-- Bookable start times for a subject over the next p_days: inside a teacher's availability, every 30
-- minutes, not clashing with anything, and at least 24 hours ahead.
create or replace function tutoring_open_times(p_level uuid, p_subject uuid, p_from date, p_days int, p_minutes int default 45)
returns table (teacher_id uuid, starts_at timestamptz) language sql stable as $$
  select a.teacher_id, t.ts
  from generate_series(p_from, p_from + p_days - 1, interval '1 day') d(day)
  join tutoring_availability a on a.weekday = extract(isodow from d.day) and d.day::date >= a.valid_from
                               and (a.valid_to is null or d.day::date <= a.valid_to)
  join teacher_subjects ts on ts.teacher_id = a.teacher_id and ts.level_id = p_level and ts.subject_id = p_subject
  join schools s on s.id = a.school_id
  cross join lateral generate_series(d.day + a.starts_at, d.day + a.ends_at - make_interval(mins => p_minutes), interval '30 minutes') g(local_ts)
  cross join lateral (select g.local_ts at time zone s.timezone as ts) t
  where t.ts >= now() + interval '24 hours'
    and not teacher_busy(a.teacher_id, tstzrange(t.ts, t.ts + make_interval(mins => p_minutes)))
  order by t.ts, a.teacher_id
$$;

-- Guard: a 1:1 must sit inside the teacher's availability, not clash with a lesson or workshop, and take
-- its price from the rate card (so the website can't be tricked into a cheaper rate).
create or replace function tutoring_booking_guard() returns trigger language plpgsql as $$
declare r tutoring_rates; s schools; local_start timestamp; span tstzrange;
begin
  span := tstzrange(new.starts_at, plus_minutes(new.starts_at, new.minutes));   -- generated "during" isn't set yet in a BEFORE trigger
  select * into s from schools where id = new.school_id;
  local_start := new.starts_at at time zone s.timezone;
  if tg_op = 'INSERT' or new.starts_at <> old.starts_at or new.teacher_id <> old.teacher_id then
    if not exists (select 1 from tutoring_availability a where a.teacher_id = new.teacher_id
                   and a.weekday = extract(isodow from local_start) and local_start::time >= a.starts_at
                   and (local_start + make_interval(mins => new.minutes))::time <= a.ends_at
                   and local_start::date >= a.valid_from and (a.valid_to is null or local_start::date <= a.valid_to)) then
      raise exception 'the teacher is not available for 1:1s then';
    end if;
    if exists (select 1 from lesson_events ev join lesson_slots sl on sl.id = ev.slot_id
               where ev.teacher_id = new.teacher_id and ev.status <> 'cancelled'
                 and tstzrange((ev.lesson_date + sl.starts_at) at time zone s.timezone, (ev.lesson_date + sl.ends_at) at time zone s.timezone) && span)
       or exists (select 1 from workshops w where w.teacher_id = new.teacher_id and w.status in ('draft', 'published') and w.during && span) then
      raise exception 'the teacher is teaching then';
    end if;
  end if;
  if tg_op = 'INSERT' then
    r := tutoring_rate(new.parent_id, new.level_id, new.minutes, local_start::date);
    if r.id is null then raise exception 'no 1:1 rate set for this level and length'; end if;
    new.audience := r.audience; new.price_pence := r.price_pence; new.teacher_pay_pence := r.teacher_pay_pence;
    if new.status = 'pending_payment' and new.hold_until is null then new.hold_until := now() + interval '15 minutes'; end if;
  end if;
  return new;
end $$;
create trigger tutoring_booking_guard before insert or update on tutoring_bookings
  for each row execute function tutoring_booking_guard();

-- Guard: workshops can't clash with the teacher's lessons or 1:1s.
create or replace function workshop_guard() returns trigger language plpgsql as $$
begin
  if new.teacher_id is not null and new.status in ('draft', 'published') and teacher_busy(new.teacher_id, tstzrange(new.starts_at, plus_minutes(new.starts_at, new.minutes)), new.id) then
    raise exception 'the teacher is teaching then';
  end if;
  return new;
end $$;
create trigger workshop_guard before insert or update of starts_at, minutes, teacher_id, status on workshops
  for each row execute function workshop_guard();

-- Guard: workshop places. Price comes from the workshop (enrolled price if set and the family is enrolled).
create or replace function workshop_booking_guard() returns trigger language plpgsql as $$
declare w workshops;
begin
  select * into w from workshops where id = new.workshop_id for update;
  if w.status <> 'published' then raise exception 'this workshop is not taking bookings'; end if;
  if w.capacity is not null and (select count(*) from workshop_bookings b where b.workshop_id = w.id and b.status <> 'cancelled') >= w.capacity then
    raise exception 'this workshop is full';
  end if;
  new.price_pence := case when w.enrolled_price_pence is not null and is_enrolled_family(new.parent_id) then w.enrolled_price_pence else w.price_pence end;
  new.status := case when new.price_pence = 0 then 'booked' else 'pending_payment' end;
  return new;
end $$;
create trigger workshop_booking_guard before insert on workshop_bookings
  for each row execute function workshop_booking_guard();

create or replace view workshop_places with (security_invoker = true) as
  select w.id as workshop_id, w.school_id, w.title, w.starts_at, w.capacity,
         count(b.id) filter (where b.status <> 'cancelled')::int as booked,
         case when w.capacity is null then null else w.capacity - count(b.id) filter (where b.status <> 'cancelled')::int end as places_left
  from workshops w left join workshop_bookings b on b.workshop_id = w.id
  group by w.id;

-- Payroll: 1:1s and workshops are paid on the same pay day as lessons (half-term ones with the term that ends next).

create or replace view teacher_term_extras with (security_invoker = true) as
  select t.school_id, t.id as term_id, x.teacher_id, x.kind, count(*)::int as sessions, sum(x.pay)::int as pay_pence
  from terms t
  join schools s on s.id = t.school_id
  join (
    select school_id, teacher_id, '1:1' as kind, starts_at, teacher_pay_pence as pay from tutoring_bookings where status in ('completed', 'no_show')
    union all
    select school_id, teacher_id, 'workshop', starts_at, teacher_pay_pence from workshops where status = 'completed' and teacher_id is not null
  ) x on x.school_id = t.school_id
       -- paid with the term that ends next, so 1:1s and workshops in half term or the holidays are paid too
       and t.id = (select t2.id from terms t2 where t2.school_id = t.school_id and t2.ends_on >= (x.starts_at at time zone s.timezone)::date order by t2.ends_on limit 1)
  group by t.school_id, t.id, x.teacher_id, x.kind;

-- Close a term's payroll into a draft pay run (re-running refreshes a draft; approved runs are left alone).
create or replace function build_pay_run(p_term uuid) returns uuid language plpgsql as $$
declare run uuid; st pay_run_status;
begin
  select id, status into run, st from pay_runs where term_id = p_term;
  if run is null then
    insert into pay_runs (school_id, term_id, pay_date) select school_id, id, term_pay_date(id) from terms where id = p_term returning id into run;
  elsif st <> 'draft' then
    raise exception 'this pay run is already %', st;
  end if;
  delete from pay_run_lines where pay_run_id = run;
  insert into pay_run_lines (school_id, pay_run_id, teacher_id, lessons, lessons_pence, extras, extras_pence)
    select school_id, run, teacher_id, sum(lessons), sum(lessons_pence), sum(extras), sum(extras_pence) from (
      select school_id, teacher_id, lessons, pay_pence as lessons_pence, 0 as extras, 0 as extras_pence from teacher_term_pay where term_id = p_term
      union all
      select school_id, teacher_id, 0, 0, sessions, pay_pence from teacher_term_extras where term_id = p_term
    ) u group by school_id, teacher_id;
  return run;
end $$;

-- =====================================================================================================
-- ---------- terms & conditions, agreed at checkout ----------
-- Every version of the T&Cs is kept. Before payment the parent sees an agreement page and must tick to
-- agree; the acceptance (version, time, browser) is stored against the order, and an order can't be
-- marked paid without one. The notice period each course needs is copied onto the enrolment at that
-- moment, so later changes to the T&Cs never change what a family agreed to.
create table terms_documents (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  version         text not null,                            -- e.g. '2026-09'
  title           text not null default 'Terms & Conditions',
  body_md         text not null,
  key_points      jsonb not null default '[]',              -- the summary shown on the agreement page
  published_at    timestamptz not null default now(),
  unique (school_id, version)
);

create table terms_acceptances (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  order_id        uuid not null references orders(id) on delete cascade,
  parent_id       uuid not null references parents(id),
  terms_id        uuid not null references terms_documents(id),
  notice_confirmed boolean not null check (notice_confirmed),  -- ticked "I understand the notice period"
  accepted_at     timestamptz not null default now(),
  ip              inet,
  user_agent      text,
  unique (order_id)
);

-- Notice needed to cancel, in full terms, by level: KS3 and Pre-GCSE 1, GCSE 2.
alter table levels add column notice_terms smallint not null default 1 check (notice_terms between 0 and 6);
alter table enrolments add column notice_terms smallint,                     -- copied from the level when the order is paid
                       add column notice_given_on date,
                       add column last_billed_term_id uuid references terms(id);  -- after notice: the last term charged

create or replace function order_paid_guard() returns trigger language plpgsql as $$
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    if not exists (select 1 from terms_acceptances a where a.order_id = new.id) then
      raise exception 'the parent has not agreed to the terms and conditions for this order';
    end if;
    update enrolments e set notice_terms = l.notice_terms
      from course_groups g join levels l on l.id = g.level_id
      where e.order_id = new.id and g.id = e.group_id and e.notice_terms is null;
  end if;
  return new;
end $$;
create trigger order_paid_guard before update of status on orders for each row execute function order_paid_guard();

-- Cancel a course with notice. Cooling-off: within 14 days of the course's first lesson and before the
-- student has joined the Google Classroom, everything is cancelled and paid terms are refunded.
-- Otherwise the notice runs for the next N full terms that start after the cancellation date (N from the
-- enrolment); those terms are still charged, and every later term is cancelled. Returns the outcome per term.
create or replace function cancel_enrolment(p_enrolment uuid, p_on date default current_date, p_reason text default null)
returns table (term_name text, amount_pence integer, outcome text) language plpgsql as $$
#variable_conflict use_column
declare e enrolments; n int; first_lesson date; cooling boolean; last_term terms;
begin
  select * into e from enrolments where id = p_enrolment for update;
  if e.status <> 'active' then raise exception 'only an active course can be cancelled'; end if;
  if e.notice_given_on is not null then raise exception 'notice was already given on %', e.notice_given_on; end if;
  n := coalesce(e.notice_terms, (select l.notice_terms from course_groups g join levels l on l.id = g.level_id where g.id = e.group_id));
  select min(ev.lesson_date) into first_lesson from lesson_events ev where ev.group_id = e.group_id;
  cooling := first_lesson is not null and p_on <= first_lesson + 14
             and not exists (select 1 from classroom_memberships m where m.group_id = e.group_id and m.student_id = e.student_id and m.state = 'joined');
  if cooling then
    update instalments set status = case when status = 'paid' then 'refunded'::instalment_status else 'cancelled' end,
                           refunded_pence = case when status = 'paid' then amount_pence else refunded_pence end
      where enrolment_id = e.id and status in ('scheduled', 'failed', 'paid');
  else
    select t.* into last_term from instalments i join terms t on t.id = i.term_id
      where i.enrolment_id = e.id and t.starts_on > p_on order by t.starts_on offset greatest(n - 1, 0) limit 1;
    if last_term.id is not null then
      update instalments i set status = 'cancelled' from terms t
        where i.enrolment_id = e.id and t.id = i.term_id and t.starts_on > last_term.starts_on and i.status = 'scheduled';
    end if;   -- fewer terms left than the notice: everything left is still due
  end if;
  update enrolments set status = case when cooling then 'cancelled'::enrolment_status else status end,
         notice_given_on = p_on, last_billed_term_id = case when cooling then null else coalesce(last_term.id, last_billed_term_id) end,
         end_reason = coalesce(p_reason, case when cooling then 'Cancelled in the 14-day cooling-off period' else 'Cancelled with notice' end),
         ended_at = case when cooling then now() else ended_at end
    where id = e.id;
  return query select t.name, i.amount_pence,
      case i.status when 'paid' then 'paid' when 'refunded' then 'refunded' when 'cancelled' then 'not charged' when 'scheduled' then 'still due (notice)' else i.status::text end
    from instalments i join terms t on t.id = i.term_id where i.enrolment_id = e.id order by t.starts_on;
end $$;

-- After the notice runs out (the day after the last billed term ends), the course is closed. Run daily.
create or replace function close_finished_notice() returns integer language sql as $$
  with done as (
    update enrolments e set status = 'cancelled', ended_at = now()
    from terms t where t.id = e.last_billed_term_id and e.status = 'active' and t.ends_on < current_date
    returning 1)
  select count(*)::int from done
$$;

-- ---------- parent-to-parent contact requests ----------
-- A parent can ask to swap contact details with the parent of a classmate. OH-SO ED emails the other
-- parent, who sees only the requester's first name and their child's first name and class. Nothing is
-- shared unless they accept; then each sees the other's name and email address (never a phone number,
-- and never anything about the children beyond first names). Parents choose whether they can be asked at
-- all, can decline or block, and a declined request can't be repeated for 90 days.
create type contact_request_status as enum ('pending', 'accepted', 'declined', 'withdrawn', 'expired', 'revoked');

alter table parents add column accepts_contact_requests boolean not null default false;   -- opt in on the dashboard

create table contact_requests (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  from_parent_id  uuid not null references parents(id) on delete cascade,
  to_parent_id    uuid not null references parents(id) on delete cascade,
  group_id        uuid not null references course_groups(id),   -- the class the children share
  from_student_id uuid not null references students(id),
  to_student_id   uuid not null references students(id),
  message         text check (char_length(message) <= 300),
  status          contact_request_status not null default 'pending',
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '14 days',
  responded_at    timestamptz,
  revoked_by      text,                                      -- 'parent' or 'admin'
  check (from_parent_id <> to_parent_id)
);
create unique index contact_requests_one_open on contact_requests (least(from_parent_id, to_parent_id), greatest(from_parent_id, to_parent_id))
  where status in ('pending', 'accepted');

create table parent_blocks (
  school_id       uuid not null references schools(id) on delete cascade,
  parent_id       uuid not null references parents(id) on delete cascade,
  blocked_parent_id uuid not null references parents(id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (parent_id, blocked_parent_id)
);

create or replace function contact_request_guard() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from enrolments e join students s on s.id = e.student_id
                 where e.group_id = new.group_id and e.status = 'active' and s.id = new.from_student_id and s.parent_id = new.from_parent_id)
     or not exists (select 1 from enrolments e join students s on s.id = e.student_id
                 where e.group_id = new.group_id and e.status = 'active' and s.id = new.to_student_id and s.parent_id = new.to_parent_id) then
    raise exception 'contact requests are only between parents of children in the same class';
  end if;
  if not (select accepts_contact_requests from parents where id = new.to_parent_id) then
    raise exception 'this parent is not accepting contact requests';
  end if;
  if exists (select 1 from parent_blocks b where (b.parent_id = new.to_parent_id and b.blocked_parent_id = new.from_parent_id)
                                            or (b.parent_id = new.from_parent_id and b.blocked_parent_id = new.to_parent_id)) then
    raise exception 'this parent is not accepting contact requests';    -- same message: a block is never revealed
  end if;
  if exists (select 1 from contact_requests r where r.from_parent_id = new.from_parent_id and r.to_parent_id = new.to_parent_id
             and r.status = 'declined' and r.responded_at > now() - interval '90 days') then
    raise exception 'this parent declined recently; you can ask again after 90 days';
  end if;
  if (select count(*) from contact_requests r where r.from_parent_id = new.from_parent_id and r.created_at > now() - interval '1 day') >= 5 then
    raise exception 'you can send up to 5 contact requests a day';
  end if;
  return new;
end $$;
create trigger contact_request_guard before insert on contact_requests for each row execute function contact_request_guard();

-- Respond: only the parent who was asked, only while pending and not expired.
create or replace function respond_contact_request(p_request uuid, p_parent uuid, p_accept boolean, p_block boolean default false)
returns contact_request_status language plpgsql as $$
declare r contact_requests;
begin
  select * into r from contact_requests where id = p_request for update;
  if r.to_parent_id is distinct from p_parent then raise exception 'not your request'; end if;
  if r.status <> 'pending' then raise exception 'this request is %', r.status; end if;
  if r.expires_at < now() then update contact_requests set status = 'expired' where id = r.id; return 'expired'; end if;
  update contact_requests set status = case when p_accept then 'accepted'::contact_request_status else 'declined' end, responded_at = now() where id = r.id;
  if p_block then insert into parent_blocks (school_id, parent_id, blocked_parent_id) values (r.school_id, p_parent, r.from_parent_id) on conflict do nothing; end if;
  return case when p_accept then 'accepted'::contact_request_status else 'declined' end;
end $$;

-- What a parent may see about another parent: name and email only, and only after an accepted request.
create or replace function shared_contacts(p_parent uuid)
returns table (parent_id uuid, name text, email citext, child_first_name text, class_name text, since timestamptz) language sql stable as $$
  select o.id, o.first_name || ' ' || o.last_name, o.email, st.first_name, l.name || ' ' || sj.name, r.responded_at
  from contact_requests r
  join parents o on o.id = case when r.from_parent_id = p_parent then r.to_parent_id else r.from_parent_id end
  join students st on st.id = case when r.from_parent_id = p_parent then r.to_student_id else r.from_student_id end
  join course_groups g on g.id = r.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
  where r.status = 'accepted' and p_parent in (r.from_parent_id, r.to_parent_id)
$$;

-- ---------- taster lessons ----------
-- On the website's taster page, parents choose a level and subject and see the class's upcoming lessons
-- (from lesson_events); the child joins that real lesson free. The child gets the Meet invitation for that
-- one lesson. A parent can book several tasters in one request. Places per lesson are capped (schools.taster_places_per_lesson), and a child can try each class once.
alter table schools add column taster_places_per_lesson smallint not null default 2;
create type taster_status as enum ('booked', 'attended', 'no_show', 'cancelled', 'booked_course');

-- One request from a parent can book several tasters (different subjects, or levels) for the child at once.
create table taster_requests (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  child_name      text not null,
  child_email     citext not null,                          -- the Google account the Meet invitations go to
  parent_first_name text not null,
  parent_last_name text not null,
  parent_email    citext not null,
  message         text,
  parent_id       uuid references parents(id),              -- linked if the family books a course later
  created_at      timestamptz not null default now()
);

create table taster_bookings (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  request_id      uuid not null references taster_requests(id) on delete cascade,
  lesson_event_id uuid not null references lesson_events(id) on delete cascade,
  status          taster_status not null default 'booked',
  followed_up_at  timestamptz,
  created_at      timestamptz not null default now()
);

create or replace function taster_guard() returns trigger language plpgsql as $$
declare ev lesson_events; g course_groups; cap int;
begin
  select * into ev from lesson_events where id = new.lesson_event_id;
  select * into g from course_groups where id = ev.group_id;
  if g.status not in ('open', 'priority') or ev.status <> 'scheduled' or ev.lesson_date <= current_date then
    raise exception 'tasters can only be booked for upcoming lessons of an open class';
  end if;
  select taster_places_per_lesson into cap from schools where id = new.school_id;
  if (select count(*) from taster_bookings t where t.lesson_event_id = ev.id and t.status <> 'cancelled') >= cap then
    raise exception 'no taster places left for this lesson';
  end if;
  if exists (select 1 from taster_bookings t join lesson_events e2 on e2.id = t.lesson_event_id join taster_requests r on r.id = t.request_id
             where e2.group_id = ev.group_id and t.status <> 'cancelled'
               and r.child_email = (select child_email from taster_requests where id = new.request_id)) then
    raise exception 'this child has already had a taster for this class';
  end if;
  return new;
end $$;
create trigger taster_guard before insert on taster_bookings for each row execute function taster_guard();

-- What the taster page lists: a class's upcoming lessons with taster places left.
-- What admins see: every taster with the family's details.
create or replace view taster_list with (security_invoker = true) as
  select t.id, t.school_id, t.status, ev.lesson_date, sl.starts_at, l.name as level, sj.name as subject, g.code, r.child_name, r.child_email,
         r.parent_first_name || ' ' || r.parent_last_name as parent_name, r.parent_email, r.message, r.id as request_id,
         (select count(*) from taster_bookings t2 where t2.request_id = r.id and t2.status <> 'cancelled')::int as tasters_in_request
  from taster_bookings t join taster_requests r on r.id = t.request_id join lesson_events ev on ev.id = t.lesson_event_id
  join lesson_slots sl on sl.id = ev.slot_id join course_groups g on g.id = ev.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id;

create or replace function taster_lessons(p_group uuid, p_days int default 21)
returns table (lesson_event_id uuid, lesson_date date, starts_at time, ends_at time, teacher_id uuid, places_left int) language sql stable as $$
  select ev.id, ev.lesson_date, sl.starts_at, sl.ends_at, ev.teacher_id,
         (s.taster_places_per_lesson - (select count(*) from taster_bookings t where t.lesson_event_id = ev.id and t.status <> 'cancelled'))::int
  from lesson_events ev join lesson_slots sl on sl.id = ev.slot_id join course_groups g on g.id = ev.group_id join schools s on s.id = ev.school_id
  where ev.group_id = p_group and ev.status = 'scheduled' and g.status in ('open', 'priority')
    and ev.lesson_date > current_date and ev.lesson_date <= current_date + p_days
  order by ev.lesson_date, sl.starts_at
$$;

-- ---------- attendance and absences reported by parents ----------
-- Marks come from Google Meet joins (or a teacher's correction). Parents can report an absence in advance
-- for any upcoming lesson; it's approved straight away, and when the lesson's register is taken that
-- student is recorded as an approved absence, which doesn't count against attendance and shows on reports.
create type attendance_mark as enum ('present', 'late', 'absent', 'approved_absence');

create table absence_notices (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  student_id      uuid not null references students(id) on delete cascade,
  lesson_event_id uuid not null references lesson_events(id) on delete cascade,
  reason          text not null check (reason in ('Illness', 'Medical or dental appointment', 'Family event', 'Holiday', 'Exam or other course', 'Other')),
  note            text check (char_length(note) <= 500),
  reported_by     uuid not null references parents(id),
  created_at      timestamptz not null default now(),
  cancelled_at    timestamptz
);
create unique index absence_notices_once on absence_notices (student_id, lesson_event_id) where cancelled_at is null;

create table attendance_marks (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  lesson_event_id uuid not null references lesson_events(id) on delete cascade,
  student_id      uuid not null references students(id) on delete cascade,
  mark            attendance_mark not null,
  source          text not null default 'meet' check (source in ('meet', 'teacher', 'admin')),
  minutes_present smallint,
  updated_at      timestamptz not null default now(),
  unique (lesson_event_id, student_id)
);

create or replace function absence_notice_guard() returns trigger language plpgsql as $$
declare ev lesson_events;
begin
  select * into ev from lesson_events where id = new.lesson_event_id;
  if ev.lesson_date < current_date or ev.status = 'cancelled' then raise exception 'absences can only be reported for upcoming lessons'; end if;
  if not exists (select 1 from students s where s.id = new.student_id and s.parent_id = new.reported_by) then raise exception 'only the child''s parent can report an absence'; end if;
  if not exists (select 1 from enrolments e where e.student_id = new.student_id and e.group_id = ev.group_id and e.status = 'active') then
    raise exception 'the child is not in this class';
  end if;
  return new;
end $$;
create trigger absence_notice_guard before insert on absence_notices for each row execute function absence_notice_guard();

-- An absence with a parent's notice is an approved absence.
create or replace function attendance_mark_apply_notice() returns trigger language plpgsql as $$
begin
  if new.mark = 'absent' and exists (select 1 from absence_notices n where n.lesson_event_id = new.lesson_event_id and n.student_id = new.student_id and n.cancelled_at is null) then
    new.mark := 'approved_absence';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger attendance_mark_apply_notice before insert or update on attendance_marks for each row execute function attendance_mark_apply_notice();

-- Per student per term; approved absences are left out of the percentage.
create or replace view student_term_attendance with (security_invoker = true) as
  select m.school_id, ev.term_id, m.student_id,
         count(*)::int as lessons,
         count(*) filter (where m.mark in ('present', 'late'))::int as attended,
         count(*) filter (where m.mark = 'late')::int as late,
         count(*) filter (where m.mark = 'approved_absence')::int as approved_absences,
         count(*) filter (where m.mark = 'absent')::int as unexplained_absences,
         round(100.0 * count(*) filter (where m.mark in ('present', 'late')) / nullif(count(*) filter (where m.mark <> 'approved_absence'), 0))::int as attendance_pct
  from attendance_marks m join lesson_events ev on ev.id = m.lesson_event_id
  group by m.school_id, ev.term_id, m.student_id;

-- ---------- parent details: a second parent/guardian, and marketing consent ----------
-- The account holder can add one more parent or guardian (no sign-in of their own) who can also receive
-- invoices, receipts and payment reminders, and/or reports. Marketing consent is recorded per person; the
-- second guardian's is only valid once they confirm it from their own email (double opt-in).
alter table parents add column address text,
                    add column marketing_opt_in boolean not null default false,
                    add column marketing_changed_at timestamptz;

create table guardians (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  parent_id       uuid not null references parents(id) on delete cascade,   -- the account it belongs to
  first_name      text not null,
  last_name       text not null,
  email           citext not null,
  phone           text,
  relationship    text not null default 'Parent' check (relationship in ('Parent', 'Step-parent', 'Guardian', 'Grandparent', 'Other')),
  receives_invoices boolean not null default true,
  receives_reports boolean not null default true,
  marketing_requested boolean not null default false,       -- ticked by the account holder
  marketing_confirmed_at timestamptz,                       -- set only when the guardian confirms by email
  created_at      timestamptz not null default now(),
  unique (parent_id)                                        -- one additional parent/guardian per account
);

-- Who an invoice, receipt or payment reminder goes to.
create or replace function invoice_recipients(p_parent uuid)
returns table (name text, email citext, role text) language sql stable as $$
  select first_name || ' ' || last_name, email, 'account holder' from parents where id = p_parent
  union all
  select first_name || ' ' || last_name, email, lower(relationship) from guardians where parent_id = p_parent and receives_invoices
$$;

-- Everyone who may receive marketing (consent given; a guardian's only once confirmed).
create or replace view marketing_audience with (security_invoker = true) as
  select school_id, id as parent_id, first_name || ' ' || last_name as name, email from parents where marketing_opt_in
  union all
  select school_id, parent_id, first_name || ' ' || last_name, email from guardians where marketing_requested and marketing_confirmed_at is not null;

-- ---------- sign-up: email verification, children's ages and SEND ----------
-- New accounts verify their email (a 6-digit code or the button in the email) before they can pay.
alter table parents add column email_verified_at timestamptz;
create table email_verifications (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  parent_id       uuid not null references parents(id) on delete cascade,
  code_hash       bytea not null,                           -- sha256 of the 6-digit code; the code itself is never stored
  expires_at      timestamptz not null default now() + interval '30 minutes',
  attempts        smallint not null default 0,
  sent_at         timestamptz not null default now(),
  used_at         timestamptz
);
create or replace function verify_email(p_parent uuid, p_code text) returns boolean language plpgsql as $$
declare v email_verifications;
begin
  select * into v from email_verifications where parent_id = p_parent and used_at is null order by sent_at desc limit 1 for update;
  if v.id is null or v.expires_at < now() or v.attempts >= 5 then return false; end if;
  if v.code_hash <> sha256(convert_to(p_code, 'UTF8')) then update email_verifications set attempts = attempts + 1 where id = v.id; return false; end if;
  update email_verifications set used_at = now() where id = v.id;
  update parents set email_verified_at = now() where id = p_parent;
  return true;
end $$;
create or replace function order_verified_guard() returns trigger language plpgsql as $$
begin
  if new.status = 'paid' and old.status is distinct from 'paid'
     and (select email_verified_at from parents where id = new.parent_id) is null then
    raise exception 'the parent has not verified their email address';
  end if;
  return new;
end $$;
create trigger order_verified_guard before update of status on orders for each row execute function order_verified_guard();

-- Children: year group, and SEND (special educational needs and disabilities). SEND is special-category
-- data: admins see it; a teacher sees it only for their own students and only if the parent agreed to share.
alter table students add column year_group smallint check (year_group between 1 and 13);
create table student_support (
  student_id      uuid primary key references students(id) on delete cascade,
  school_id       uuid not null references schools(id) on delete cascade,
  has_send        text not null check (has_send in ('no', 'yes', 'discuss')),
  details         text,
  adjustments     text,                                     -- what helps in lessons
  has_ehcp        boolean not null default false,
  share_with_teachers boolean not null default true,
  consent_at      timestamptz not null default now(),       -- when the parent gave it
  updated_at      timestamptz not null default now(),
  check (has_send <> 'yes' or details is not null)
);
create or replace function teacher_student_support(p_teacher uuid)
returns table (student_id uuid, student_name text, class_code text, details text, adjustments text, has_ehcp boolean) language sql stable as $$
  select distinct s.id, s.first_name || ' ' || s.last_name, g.code, ss.details, ss.adjustments, ss.has_ehcp
  from student_support ss join students s on s.id = ss.student_id
  join enrolments e on e.student_id = s.id and e.status = 'active' join course_groups g on g.id = e.group_id
  where g.teacher_id = p_teacher and ss.has_send = 'yes' and ss.share_with_teachers
$$;

-- ---------- messages between parents and teachers ----------
-- A parent can start a conversation only with a teacher who teaches one of their children (about that
-- child). Teachers see their own conversations; admins can read and reply to all (safeguarding). Email
-- notifications say there is a new message but never include its text.
create table message_threads (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  parent_id       uuid not null references parents(id) on delete cascade,
  teacher_id      uuid not null references teachers(id),
  student_id      uuid not null references students(id) on delete cascade,
  subject         text not null check (char_length(subject) between 1 and 120),
  status          text not null default 'open' check (status in ('open', 'closed')),
  office_copied   boolean not null default false,           -- the teacher passed it to the office
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);
create table messages (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  thread_id       uuid not null references message_threads(id) on delete cascade,
  sender          text not null check (sender in ('parent', 'teacher', 'office')),
  sender_user_id  uuid references users(id),
  body            text not null check (char_length(body) between 1 and 5000),
  created_at      timestamptz not null default now(),
  read_by_parent_at timestamptz,
  read_by_teacher_at timestamptz
);
create index messages_thread on messages (thread_id, created_at);

create or replace function message_thread_guard() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from students s where s.id = new.student_id and s.parent_id = new.parent_id) then
    raise exception 'parents can only message about their own children';
  end if;
  if not exists (select 1 from enrolments e join course_groups g on g.id = e.group_id
                 where e.student_id = new.student_id and e.status = 'active' and g.teacher_id = new.teacher_id) then
    raise exception 'parents can only message teachers who teach their child';
  end if;
  return new;
end $$;
create trigger message_thread_guard before insert on message_threads for each row execute function message_thread_guard();

create or replace function message_after_insert() returns trigger language plpgsql as $$
begin
  if (select status from message_threads where id = new.thread_id) = 'closed' and new.sender <> 'office' then
    raise exception 'this conversation is closed';
  end if;
  update message_threads set last_message_at = new.created_at where id = new.thread_id;
  return new;
end $$;
create trigger message_after_insert before insert on messages for each row execute function message_after_insert();

-- ---------- messages: teacher-started conversations and attachments ----------
-- Teachers can start a conversation with the parent of a student they teach (same guard as parents).
alter table message_threads add column started_by text not null default 'parent' check (started_by in ('parent', 'teacher'));

-- Files on a message: PDF, images or Word, up to 10 MB each and 5 per message. The file itself lives in object storage.
create table message_attachments (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  message_id      uuid not null references messages(id) on delete cascade,
  file_name       text not null check (char_length(file_name) between 1 and 200),
  content_type    text not null check (content_type in ('application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp',
                    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  size_bytes      integer not null check (size_bytes between 1 and 10485760),
  storage_key     text not null,
  created_at      timestamptz not null default now()
);
create or replace function message_attachment_guard() returns trigger language plpgsql as $$
begin
  if (select count(*) from message_attachments where message_id = new.message_id) >= 5 then
    raise exception 'up to 5 files per message';
  end if;
  return new;
end $$;
create trigger message_attachment_guard before insert on message_attachments for each row execute function message_attachment_guard();

-- ---------- student chat ----------
-- A group chat per class (students in the class + the teacher) and private chats between two students who share a class.
-- Staff can read everything; blocked words are refused; any student can report a message to the office.
create table student_chats (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  kind            text not null check (kind in ('class', 'direct')),
  group_id        uuid references course_groups(id) on delete cascade,
  created_at      timestamptz not null default now(),
  check ((kind = 'class') = (group_id is not null))
);
create unique index student_chats_one_per_class on student_chats (group_id) where kind = 'class';
create table student_chat_members (            -- direct chats only
  school_id       uuid not null references schools(id) on delete cascade,
  chat_id         uuid not null references student_chats(id) on delete cascade,
  student_id      uuid not null references students(id) on delete cascade,
  primary key (chat_id, student_id)
);
create table student_chat_messages (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  chat_id         uuid not null references student_chats(id) on delete cascade,
  sender_student_id uuid references students(id) on delete set null,
  sender_teacher_id uuid references teachers(id) on delete set null,
  sender_office   boolean not null default false,
  body            text not null check (char_length(body) between 1 and 1000),
  hidden_at       timestamptz,                               -- hidden by staff; students see "Message removed by staff"
  hidden_by       uuid references users(id),
  created_at      timestamptz not null default now(),
  check (num_nonnulls(sender_student_id, sender_teacher_id) + sender_office::int = 1)
);
create index student_chat_messages_chat on student_chat_messages (chat_id, created_at);
create table chat_blocked_words (
  school_id       uuid not null references schools(id) on delete cascade,
  word            citext not null,
  primary key (school_id, word)
);
create table student_chat_reports (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  message_id      uuid not null references student_chat_messages(id) on delete cascade,
  reported_by     uuid not null references students(id) on delete cascade,
  status          text not null default 'open' check (status in ('open', 'hidden', 'no_action')),
  resolved_by     uuid references users(id),
  created_at      timestamptz not null default now(),
  unique (message_id, reported_by)
);

create or replace function shares_active_class(a uuid, b uuid) returns boolean language sql stable as $$
  select exists (select 1 from enrolments x join enrolments y on y.group_id = x.group_id
                 where x.student_id = a and y.student_id = b and x.status = 'active' and y.status = 'active')
$$;
create or replace function in_active_class(st uuid, g uuid) returns boolean language sql stable as $$
  select exists (select 1 from enrolments where student_id = st and group_id = g and status = 'active')
$$;

-- Start (or reopen) a private chat between two classmates.
create or replace function start_direct_chat(a uuid, b uuid) returns uuid language plpgsql as $$
declare c uuid;
begin
  if a = b then raise exception 'a chat needs two different students'; end if;
  if not shares_active_class(a, b) then raise exception 'students can only chat with classmates'; end if;
  select m1.chat_id into c from student_chat_members m1 join student_chat_members m2 on m2.chat_id = m1.chat_id
    where m1.student_id = a and m2.student_id = b limit 1;
  if c is null then
    insert into student_chats (school_id, kind) select school_id, 'direct' from students where id = a returning id into c;
    insert into student_chat_members (school_id, chat_id, student_id) select school_id, c, id from students where id in (a, b);
  end if;
  return c;
end $$;

create or replace function student_chat_member_guard() returns trigger language plpgsql as $$
begin
  if (select kind from student_chats where id = new.chat_id) <> 'direct' then raise exception 'class chats have no member list'; end if;
  if (select count(*) from student_chat_members where chat_id = new.chat_id) >= 2 then raise exception 'private chats are between two students'; end if;
  if exists (select 1 from student_chat_members m where m.chat_id = new.chat_id and not shares_active_class(m.student_id, new.student_id)) then
    raise exception 'students can only chat with classmates';
  end if;
  return new;
end $$;
create trigger student_chat_member_guard before insert on student_chat_members for each row execute function student_chat_member_guard();

create or replace function student_chat_message_guard() returns trigger language plpgsql as $$
declare ch student_chats; other uuid;
begin
  select * into ch from student_chats where id = new.chat_id;
  if exists (select 1 from chat_blocked_words w where w.school_id = new.school_id and new.body ilike '%' || w.word || '%') then
    raise exception 'message contains words that are not allowed';
  end if;
  if new.sender_office then return new; end if;
  if ch.kind = 'class' then
    if new.sender_student_id is not null and not in_active_class(new.sender_student_id, ch.group_id) then
      raise exception 'only students in this class can post here';
    end if;
    if new.sender_teacher_id is not null and new.sender_teacher_id is distinct from (select teacher_id from course_groups where id = ch.group_id) then
      raise exception 'only this class''s teacher can post here';
    end if;
  else
    if new.sender_student_id is null then raise exception 'teachers post in class chats, not private chats'; end if;
    select student_id into other from student_chat_members where chat_id = ch.id and student_id <> new.sender_student_id;
    if not exists (select 1 from student_chat_members where chat_id = ch.id and student_id = new.sender_student_id) then
      raise exception 'not a member of this chat';
    end if;
    if other is null or not shares_active_class(new.sender_student_id, other) then
      raise exception 'this chat is read-only because you no longer share a class';
    end if;
  end if;
  return new;
end $$;
create trigger student_chat_message_guard before insert on student_chat_messages for each row execute function student_chat_message_guard();

-- What a student sees: hidden messages are replaced.
create or replace view student_chat_feed with (security_invoker = true) as
  select m.id, m.school_id, m.chat_id, m.sender_student_id, m.sender_teacher_id, m.sender_office, m.created_at,
         case when m.hidden_at is null then m.body else 'Message removed by staff' end as body
  from student_chat_messages m;

-- ---------- rewards ----------
-- Teachers give points to students they teach; the top 3 in the whole school at the end of each term win a gift.
create table reward_points (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  student_id      uuid not null references students(id) on delete cascade,
  teacher_id      uuid not null references teachers(id),
  group_id        uuid not null references course_groups(id),
  points          smallint not null check (points between 1 and 10),
  reason          text not null check (char_length(reason) between 1 and 80),
  awarded_on      date not null default current_date,
  created_at      timestamptz not null default now()
);
create index reward_points_student on reward_points (student_id, awarded_on);
create or replace function reward_points_guard() returns trigger language plpgsql as $$
begin
  if new.teacher_id is distinct from (select teacher_id from course_groups where id = new.group_id) or not in_active_class(new.student_id, new.group_id) then
    raise exception 'teachers can only give points to students in their own classes';
  end if;
  return new;
end $$;
create trigger reward_points_guard before insert on reward_points for each row execute function reward_points_guard();

create table reward_prizes (
  school_id       uuid not null references schools(id) on delete cascade,
  place           smallint not null check (place between 1 and 3),
  description     text not null,
  primary key (school_id, place)
);
create table reward_winners (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  term_id         uuid not null references terms(id) on delete cascade,
  place           smallint not null check (place between 1 and 3),
  student_id      uuid not null references students(id) on delete cascade,
  points          integer not null,
  prize           text not null,
  parent_emailed_at timestamptz,
  gift_sent_at    timestamptz,
  unique (term_id, place),
  unique (term_id, student_id)
);

-- Whole-school leaderboard for a term (ties share a rank).
create or replace function term_leaderboard(p_term uuid)
returns table (student_id uuid, points bigint, rank bigint) language sql stable as $$
  select s.id, coalesce(sum(rp.points), 0) as points, rank() over (order by coalesce(sum(rp.points), 0) desc)
  from students s
  join terms t on t.id = p_term and t.school_id = s.school_id
  left join reward_points rp on rp.student_id = s.id and rp.awarded_on between t.starts_on and t.ends_on
  where exists (select 1 from enrolments e where e.student_id = s.id and e.status = 'active')
  group by s.id
$$;

-- After the term ends: record the top 3 (refuses while there is a tie for a prize place; the office breaks it by hand).
create or replace function confirm_reward_winners(p_term uuid) returns integer language plpgsql as $$
#variable_conflict use_column
declare t terms; n integer;
begin
  select * into t from terms where id = p_term;
  if current_date <= t.ends_on then raise exception 'winners can be confirmed once the term has ended'; end if;
  if exists (select 1 from reward_winners where term_id = p_term) then raise exception 'winners already confirmed for this term'; end if;
  if (select count(*) from term_leaderboard(p_term) where rank <= 3) > 3 then
    raise exception 'there is a tie for a prize place; choose the winners by hand';
  end if;
  insert into reward_winners (school_id, term_id, place, student_id, points, prize)
    select t.school_id, p_term, row_number() over (order by lb.points desc), lb.student_id, lb.points,
           coalesce((select description from reward_prizes rp where rp.school_id = t.school_id and rp.place = lb.rank), 'Gift')
    from term_leaderboard(p_term) lb where lb.rank <= 3 and lb.points > 0;
  get diagnostics n = row_count; return n;
end $$;

-- ---------- attendance from Google Meet (no registers) ----------
-- Every join/leave in a lesson's Meet is stored (today via AttendList's API, later straight from the Google Meet
-- REST API: conferenceRecords.participants.participantSessions). compute_attendance() turns them into marks,
-- measured against the TIMETABLED start and end (not when the teacher opened the Meet). Office corrections
-- (source = 'admin') are never overwritten by a later sync.
create table attendance_settings (
  school_id           uuid primary key references schools(id) on delete cascade,
  late_grace_minutes  smallint not null default 5 check (late_grace_minutes between 0 and 30),
  early_grace_minutes smallint not null default 5 check (early_grace_minutes between 0 and 30),
  min_minutes         smallint not null default 5 check (min_minutes between 0 and 60),
  source              text not null default 'attendlist' check (source in ('attendlist', 'meet_api'))
);
create table meet_sessions (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  lesson_event_id uuid not null references lesson_events(id) on delete cascade,
  participant_email citext,                       -- blank when someone joins signed out
  display_name    text,
  student_id      uuid references students(id) on delete set null,   -- matched by email, or by the office
  joined_at       timestamptz not null,
  left_at         timestamptz,                    -- missing when the connection dropped: treated as the lesson end
  source          text not null default 'attendlist' check (source in ('attendlist', 'meet_api')),
  external_id     text,
  unique (source, external_id)
);
create index meet_sessions_event on meet_sessions (lesson_event_id);
alter table attendance_marks
  add column joined_at timestamptz,
  add column left_at timestamptz,
  add column left_early boolean not null default false,
  add column corrected_by uuid references users(id),
  add column correction_note text;

create or replace function compute_attendance(p_event uuid) returns integer language plpgsql as $$
declare ev lesson_events; cfg attendance_settings; tz text; st_at timestamptz; en_at timestamptz; n integer;
begin
  select * into ev from lesson_events where id = p_event;
  select * into cfg from attendance_settings where school_id = ev.school_id;
  if cfg is null then cfg := row(ev.school_id, 5, 5, 5, 'attendlist')::attendance_settings; end if;
  select timezone into tz from schools where id = ev.school_id;
  select (ev.lesson_date + s.starts_at) at time zone tz, (ev.lesson_date + s.ends_at) at time zone tz into st_at, en_at
    from lesson_slots s where s.id = ev.slot_id;
  insert into attendance_marks (school_id, lesson_event_id, student_id, mark, source, minutes_present, joined_at, left_at, left_early)
  select ev.school_id, ev.id, e.student_id,
         case when coalesce(x.mins, 0) < cfg.min_minutes then 'absent'
              when x.first_join > st_at + make_interval(mins => cfg.late_grace_minutes) then 'late' else 'present' end::attendance_mark,
         'meet', coalesce(x.mins, 0), x.first_join, x.last_leave,
         coalesce(x.mins, 0) >= cfg.min_minutes and x.last_leave < en_at - make_interval(mins => cfg.early_grace_minutes)
  from enrolments e
  left join lateral (
    select min(ms.joined_at) as first_join, max(coalesce(ms.left_at, en_at)) as last_leave,
           sum(greatest(0, extract(epoch from (least(coalesce(ms.left_at, en_at), en_at) - greatest(ms.joined_at, st_at - interval '15 minutes'))) / 60))::int as mins
    from meet_sessions ms where ms.lesson_event_id = ev.id and ms.student_id = e.student_id) x on true
  where e.group_id = ev.group_id and e.status = 'active'
  on conflict (lesson_event_id, student_id) do update
    set mark = excluded.mark, minutes_present = excluded.minutes_present, joined_at = excluded.joined_at,
        left_at = excluded.left_at, left_early = excluded.left_early, updated_at = now()
    where attendance_marks.source = 'meet' and attendance_marks.mark <> 'approved_absence';
  get diagnostics n = row_count; return n;
end $$;

create or replace view student_term_attendance with (security_invoker = true) as
  select m.school_id, ev.term_id, m.student_id,
         count(*)::int as lessons,
         count(*) filter (where m.mark in ('present', 'late'))::int as attended,
         count(*) filter (where m.mark = 'late')::int as late,
         count(*) filter (where m.mark = 'approved_absence')::int as approved_absences,
         count(*) filter (where m.mark = 'absent')::int as unexplained_absences,
         round(100.0 * count(*) filter (where m.mark in ('present', 'late')) / nullif(count(*) filter (where m.mark <> 'approved_absence'), 0))::int as attendance_pct,
         count(*) filter (where m.left_early)::int as left_early
  from attendance_marks m join lesson_events ev on ev.id = m.lesson_event_id
  group by m.school_id, ev.term_id, m.student_id;

-- ---------- swapping a course (parents, from their dashboard) ----------
-- A parent can move a child from one class to another if the new class has space and fits the child's timetable.
--  * Swap from the CURRENT term (not offered in the last week of term): the child moves now. This term's instalment is re-priced at the new course's
--    rate: if it was already paid, the difference is charged now (dearer course) or refunded to the card (cheaper).
--  * Swap from the NEXT term: nothing to pay now. The child stays in the old class until this term ends, then
--    moves; the new course's instalments start next term.
-- Later terms are always charged at the new course's price, with the same bundle discount as before.
alter table enrolments add column starts_on date;   -- set when a swap starts next term

create table swap_adjustments (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  from_enrolment_id uuid not null references enrolments(id),
  to_enrolment_id uuid not null references enrolments(id),
  term_id         uuid not null references terms(id),
  amount_pence    integer not null,                 -- positive = charge now, negative = refund to card
  status          text not null default 'pending' check (status in ('pending', 'charged', 'refunded', 'failed')),
  stripe_ref      text,
  created_at      timestamptz not null default now()
);

-- the class a student is swapping out of doesn't count as a clash for the class they're swapping into
create or replace function enrolments_check_clash() returns trigger language plpgsql as $$
declare old_group uuid;
begin
  select group_id into old_group from enrolments where id = new.swapped_from_id;
  if new.status in ('pending', 'active') and not new.allow_clash
     and exists (select 1 from student_clashes(new.student_id, new.group_id) c where c.clashing_group is distinct from old_group) then
    raise exception 'timetable clash: this class overlaps another of the student''s classes'
      using errcode = 'exclusion_violation';
  end if;
  return new;
end $$;

create or replace function swap_course(p_enrolment uuid, p_to_group uuid, p_start text default 'current', p_on date default current_date)
returns table (to_enrolment uuid, starts_term text, pay_now_pence integer, refund_now_pence integer, per_term_pence integer)
language plpgsql as $$
#variable_conflict use_column
declare e enrolments; g course_groups; pp price_plans; cur terms; nxt terms; st terms; ratio numeric; net integer; share integer;
        new_id uuid; old_cur instalments; diff integer := 0; taken integer;
begin
  if p_start not in ('current', 'next') then raise exception 'start must be current or next'; end if;
  select * into e from enrolments where id = p_enrolment for update;
  if e.status <> 'active' or e.notice_given_on is not null then raise exception 'only an active course without a cancellation notice can be swapped'; end if;
  select * into g from course_groups where id = p_to_group;
  if g.id = e.group_id then raise exception 'that is the same class'; end if;
  if g.status not in ('open', 'priority') then raise exception 'that class is not taking bookings'; end if;
  select count(*) into taken from enrolments x where x.group_id = g.id and x.status in ('pending', 'active');
  if group_is_full(g.id) then raise exception 'that class is full'; end if;
  if exists (select 1 from enrolments x where x.student_id = e.student_id and x.group_id = g.id and x.status in ('pending', 'active')) then
    raise exception 'already enrolled in that class'; end if;

  select * into cur from terms where academic_year_id = g.academic_year_id and p_on between starts_on and ends_on;
  select * into nxt from terms where academic_year_id = g.academic_year_id and starts_on > p_on order by starts_on limit 1;
  if p_start = 'current' and cur.id is not null and p_on > cur.ends_on - 7 then
    raise exception 'in the last week of term a swap starts next term';
  end if;
  st := case when p_start = 'current' and cur.id is not null then cur else nxt end;
  if st.id is null then raise exception 'no term left this year to swap into'; end if;

  select * into pp from price_plans where id = g.price_plan_id;
  ratio := case when e.list_price_pence > 0 then e.discount_pence::numeric / e.list_price_pence else 0 end;
  net := pp.total_pence - round(pp.total_pence * ratio)::int;
  share := net / pp.term_count;   -- remainder pennies go on the first term (same rule as at booking)

  insert into enrolments (school_id, student_id, group_id, status, list_price_pence, discount_pence, swapped_from_id, starts_on)
    values (e.school_id, e.student_id, g.id, 'active', pp.total_pence, round(pp.total_pence * ratio)::int, e.id,
            case when st.id = cur.id then p_on else st.starts_on end)
    returning id into new_id;

  if st.id = cur.id then
    -- moving now: this term is re-priced
    -- what the family has already paid for this term, across any earlier swaps (net of refunds)
    with recursive chain as (select e.id as id, e.swapped_from_id as prev union all
                             select x.id, x.swapped_from_id from enrolments x join chain c on x.id = c.prev)
    select coalesce(sum(i.amount_pence - i.refunded_pence) filter (where i.status in ('paid', 'part_refunded')), 0)
           - coalesce((select sum(-a.amount_pence) from swap_adjustments a where a.amount_pence < 0 and a.term_id = cur.id
                       and a.from_enrolment_id in (select id from chain)), 0)
      into taken from instalments i where i.term_id = cur.id and i.enrolment_id in (select id from chain);
    if taken > 0 then
      diff := share + case when cur.number = 1 then net - share * pp.term_count else 0 end - taken;
      if diff > 0 then
        insert into instalments (school_id, enrolment_id, term_id, due_on, amount_pence) values (e.school_id, new_id, cur.id, p_on, diff);
      end if;
      if diff <> 0 then insert into swap_adjustments (school_id, from_enrolment_id, to_enrolment_id, term_id, amount_pence) values (e.school_id, e.id, new_id, cur.id, diff); end if;
    elsif cur.number <= pp.term_count then
      insert into instalments (school_id, enrolment_id, term_id, due_on, amount_pence) values (e.school_id, new_id, cur.id, p_on, share + case when cur.number = 1 then net - share * pp.term_count else 0 end);
    end if;
    update instalments set status = 'cancelled' where enrolment_id = e.id and status in ('scheduled', 'failed') and term_id <> cur.id or (enrolment_id = e.id and term_id = cur.id and status in ('scheduled', 'failed'));
    update enrolments set status = 'swapped', ended_at = now(), end_reason = 'Swapped to ' || g.code where id = e.id;
  else
    -- moving next term: the old class runs to the end of this term, then closes
    update instalments i set status = 'cancelled' from terms t
      where i.enrolment_id = e.id and t.id = i.term_id and t.starts_on >= st.starts_on and i.status in ('scheduled', 'failed');
    update enrolments set last_billed_term_id = cur.id, end_reason = 'Swapping to ' || g.code || ' from ' || st.name where id = e.id;
  end if;

  -- the new course's later terms
  insert into instalments (school_id, enrolment_id, term_id, due_on, amount_pence)
    select e.school_id, new_id, t.id, t.bills_on, share + case when t.number = 1 then net - share * pp.term_count else 0 end
    from terms t where t.academic_year_id = g.academic_year_id and t.number <= pp.term_count
      and t.starts_on >= st.starts_on and t.id <> coalesce(case when st.id = cur.id then cur.id end, '00000000-0000-0000-0000-000000000000'::uuid);

  return query select new_id, st.name, greatest(diff, 0), greatest(-diff, 0), share;
end $$;

-- =====================================================================================================
-- DATA PROTECTION (UK GDPR / DPA 2018 / Children's Code)
-- Consent records, rights requests, an access log for sensitive data, a family data export, erasure that
-- keeps only what the law requires, retention on a schedule, a breach log and student privacy defaults.
-- =====================================================================================================

-- Every consent a parent gives or withdraws, with the wording version they saw (proof of consent).
create table consent_events (
  id              bigserial primary key,
  school_id       uuid not null references schools(id) on delete cascade,
  parent_id       uuid references parents(id) on delete set null,
  guardian_id     uuid references guardians(id) on delete set null,
  student_id      uuid references students(id) on delete set null,
  purpose         text not null check (purpose in ('marketing_email', 'contact_sharing', 'send_shared_with_teachers', 'leaderboard_name', 'photos')),
  granted         boolean not null,
  notice_version  text not null,                     -- e.g. privacy notice '2026-10'
  source          text not null default 'dashboard' check (source in ('signup', 'dashboard', 'email_link', 'admin', 'import')),
  recorded_at     timestamptz not null default now()
);
create index consent_events_parent on consent_events (parent_id, purpose, recorded_at desc);
create or replace view current_consents with (security_invoker = true) as
  select distinct on (coalesce(parent_id, guardian_id, student_id), purpose) school_id, parent_id, guardian_id, student_id, purpose, granted, notice_version, recorded_at
  from consent_events order by coalesce(parent_id, guardian_id, student_id), purpose, recorded_at desc, id desc;

-- Rights requests (access, erasure, correction, restriction, objection, portability): one calendar month to reply.
create table privacy_requests (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  parent_id       uuid references parents(id) on delete set null,
  requester_email citext not null,
  kind            text not null check (kind in ('access', 'erasure', 'rectification', 'restriction', 'objection', 'portability')),
  detail          text,
  received_at     timestamptz not null default now(),
  identity_checked_at timestamptz,
  due_on          date not null default (current_date + interval '1 month')::date,
  extended_to     date,                              -- up to two further months for complex requests, with a reason
  status          text not null default 'open' check (status in ('open', 'done', 'refused')),
  outcome         text,
  completed_at    timestamptz
);

-- Who looked at sensitive data (SEND details, student chats) and when.
create table sensitive_access_log (
  id              bigserial primary key,
  school_id       uuid not null references schools(id) on delete cascade,
  viewer_user_id  uuid references users(id) on delete set null,
  student_id      uuid references students(id) on delete set null,
  what            text not null check (what in ('send_details', 'student_chat', 'family_export')),
  reason          text,
  viewed_at       timestamptz not null default now()
);

-- Reading SEND details always goes through this function, which logs the read.
create or replace function read_student_support(p_student uuid, p_viewer uuid, p_reason text default null)
returns student_support language plpgsql as $$
declare r student_support; role_ user_role; teaches boolean;
begin
  select role into role_ from users where id = p_viewer;
  select exists (select 1 from enrolments e join course_groups g on g.id = e.group_id join teachers t on t.id = g.teacher_id
                 where e.student_id = p_student and e.status = 'active' and t.user_id = p_viewer) into teaches;
  select * into r from student_support where student_id = p_student;
  if role_ = 'school_admin' or (role_ = 'teacher' and teaches and r.share_with_teachers) then
    insert into sensitive_access_log (school_id, viewer_user_id, student_id, what, reason) values (r.school_id, p_viewer, p_student, 'send_details', p_reason);
    return r;
  end if;
  raise exception 'not allowed to see this student''s support details';
end $$;

-- Breach log: every personal data incident, reported or not (Art. 33(5)).
create table data_breaches (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  found_at        timestamptz not null,
  what_happened   text not null,
  data_involved   text not null,
  people_affected integer,
  risk            text not null check (risk in ('unlikely', 'risk', 'high_risk')),
  reported_to_ico_at timestamptz,                    -- required within 72 hours when there is a risk
  people_told_at  timestamptz,                       -- required without undue delay when the risk is high
  actions         text,
  closed_at       timestamptz,
  check (risk = 'unlikely' or reported_to_ico_at is not null or closed_at is null)
);

-- Suppliers that process personal data for the school (Art. 28/30).
create table processors (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  name            text not null,
  purpose         text not null,
  data            text not null,
  location        text not null,
  transfer_safeguard text,                            -- e.g. UK IDTA, UK Extension to the EU-US DPF
  dpa_signed_on   date,
  review_due      date
);

-- Children's Code: high privacy by default for students.
alter table students add column leaderboard_name text not null default 'first_initial' check (leaderboard_name in ('first_initial', 'hidden'));

-- Retention schedule (months after the trigger event); the school can change it.
create table retention_policies (
  school_id       uuid not null references schools(id) on delete cascade,
  data_kind       text not null check (data_kind in ('enquiry', 'waitlist', 'taster', 'email_code', 'meet_session', 'student_chat', 'parent_message',
                                                    'send_details', 'access_log', 'student_record', 'financial')),
  keep_months     smallint not null check (keep_months >= 0),
  after_event     text not null,
  primary key (school_id, data_kind)
);
create or replace function default_retention(p_school uuid) returns void language sql as $$
  insert into retention_policies (school_id, data_kind, keep_months, after_event) values
    (p_school, 'enquiry',        12, 'last contact, if no booking'),
    (p_school, 'waitlist',       12, 'joining the list, if no booking'),
    (p_school, 'taster',         12, 'the taster lesson, if no booking'),
    (p_school, 'email_code',      0, 'expiry (deleted daily)'),
    (p_school, 'meet_session',   13, 'the lesson (attendance marks are kept)'),
    (p_school, 'student_chat',   12, 'the message (reported messages: when the report closes)'),
    (p_school, 'parent_message', 24, 'the conversation''s last message'),
    (p_school, 'send_details',   12, 'the student''s last course ending'),
    (p_school, 'access_log',     24, 'the access'),
    (p_school, 'student_record', 36, 'the student''s last course ending (attendance, reports)'),
    (p_school, 'financial',      72, 'the payment (HMRC: six years); names removed on erasure')
  on conflict do nothing
$$;

-- The student's last day with us (null while they have an active course).
create or replace function student_left_on(p_student uuid) returns date language sql stable as $$
  select case when exists (select 1 from enrolments where student_id = p_student and status in ('pending', 'active')) then null
              else coalesce((select max(ended_at)::date from enrolments where student_id = p_student), (select created_at::date from students where id = p_student)) end
$$;

-- Daily: delete what has passed its retention period. Returns rows removed per kind.
create or replace function run_retention(p_school uuid, p_today date default current_date)
returns table (data_kind text, removed integer) language plpgsql as $$
#variable_conflict use_column
declare m retention_policies; n integer;
begin
  for m in select * from retention_policies where school_id = p_school loop
    n := 0;
    if m.data_kind = 'enquiry' then
      delete from enquiries q where q.school_id = p_school and q.created_at < p_today - make_interval(months => m.keep_months)
        and not exists (select 1 from parents p where p.school_id = p_school and p.email = q.email);
    elsif m.data_kind = 'waitlist' then
      delete from waitlist_entries w where w.school_id = p_school and w.created_at < p_today - make_interval(months => m.keep_months)
        and not exists (select 1 from parents p where p.school_id = p_school and p.email = w.email);
    elsif m.data_kind = 'taster' then
      delete from taster_requests t where t.school_id = p_school and t.parent_id is null and t.created_at < p_today - make_interval(months => m.keep_months);
    elsif m.data_kind = 'email_code' then
      delete from email_verifications v where v.school_id = p_school and v.expires_at < p_today;
    elsif m.data_kind = 'meet_session' then
      delete from meet_sessions s where s.school_id = p_school and s.joined_at < p_today - make_interval(months => m.keep_months);
    elsif m.data_kind = 'student_chat' then
      delete from student_chat_messages c where c.school_id = p_school and c.created_at < p_today - make_interval(months => m.keep_months)
        and not exists (select 1 from student_chat_reports r where r.message_id = c.id and r.status = 'open');
    elsif m.data_kind = 'parent_message' then
      delete from message_threads t where t.school_id = p_school and t.last_message_at < p_today - make_interval(months => m.keep_months);
    elsif m.data_kind = 'send_details' then
      delete from student_support s where s.school_id = p_school and student_left_on(s.student_id) < p_today - make_interval(months => m.keep_months);
    elsif m.data_kind = 'access_log' then
      delete from sensitive_access_log l where l.school_id = p_school and l.viewed_at < p_today - make_interval(months => m.keep_months);
    elsif m.data_kind = 'student_record' then
      delete from attendance_marks a using students s where a.student_id = s.id and s.school_id = p_school and student_left_on(s.id) < p_today - make_interval(months => m.keep_months);
      get diagnostics n = row_count;
      delete from report_entries r using students s where r.student_id = s.id and s.school_id = p_school and student_left_on(s.id) < p_today - make_interval(months => m.keep_months);
    end if;   -- 'financial': kept for six years by law; erasure removes the names attached
    get diagnostics removed = row_count;
    data_kind := m.data_kind; removed := removed + n; return next;
  end loop;
end $$;

-- Right of access / portability: everything held about a family, as one JSON document.
create or replace function export_family_data(p_parent uuid, p_viewer uuid default null) returns jsonb language plpgsql as $$
declare out jsonb; sc uuid;
begin
  select school_id into sc from parents where id = p_parent;
  select jsonb_build_object(
    'exported_at', now(),
    'parent', (select to_jsonb(p) - 'stripe_customer_id' from parents p where p.id = p_parent),
    'second_guardians', coalesce((select jsonb_agg(to_jsonb(g)) from guardians g where g.parent_id = p_parent), '[]'),
    'consents', coalesce((select jsonb_agg(to_jsonb(c) order by c.recorded_at) from consent_events c where c.parent_id = p_parent or c.student_id in (select id from students where parent_id = p_parent)), '[]'),
    'children', coalesce((select jsonb_agg(jsonb_build_object(
        'student', to_jsonb(s),
        'support_needs', (select to_jsonb(x) from student_support x where x.student_id = s.id),
        'courses', coalesce((select jsonb_agg(jsonb_build_object('class', g.code, 'status', e.status, 'enrolled_at', e.enrolled_at, 'ended_at', e.ended_at,
                     'payments', coalesce((select jsonb_agg(jsonb_build_object('term', t.name, 'amount_pence', i.amount_pence, 'status', i.status, 'refunded_pence', i.refunded_pence) order by t.starts_on)
                                           from instalments i join terms t on t.id = i.term_id where i.enrolment_id = e.id), '[]')))
                   from enrolments e join course_groups g on g.id = e.group_id where e.student_id = s.id), '[]'),
        'attendance', coalesce((select jsonb_agg(jsonb_build_object('lesson', le.lesson_date, 'class', g.code, 'mark', a.mark, 'joined_at', a.joined_at, 'left_at', a.left_at, 'left_early', a.left_early) order by le.lesson_date)
                   from attendance_marks a join lesson_events le on le.id = a.lesson_event_id join course_groups g on g.id = le.group_id where a.student_id = s.id), '[]'),
        'reports', coalesce((select jsonb_agg(jsonb_build_object('class', g.code, 'comment', r.comment, 'effort', r.effort, 'status', r.status))
                   from report_entries r join course_groups g on g.id = r.group_id join report_cycles rc on rc.id = r.cycle_id where r.student_id = s.id and rc.status = 'published'), '[]'),
        'reward_points', coalesce((select jsonb_agg(jsonb_build_object('on', rp.awarded_on, 'points', rp.points, 'reason', rp.reason)) from reward_points rp where rp.student_id = s.id), '[]'),
        'chat_messages_sent', coalesce((select jsonb_agg(jsonb_build_object('at', m.created_at, 'text', m.body)) from student_chat_messages m where m.sender_student_id = s.id), '[]')
      )) from students s where s.parent_id = p_parent), '[]'),
    'messages_with_teachers', coalesce((select jsonb_agg(jsonb_build_object('subject', t.subject, 'messages',
        (select jsonb_agg(jsonb_build_object('from', m.sender, 'at', m.created_at, 'text', m.body) order by m.created_at) from messages m where m.thread_id = t.id)))
      from message_threads t where t.parent_id = p_parent), '[]')
  ) into out;
  insert into sensitive_access_log (school_id, viewer_user_id, what, reason) values (sc, p_viewer, 'family_export', 'Right of access / portability');
  return out;
end $$;

-- Right to erasure: removes or anonymises everything about the family except what the law makes us keep
-- (payment records for six years, with names removed). Refused while a course is active or money is owed.
create or replace function erase_family(p_parent uuid, p_request uuid default null) returns jsonb language plpgsql as $$
declare kids uuid[]; sc uuid;
begin
  select school_id into sc from parents where id = p_parent;
  select coalesce(array_agg(id), '{}') into kids from students where parent_id = p_parent;
  if exists (select 1 from enrolments where student_id = any(kids) and status in ('pending', 'active')) then
    raise exception 'cancel the active courses first (notice terms still apply)';
  end if;
  if exists (select 1 from instalments i join enrolments e on e.id = i.enrolment_id where e.student_id = any(kids) and i.status in ('scheduled', 'failed', 'processing')) then
    raise exception 'payments are still outstanding';
  end if;
  delete from student_support where student_id = any(kids);
  delete from meet_sessions where student_id = any(kids);
  delete from attendance_marks where student_id = any(kids);
  delete from report_entries where student_id = any(kids);
  delete from reward_points where student_id = any(kids);
  update student_chat_messages set body = 'Message removed', hidden_at = coalesce(hidden_at, now()) where sender_student_id = any(kids);
  delete from message_threads where parent_id = p_parent;
  delete from contact_requests where from_parent_id = p_parent or to_parent_id = p_parent;
  delete from guardians where parent_id = p_parent;
  delete from email_verifications where parent_id = p_parent;
  update students set first_name = 'Erased', last_name = 'student', known_as = null, email = null, gender = null, date_of_birth = null where id = any(kids);
  update parents set first_name = 'Erased', last_name = 'family', email = 'erased-' || id || '@invalid', phone = null, heard_about = null,
                     address = null, marketing_opt_in = false, accepts_contact_requests = false where id = p_parent;
  update consent_events set parent_id = null where parent_id = p_parent;   -- keep the anonymous proof, drop the link
  if p_request is not null then update privacy_requests set status = 'done', completed_at = now(), outcome = 'Erased; payment records kept 6 years without names' where id = p_request; end if;
  return jsonb_build_object('students', cardinality(kids), 'kept', 'payment records (amounts and dates only) for six years');
end $$;

-- ---------- opt-ins for contact (Children's Code: off by default) ----------
-- A child can use chat only once a parent turns it on: class chats only, or class chats plus private chats with
-- classmates whose parents have also allowed them. Parents are contactable by other parents only if they opt in
-- (parents.accepts_contact_requests, default false). Every change is recorded in consent_events.
alter table students add column chat_access text not null default 'none' check (chat_access in ('none', 'class', 'class_and_private'));
alter table consent_events drop constraint consent_events_purpose_check;
alter table consent_events add constraint consent_events_purpose_check
  check (purpose in ('marketing_email', 'contact_sharing', 'send_shared_with_teachers', 'leaderboard_name', 'photos', 'student_chat'));

create or replace function set_chat_access(p_student uuid, p_level text, p_parent uuid) returns void language plpgsql as $$
begin
  if not exists (select 1 from students where id = p_student and parent_id = p_parent) then raise exception 'only the child''s parent can change this'; end if;
  update students set chat_access = p_level where id = p_student;
  insert into consent_events (school_id, parent_id, student_id, purpose, granted, notice_version)
    select school_id, p_parent, p_student, 'student_chat', p_level <> 'none', '2026-10' from students where id = p_student;
end $$;

create or replace function start_direct_chat(a uuid, b uuid) returns uuid language plpgsql as $$
declare c uuid;
begin
  if a = b then raise exception 'a chat needs two different students'; end if;
  if not shares_active_class(a, b) then raise exception 'students can only chat with classmates'; end if;
  if (select count(*) from students where id in (a, b) and chat_access = 'class_and_private') < 2 then
    raise exception 'private chat needs both parents to allow it';
  end if;
  select m1.chat_id into c from student_chat_members m1 join student_chat_members m2 on m2.chat_id = m1.chat_id
    where m1.student_id = a and m2.student_id = b limit 1;
  if c is null then
    insert into student_chats (school_id, kind) select school_id, 'direct' from students where id = a returning id into c;
    insert into student_chat_members (school_id, chat_id, student_id) select school_id, c, id from students where id in (a, b);
  end if;
  return c;
end $$;

create or replace function student_chat_access_guard() returns trigger language plpgsql as $$
declare ch student_chats;
begin
  if new.sender_student_id is null then return new; end if;
  select * into ch from student_chats where id = new.chat_id;
  if (select chat_access from students where id = new.sender_student_id) = 'none' then raise exception 'chat is turned off for this student'; end if;
  if ch.kind = 'direct' and exists (select 1 from student_chat_members m join students s on s.id = m.student_id
                                    where m.chat_id = ch.id and s.chat_access <> 'class_and_private') then
    raise exception 'private chat needs both parents to allow it';
  end if;
  return new;
end $$;
create trigger student_chat_access_guard before insert on student_chat_messages for each row execute function student_chat_access_guard();

-- the contact-request opt-in is recorded as consent too
create or replace function parents_contact_consent() returns trigger language plpgsql as $$
begin
  if new.accepts_contact_requests is distinct from old.accepts_contact_requests then
    insert into consent_events (school_id, parent_id, purpose, granted, notice_version) values (new.school_id, new.id, 'contact_sharing', new.accepts_contact_requests, '2026-10');
  end if;
  return new;
end $$;
create trigger parents_contact_consent after update of accepts_contact_requests on parents for each row execute function parents_contact_consent();

-- ---------- each child's own Google account ----------
-- Classroom and Meet invitations go to the student's Google account, so it must be the child's own: never a
-- parent's or second guardian's email, never shared between children, and either Gmail or confirmed by the
-- parent to be a Google account. A booking can't be paid until every child on it has one.
alter table students add column google_account_confirmed boolean not null default false;
create or replace function student_email_guard() returns trigger language plpgsql as $$
begin
  if new.email is null then return new; end if;
  new.email := lower(trim(new.email));
  if exists (select 1 from parents p where p.id = new.parent_id and lower(p.email) = new.email)
     or exists (select 1 from guardians g where g.parent_id = new.parent_id and lower(g.email) = new.email) then
    raise exception 'a child needs their own Google account, not a parent''s email';
  end if;
  if exists (select 1 from students s where s.school_id = new.school_id and s.id <> new.id and lower(s.email) = new.email) then
    raise exception 'another child already uses this email';
  end if;
  if new.email !~ '@(gmail|googlemail)\.com$' and not new.google_account_confirmed then
    raise exception 'not a Gmail address: confirm it is a Google account';
  end if;
  return new;
end $$;
create trigger student_email_guard before insert or update of email, google_account_confirmed, parent_id on students
  for each row execute function student_email_guard();

create or replace function order_student_accounts_guard() returns trigger language plpgsql as $$
begin
  if new.status = 'paid' and old.status is distinct from 'paid' and exists (
       select 1 from enrolments e join students s on s.id = e.student_id where e.order_id = new.id and s.email is null) then
    raise exception 'add each child''s Google account email before paying';
  end if;
  return new;
end $$;
create trigger order_student_accounts_guard before update of status on orders for each row execute function order_student_accounts_guard();

-- ============ Class capacity, overrides and sticky labels ============
-- A class takes bookings until it reaches capacity, then shows no days or times and offers the waiting list.
-- Admins can override: keep_open (take bookings past capacity) or full (close it early).
-- Sticky labels on the course card are automatic from places left unless an admin picks one.
create type capacity_mode as enum ('auto', 'keep_open', 'full');
create type sticky_label as enum ('auto', 'off', 'few_spaces', 'almost_full', 'new_group', 'launching_soon');
alter table course_groups add column capacity_mode capacity_mode not null default 'auto',
                          add column sticky_label sticky_label not null default 'auto';
alter table schools add column few_places_at smallint not null default 5 check (few_places_at between 0 and 50),
                    add column almost_full_at smallint not null default 2 check (almost_full_at between 0 and 50);

create or replace function group_taken(p_group uuid) returns integer language sql stable as $$
  select count(*)::int from enrolments e where e.group_id = p_group and e.status in ('pending', 'active') and not e.is_taster
$$;

create or replace function group_is_full(p_group uuid) returns boolean language sql stable as $$
  select case g.capacity_mode when 'full' then true when 'keep_open' then false
              else g.capacity is not null and group_taken(g.id) >= g.capacity end
  from course_groups g where g.id = p_group
$$;

-- What the website shows for each class
create or replace view course_group_availability with (security_invoker = true) as
  select g.id as group_id, g.school_id, g.code, g.status, g.capacity, g.capacity_mode, g.sticky_label,
         x.taken,
         case when g.capacity is null then null else greatest(g.capacity - x.taken, 0) end as places_left,
         x.full as is_full,
         g.status in ('open', 'priority') and not x.full as bookable,
         g.status = 'waitlist' or (g.status in ('open', 'priority') and x.full) as shows_waitlist,
         g.status in ('open', 'priority') and not x.full as shows_times,
         (select count(*)::int from waitlist_entries w where w.group_id = g.id and w.enrolled_at is null) as waiting,
         case g.sticky_label
           when 'off' then null
           when 'few_spaces' then 'Few spaces left' when 'almost_full' then 'Almost full'
           when 'new_group' then 'New Group!' when 'launching_soon' then 'New Group Launching Soon!'
           else case
             when g.status = 'waitlist' then 'New Group Launching Soon!'
             when x.full or g.status not in ('open', 'priority') then null
             when g.capacity is not null and g.capacity_mode = 'auto' and g.capacity - x.taken <= s.almost_full_at then 'Almost full'
             when g.capacity is not null and g.capacity_mode = 'auto' and g.capacity - x.taken <= s.few_places_at then 'Few spaces left'
             when x.taken = 0 then 'New Group!'
           end end as label
  from course_groups g join schools s on s.id = g.school_id
  cross join lateral (select group_taken(g.id) as taken, group_is_full(g.id) as full) x;

-- Booking a full class is refused (admins override with capacity_mode = 'keep_open')
create or replace function can_book(p_group uuid, p_email citext) returns boolean language sql stable as $$
  select not group_is_full(g.id) and case g.status
    when 'open' then true
    when 'priority' then exists (select 1 from waitlist_entries w where w.group_id = g.id and w.email = p_email and w.emailed_at is not null)
    else false end
  from course_groups g where g.id = p_group
$$;

create or replace function enrolment_capacity_guard() returns trigger language plpgsql as $$
begin
  if new.status not in ('pending', 'active') or new.is_taster then return new; end if;
  if tg_op = 'UPDATE' and old.group_id = new.group_id and old.status in ('pending', 'active') then return new; end if;
  if group_is_full(new.group_id) then raise exception 'that class is full'; end if;
  return new;
end $$;
create trigger enrolment_capacity_guard before insert or update of group_id, status on enrolments
  for each row execute function enrolment_capacity_guard();

-- When a place comes up in a class that was full, invite the next family on its waiting list (first come, first served).
create or replace function enrolment_place_freed() returns trigger language plpgsql as $$
declare g course_groups; free int;
begin
  if not (old.status in ('pending', 'active') and new.status not in ('pending', 'active')) then return new; end if;
  select * into g from course_groups where id = old.group_id;
  if g.status not in ('open', 'priority') or g.capacity is null or g.capacity_mode <> 'auto' then return new; end if;
  free := g.capacity - group_taken(g.id)
        - (select count(*) from waitlist_entries w where w.group_id = g.id and w.emailed_at is not null and w.enrolled_at is null
             and w.emailed_at > now() - make_interval(hours => g.priority_hours));
  if free > 0 then
    update waitlist_entries set emailed_at = now() where id in (
      select id from waitlist_entries w where w.group_id = g.id and w.emailed_at is null and w.enrolled_at is null order by w.created_at limit free);
  end if;
  return new;
end $$;
create trigger enrolment_place_freed after update of status on enrolments for each row execute function enrolment_place_freed();

-- ============ Next year on sale from March ============
-- Each academic year has a date from which the website shows its term dates and sells its courses (default 1 March before it starts).
-- Until then its classes can be prepared in the admin but can't be booked.
alter table academic_years add column sales_open_on date;
update academic_years set sales_open_on = make_date(extract(year from starts_on)::int, 3, 1) where sales_open_on is null;
alter table academic_years alter column sales_open_on set not null;
create or replace function academic_year_sales_default() returns trigger language plpgsql as $$
begin
  new.sales_open_on := coalesce(new.sales_open_on, make_date(extract(year from new.starts_on)::int, 3, 1));
  return new;
end $$;
create trigger academic_year_sales_default before insert on academic_years for each row execute function academic_year_sales_default();

create or replace function year_on_sale(p_year uuid, p_today date default current_date) returns boolean language sql stable as $$
  select y.sales_open_on <= p_today and y.ends_on >= p_today from academic_years y where y.id = p_year
$$;

-- The years the website shows today: the current one, plus next year once its sales date has passed
create or replace view website_years with (security_invoker = true) as
  select y.id, y.school_id, y.label, y.starts_on, y.ends_on, y.sales_open_on,
         y.starts_on > current_date as is_next,
         (select count(*) from terms t where t.academic_year_id = y.id) = 6 as terms_ready
  from academic_years y
  where y.sales_open_on <= current_date and y.ends_on >= current_date;

create or replace view course_group_availability with (security_invoker = true) as
  select g.id as group_id, g.school_id, g.code, g.status, g.capacity, g.capacity_mode, g.sticky_label,
         x.taken,
         case when g.capacity is null then null else greatest(g.capacity - x.taken, 0) end as places_left,
         x.full as is_full,
         g.status in ('open', 'priority') and not x.full and x.on_sale as bookable,
         g.status = 'waitlist' or (g.status in ('open', 'priority') and x.full) as shows_waitlist,
         g.status in ('open', 'priority') and not x.full as shows_times,
         (select count(*)::int from waitlist_entries w where w.group_id = g.id and w.enrolled_at is null) as waiting,
         case g.sticky_label
           when 'off' then null
           when 'few_spaces' then 'Few spaces left' when 'almost_full' then 'Almost full'
           when 'new_group' then 'New Group!' when 'launching_soon' then 'New Group Launching Soon!'
           else case
             when g.status = 'waitlist' then 'New Group Launching Soon!'
             when x.full or g.status not in ('open', 'priority') then null
             when g.capacity is not null and g.capacity_mode = 'auto' and g.capacity - x.taken <= s.almost_full_at then 'Almost full'
             when g.capacity is not null and g.capacity_mode = 'auto' and g.capacity - x.taken <= s.few_places_at then 'Few spaces left'
             when x.taken = 0 then 'New Group!'
           end end as label,
         g.academic_year_id, x.on_sale
  from course_groups g join schools s on s.id = g.school_id
  cross join lateral (select group_taken(g.id) as taken, group_is_full(g.id) as full, year_on_sale(g.academic_year_id) as on_sale) x;

create or replace function can_book(p_group uuid, p_email citext) returns boolean language sql stable as $$
  select year_on_sale(g.academic_year_id) and not group_is_full(g.id) and case g.status
    when 'open' then true
    when 'priority' then exists (select 1 from waitlist_entries w where w.group_id = g.id and w.email = p_email and w.emailed_at is not null)
    else false end
  from course_groups g where g.id = p_group
$$;

create or replace function enrolment_year_guard() returns trigger language plpgsql as $$
declare y academic_years;
begin
  if new.status not in ('pending', 'active') or new.is_taster then return new; end if;
  if tg_op = 'UPDATE' and old.group_id = new.group_id then return new; end if;
  select y2.* into y from academic_years y2 join course_groups g on g.academic_year_id = y2.id where g.id = new.group_id;
  -- continuing classes (year 2 of a 2-year course) are filled by the school, not sold, so they're allowed early
  if y.sales_open_on > current_date and not exists (select 1 from course_groups g where g.id = new.group_id and g.continues_group_id is not null) then
    raise exception 'bookings for % open on %', y.label, to_char(y.sales_open_on, 'FMDD FMMonth YYYY');
  end if;
  return new;
end $$;
create trigger enrolment_year_guard before insert or update of group_id, status on enrolments
  for each row execute function enrolment_year_guard();

-- Prepare next year: copy this year's price plans, classes and weekly lesson times into a new academic year.
-- New-intake classes get fresh codes (KEng26/1 -> KEng27/1), no students and no Google Classroom yet.
-- Year 1 of a 2-year course also gets its year-2 class, linked to it and not sold on the website.
-- Term dates are entered separately (they change every year).
create or replace function prepare_next_year(p_from uuid, p_label text, p_starts date, p_ends date, p_sales date default null)
returns uuid language plpgsql as $$
declare fy academic_years; ny uuid; yy text; r record; ng uuid; plan uuid;
begin
  select * into fy from academic_years where id = p_from;
  if fy.id is null then raise exception 'unknown academic year'; end if;
  if p_starts <= fy.starts_on then raise exception 'the new year must start after %', fy.label; end if;
  insert into academic_years (school_id, label, starts_on, ends_on, sales_open_on)
    values (fy.school_id, p_label, p_starts, p_ends, coalesce(p_sales, make_date(extract(year from p_starts)::int, 3, 1))) returning id into ny;
  yy := to_char(p_starts, 'YY');

  create temp table _plan_map on commit drop as select p.id as old_id, gen_random_uuid() as new_id from price_plans p where p.academic_year_id = p_from;
  insert into price_plans (id, school_id, academic_year_id, level_id, name, course_years, year_of_course, lessons_per_week, term_count, lessons,
                           cost_per_lesson_pence, registration_fee_pence, reminder_days)
    select m.new_id, p.school_id, ny, p.level_id, p.name, p.course_years, p.year_of_course, p.lessons_per_week, p.term_count, p.lessons,
           p.cost_per_lesson_pence, p.registration_fee_pence, p.reminder_days
    from price_plans p join _plan_map m on m.old_id = p.id;

  for r in select g.*, p.course_years, p.year_of_course, p.level_id as plan_level, p.name as plan_name
           from course_groups g join price_plans p on p.id = g.price_plan_id
           where g.academic_year_id = p_from and g.status <> 'hidden' and g.continues_group_id is null and p.year_of_course = 1 loop
    -- new intake for the same course
    insert into course_groups (school_id, academic_year_id, level_id, subject_id, price_plan_id, teacher_id, code, capacity, lesson_minutes,
                               status, waitlist_threshold, priority_hours, description)
      values (r.school_id, ny, r.level_id, r.subject_id, (select new_id from _plan_map where old_id = r.price_plan_id), r.teacher_id,
              regexp_replace(r.code, '\d\d(/\d+)?$', yy || '\1'), r.capacity, r.lesson_minutes,
              case when r.status = 'waitlist' then 'waitlist' else 'open' end::group_status, r.waitlist_threshold, r.priority_hours, r.description)
      returning id into ng;
    insert into lesson_slots (school_id, academic_year_id, group_id, teacher_id, weekday, starts_at, ends_at)
      select s.school_id, ny, ng, s.teacher_id, s.weekday, s.starts_at, s.ends_at from lesson_slots s where s.group_id = r.id;
    -- the same students carry on into year 2 of a 2-year course
    if r.year_of_course < r.course_years then
      select m.new_id into plan from price_plans p join _plan_map m on m.old_id = p.id
        where p.academic_year_id = p_from and p.level_id = r.plan_level and p.course_years = r.course_years and p.year_of_course = r.year_of_course + 1;
      if plan is not null then
        insert into course_groups (school_id, academic_year_id, level_id, subject_id, price_plan_id, teacher_id, code, capacity, lesson_minutes,
                                   status, continues_group_id, description)
          values (r.school_id, ny, r.level_id, r.subject_id, plan, r.teacher_id, regexp_replace(r.code, '(/\d+)?$', 'Y2\1'), r.capacity, r.lesson_minutes,
                  'closed', r.id, r.description);
      end if;
    end if;
  end loop;
  return ny;
end $$;
