-- 27 Nov (Alfonso: one Messages page for parents and teachers, and "make email replies go into the conversation"). Each
-- email about a message now has its own reply address (the school inbox with a tag, e.g. ose+o<conversation>@…). When the
-- inbox is checked, a reply sent to one of those addresses by someone in that conversation is added to it, and noted here
-- so it's only added once (and isn't also listed in Admin → Email).
create table if not exists inbox_threaded (
  school_id  uuid not null references schools(id) on delete cascade,
  gmail_id   text not null,
  kind       text not null check (kind in ('office', 'family')),
  thread_id  uuid not null,
  from_email citext,
  added_at   timestamptz not null default now(),
  primary key (school_id, gmail_id)
);
grant select, insert, update, delete on inbox_threaded to app_user;
alter table inbox_threaded enable row level security;
drop policy if exists school_isolation on inbox_threaded;
create policy school_isolation on inbox_threaded to app_user using (school_id = current_school()) with check (school_id = current_school());
