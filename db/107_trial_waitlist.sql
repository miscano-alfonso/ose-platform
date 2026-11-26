-- 26 Nov: a trial class opens itself. After a taster in a trial class the family is emailed a one-click link to join
-- the class's waiting list. When enough families have joined (the class's waitlist_threshold), the class stops being a
-- trial and opens: the waiting-list families get the usual head start (priority), then it opens to everyone.

alter table taster_bookings add column if not exists join_token uuid not null default gen_random_uuid();
create unique index if not exists taster_bookings_join_token on taster_bookings (join_token);

alter table waitlist_entries add column if not exists taster_booking_id uuid references taster_bookings(id) on delete set null;
create unique index if not exists waitlist_entries_taster_booking on waitlist_entries (taster_booking_id) where taster_booking_id is not null;

-- Opens a class whose waiting list has reached its target: a waiting-list class, or a trial class (which stops being a trial).
-- Run when a family joins (trigger below) and when the target is changed in Classes. p_now: open a trial class now, whatever
-- the count (Classes → untick Trial); with nobody on its waiting list it simply opens to everyone.
create or replace function waitlist_recheck(p_group uuid, p_now boolean default false) returns boolean language plpgsql as $$
declare g course_groups%rowtype; n int;
begin
  select * into g from course_groups where id = p_group for update;
  if not found or not (g.status = 'waitlist' or (g.trial and g.status = 'open')) then return false; end if;
  if p_now and not g.trial then return false; end if;
  select count(*) into n from waitlist_entries where group_id = p_group and enrolled_at is null;
  if p_now and n = 0 then
    update course_groups set trial = false, trial_ended_at = now() where id = g.id;
    return true;
  end if;
  if not p_now and n < g.waitlist_threshold then return false; end if;
  update course_groups set status = 'priority', priority_until = now() + make_interval(hours => g.priority_hours),
    trial = false, trial_ended_at = case when g.trial then now() else trial_ended_at end
  where id = g.id;
  update waitlist_entries set emailed_at = now() where group_id = g.id and emailed_at is null;   -- the email job sends to rows stamped here
  return true;
end $$;

create or replace function waitlist_check_threshold() returns trigger language plpgsql as $$
begin
  if new.group_id is not null then perform waitlist_recheck(new.group_id); end if;
  return new;
end $$;
