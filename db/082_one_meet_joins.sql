-- 2 Nov: 1:1s are logged as taught from Google Meet's log, like class lessons. Each join to a 1:1's own Meet (made by
-- ose@, db/079) is kept here; once the 1:1 has ended (plus 90 minutes, for Meet's log to arrive) a booked 1:1 that its
-- teacher joined becomes "completed" (the student was there for 5 minutes or more) or "no_show" (they weren't), which is
-- what pays it. A 1:1 the teacher's school account never joined stays booked for the teacher or the office to mark.
create table if not exists one_meet_joins (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references schools(id) on delete cascade,
  booking_id        uuid not null references tutoring_bookings(id) on delete cascade,
  external_id       text not null unique,
  participant_email citext,
  display_name      text,
  is_teacher        boolean not null default false,
  joined_at         timestamptz not null,
  left_at           timestamptz not null
);
create index if not exists one_meet_joins_booking on one_meet_joins (booking_id);
grant select, insert, update, delete on one_meet_joins to app_user;
alter table one_meet_joins enable row level security;
drop policy if exists school_isolation on one_meet_joins;
create policy school_isolation on one_meet_joins to app_user using (school_id = current_school()) with check (school_id = current_school());
