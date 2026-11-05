-- 5 Nov: a Classroom account the office has said belongs to a student (when its email and name don't match the student's
-- record, e.g. a different Google account). Google's user id stays the same across classes.
create table if not exists classroom_user_links (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  google_user_id text not null,
  student_id  uuid not null references students(id) on delete cascade,
  name        text,
  email       text,
  created_by  uuid references users(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (school_id, google_user_id)
);
grant select, insert, update, delete on classroom_user_links to app_user;
alter table classroom_user_links enable row level security;
drop policy if exists school_isolation on classroom_user_links;
create policy school_isolation on classroom_user_links to app_user using (school_id = current_school()) with check (school_id = current_school());
