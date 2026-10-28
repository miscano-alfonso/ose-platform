-- OH-SO ED Calendar: a private calendar address (iCalendar feed) per teacher, parent and student, so lessons, 1:1s,
-- workshops, holidays and (for parents) payment dates show in Google Calendar, Apple Calendar or Outlook.
-- The token in the address is the only key, so "Make a new link" replaces it and the old address stops working.
create table if not exists calendar_feeds (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  owner_kind  text not null check (owner_kind in ('staff', 'parent', 'student')),
  owner_id    uuid not null,                       -- users.id / parents.id / students.id
  token       text not null unique,
  created_at  timestamptz not null default now(),
  fetched_at  timestamptz,                          -- last time a calendar app read it
  unique (school_id, owner_kind, owner_id)
);
grant select, insert, update, delete on calendar_feeds to app_user;
alter table calendar_feeds enable row level security;
drop policy if exists school_isolation on calendar_feeds;
create policy school_isolation on calendar_feeds to app_user using (school_id = current_school()) with check (school_id = current_school());
