-- OH-SO EdTech self-serve trials: a visitor picks Solo or Growth on /osedtech/trial, confirms their email, chooses a
-- password and gets their own empty school for 30 days. (The School plan stays "on request".)
--  * schools.plan / trial_ends_at: which plan a customer school is on, and when its trial ends (null = not a trial).
--  * edtech_trials gains the one-time link (confirm email / reset password) and the school it became.
--  * create_trial_school() makes the school, its first admin (also its first teacher) and copies OH-SO ED's term dates,
--    holidays, grade bands and attendance settings so the calendar works from day one. Only callable from the
--    platform's own school, at most 40 a day.
alter table schools add column if not exists plan text check (plan in ('solo', 'growth', 'school'));
alter table schools add column if not exists trial_ends_at timestamptz;

alter table edtech_trials add column if not exists self_serve boolean not null default false;
alter table edtech_trials add column if not exists token_hash text;
alter table edtech_trials add column if not exists token_kind text check (token_kind in ('confirm', 'reset'));
alter table edtech_trials add column if not exists token_expires timestamptz;
alter table edtech_trials add column if not exists school_slug text;
create index if not exists edtech_trials_token on edtech_trials (token_hash) where token_hash is not null;
create index if not exists edtech_trials_email on edtech_trials (school_id, email);

create or replace function create_trial_school(p_slug text, p_name text, p_plan text, p_email text, p_admin text, p_hash text, p_days int default 30)
returns uuid language plpgsql security definer set search_path = public as $$
declare src uuid; s uuid; r record; y uuid; uid uuid;
begin
  -- only from the platform's own school (the /osedtech pages), never from inside a customer or demo school
  select id into src from schools where id = current_school() and plan is null and not is_demo;
  if src is null then raise exception 'not allowed'; end if;
  if p_plan not in ('solo', 'growth') then raise exception 'plan must be solo or growth'; end if;
  if p_slug !~ '^[a-z0-9-]{2,40}$' or p_hash !~ '^scrypt\$' or length(coalesce(p_name, '')) < 1 then raise exception 'bad details'; end if;
  if (select count(*) from schools where trial_ends_at is not null and created_at > now() - interval '1 day') >= 40 then raise exception 'too many trials today'; end if;
  insert into schools (slug, name, brand, plan, trial_ends_at, timezone, currency, taster_places_per_lesson, few_places_at, almost_full_at)
    select p_slug, left(p_name, 120), '{"primary":"#12162f","accent":"#f5c84b"}'::jsonb, p_plan, now() + make_interval(days => least(greatest(p_days, 1), 90)),
      timezone, currency, taster_places_per_lesson, few_places_at, almost_full_at from schools where id = src
    returning id into s;
  -- the calendar: this year and next (UK term dates and holidays, editable under Term dates)
  create temp table if not exists tm (old uuid primary key, new uuid not null) on commit drop;
  delete from tm;
  for r in select * from academic_years where school_id = src and ends_on >= current_date loop
    insert into academic_years (school_id, label, starts_on, ends_on, sales_open_on) values (s, r.label, r.starts_on, r.ends_on, r.sales_open_on) returning id into y;
    insert into tm values (r.id, y);
  end loop;
  insert into terms (school_id, academic_year_id, number, name, starts_on, ends_on, bills_on)
    select s, (select new from tm where old = t.academic_year_id), number, name, starts_on, ends_on, bills_on from terms t where t.academic_year_id in (select old from tm);
  insert into holidays (school_id, name, starts_on, ends_on) select s, name, starts_on, ends_on from holidays where school_id = src and ends_on >= current_date - 30;
  -- the usual UK levels (KS3, GCSE…), so prices and classes can be added straight away; rename or add more under Prices
  insert into levels (school_id, name, min_age, max_age, sort_order, notice_terms) select s, name, min_age, max_age, sort_order, notice_terms from levels where school_id = src;
  insert into grade_bands (school_id, score, label, min_pct, progress_text, effort_text) select s, score, label, min_pct, progress_text, effort_text from grade_bands where school_id = src;
  insert into attendance_settings select s, late_grace_minutes, early_grace_minutes, min_minutes, source from attendance_settings where school_id = src;
  -- the person who signed up: admin, and the school's first teacher
  insert into users (school_id, email, name, role, password_hash) values (s, lower(p_email), left(p_admin, 120), 'school_admin', p_hash) returning id into uid;
  insert into teachers (school_id, user_id, designation, sort_order) values (s, uid, 'Teacher', 1);
  return s;
end $$;

-- Alfonso, from Settings → EdTech trials: move a trial's end date (also only from the platform's own school)
create or replace function set_trial_end(p_slug text, p_ends timestamptz) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from schools where id = current_school() and plan is null and not is_demo) then raise exception 'not allowed'; end if;
  update schools set trial_ends_at = p_ends where slug = p_slug and plan is not null;
end $$;

-- Sign-in from /osedtech/login: the customer schools where this email has a staff login (slugs only)
create or replace function trial_schools_for(p_email text) returns table (slug text, name text) language sql security definer set search_path = public stable as $$
  select s.slug, s.name from schools s join users u on u.school_id = s.id
  where s.plan is not null and not s.is_demo and lower(u.email::text) = lower(p_email) and u.role in ('school_admin', 'teacher') and u.disabled_at is null
  order by s.created_at desc limit 5
$$;

-- Settings → EdTech trials: the customer schools and their trial end dates (only from the platform's own school)
create or replace function trial_school_list() returns table (slug text, name text, plan text, trial_ends_at timestamptz) language plpgsql security definer set search_path = public stable as $$
begin
  if not exists (select 1 from schools x where x.id = current_school() and x.plan is null and not x.is_demo) then return; end if;
  return query select s.slug, s.name, s.plan, s.trial_ends_at from schools s where s.plan is not null order by s.created_at desc;
end $$;

revoke all on function trial_school_list() from public;
grant execute on function trial_school_list() to app_user;
revoke all on function create_trial_school(text, text, text, text, text, text, int) from public;
revoke all on function set_trial_end(text, timestamptz) from public;
revoke all on function trial_schools_for(text) from public;
grant execute on function create_trial_school(text, text, text, text, text, text, int) to app_user;
grant execute on function set_trial_end(text, timestamptz) to app_user;
grant execute on function trial_schools_for(text) to app_user;
