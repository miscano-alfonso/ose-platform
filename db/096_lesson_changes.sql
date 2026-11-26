-- 26 Nov 2026: cancelling and moving single lessons.
-- A moved lesson is cancelled and a replacement lesson is made at the new date and time. The replacement has its own
-- one-off slot (lesson_slots.one_off_on = its date), so its time comes from its slot like every other lesson, and the
-- timetable, calendars, reminders, Meet attendance and teacher pay all treat it as a normal lesson. One-off slots are
-- never repeated weekly, copied to next year or into the demo, and don't count as weekly clashes.
-- Teachers ask the office to cancel or move a lesson (lesson_change_requests); an admin approves or declines.

alter table lesson_slots add column if not exists one_off_on date;
alter table lesson_slots drop constraint if exists lesson_slots_teacher_id_academic_year_id_weekday_minutes_excl;
alter table lesson_slots add constraint lesson_slots_teacher_id_academic_year_id_weekday_minutes_excl
  exclude using gist (teacher_id with =, academic_year_id with =, weekday with =, minutes with &&) where (teacher_id is not null and one_off_on is null);

alter table lesson_events add column if not exists moved_from uuid references lesson_events(id) on delete set null;

-- KS3, Pre-GCSE and GCSE (GCSE and iGCSE together): a moved lesson may not clash with another lesson in the same group
create or replace function level_family(p_name text) returns text language sql immutable as $$
  select case when p_name ~* '^\s*pre' then 'pre-gcse' when p_name ~* 'gcse' then 'gcse' when p_name ~* 'ks\s*3|key stage 3' then 'ks3'
    when p_name ~* 'a[ -]?level' then 'a-level' else lower(trim(p_name)) end
$$;

create table if not exists lesson_change_requests (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools(id) on delete cascade,
  event_id      uuid not null references lesson_events(id) on delete cascade,
  requested_by  uuid references users(id) on delete set null,
  kind          text not null check (kind in ('cancel', 'move')),
  new_date      date,
  new_start     time,
  reason        text not null check (char_length(reason) between 1 and 300),
  status        text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'withdrawn')),
  decided_by    uuid references users(id) on delete set null,
  decided_at    timestamptz,
  decline_note  text check (decline_note is null or char_length(decline_note) <= 300),
  new_event_id  uuid references lesson_events(id) on delete set null,
  created_at    timestamptz not null default now(),
  check (kind = 'cancel' or (new_date is not null and new_start is not null))
);
create unique index if not exists lesson_change_requests_one_pending on lesson_change_requests (event_id) where status = 'pending';
create index if not exists lesson_change_requests_school on lesson_change_requests (school_id, status, created_at desc);
grant select, insert, update, delete on lesson_change_requests to app_user;
alter table lesson_change_requests enable row level security;
drop policy if exists school_isolation on lesson_change_requests;
create policy school_isolation on lesson_change_requests to app_user using (school_id = current_school()) with check (school_id = current_school());

-- weekly lessons only from weekly slots
create or replace function generate_lesson_events(p_term uuid) returns integer language plpgsql as $function$
declare n integer;
begin
  insert into lesson_events (school_id, slot_id, group_id, term_id, lesson_date, teacher_id)
  select s.school_id, s.id, s.group_id, t.id, d::date, s.teacher_id
  from terms t
  join lesson_slots s on s.academic_year_id = t.academic_year_id and s.one_off_on is null
  join course_groups g on g.id = s.group_id and g.status <> 'hidden'
  join price_plans p on p.id = g.price_plan_id and t.number <= p.term_count     -- a 5-term course has no term-6 lessons
  cross join generate_series(t.starts_on, t.ends_on, interval '1 day') d
  where t.id = p_term
    and extract(isodow from d) = s.weekday
    and not exists (select 1 from holidays h where h.school_id = t.school_id and d::date between h.starts_on and h.ends_on)
  on conflict (slot_id, lesson_date) do nothing;
  get diagnostics n = row_count;
  return n;
end $function$;

create or replace function student_clashes(p_student uuid, p_group uuid)
  returns table(clashing_group uuid, weekday smallint, starts_at time without time zone, ends_at time without time zone) language sql stable as $function$
  select o.group_id, o.weekday, o.starts_at, o.ends_at
  from lesson_slots n
  join enrolments e on e.student_id = p_student and e.status in ('pending', 'active') and e.group_id <> p_group
  join lesson_slots o on o.group_id = e.group_id and o.weekday = n.weekday and o.minutes && n.minutes and o.one_off_on is null
  where n.group_id = p_group and n.one_off_on is null
$function$;

-- next year and the demo copy weekly slots only
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('prepare_next_year'::regproc);
  n := replace(d, 'from lesson_slots s where s.group_id = r.id;', 'from lesson_slots s where s.group_id = r.id and s.one_off_on is null;');
  if n = d then raise exception 'prepare_next_year: slot copy not found'; end if;
  execute n;
  d := pg_get_functiondef('reset_demo_school'::regproc);
  n := replace(d, 'from lesson_slots s where s.group_id in (select old from m);', 'from lesson_slots s where s.group_id in (select old from m) and s.one_off_on is null;');
  if n = d then raise exception 'reset_demo_school: slot copy not found'; end if;
  execute n;
end $$;
