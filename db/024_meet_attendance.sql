-- Attendance straight from Google Meet: the school's Google Workspace admin connects once (read-only access to the
-- Meet audit log, kept by Google for 6 months), and the site reads who joined each lesson, when, and for how long.
-- meet_kv holds the connection (client id/secret and refresh token stay server-side), the last sync and the weekly alert settings.
create table if not exists meet_kv (
  school_id  uuid not null references schools(id) on delete cascade,
  key        text not null check (key ~ '^[a-z0-9_:-]{1,80}$'),
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (school_id, key)
);
grant select, insert, update, delete on meet_kv to app_user;
alter table meet_kv enable row level security;
drop policy if exists school_isolation on meet_kv;
create policy school_isolation on meet_kv to app_user using (school_id = current_school()) with check (school_id = current_school());

alter table meet_sessions add column if not exists meeting_code text,
  add column if not exists organizer_email citext,
  add column if not exists ignored boolean not null default false,       -- the office said this join wasn't a student (a parent, a tutor, a guest)
  add column if not exists matched_by uuid references users(id);          -- set when the office matched a join to a student by hand
create index if not exists meet_sessions_unmatched on meet_sessions (school_id, lesson_event_id) where student_id is null and not ignored;
