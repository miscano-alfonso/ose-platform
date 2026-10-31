-- Parent registration on the website (31 Oct): parents register themselves and their children before checking out.
-- SEND: whether the child has special educational needs, and any reports or evidence the parent uploads.
alter table students add column if not exists has_send boolean;
create table if not exists student_files (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  student_id  uuid not null references students(id) on delete cascade,
  kind        text not null default 'send_evidence' check (kind in ('send_evidence')),
  name        text not null check (char_length(name) between 1 and 200),
  mime        text not null,
  size        integer not null check (size between 1 and 4000000),
  data        bytea not null,
  created_at  timestamptz not null default now()
);
create index if not exists student_files_student on student_files (student_id);
grant select, insert, update, delete on student_files to app_user;
alter table student_files enable row level security;
drop policy if exists school_isolation on student_files;
create policy school_isolation on student_files to app_user using (school_id = current_school()) with check (school_id = current_school());
