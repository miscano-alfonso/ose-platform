-- 28 Nov (Alfonso): Marketing → Fill a class. For a class low on numbers, invite families who could take it (current
-- students at the same level not doing that subject, and families on its waiting list) to a free taster. Each send is
-- kept, with who it went to, and tasters booked from its link point back to it (taster_requests.push_id), so the page and
-- the taster journeys show what came of it.
create table if not exists class_pushes (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  group_id    uuid not null references course_groups(id) on delete cascade,
  subject     text not null,
  body        text not null,
  created_by  uuid references users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create table if not exists class_push_recipients (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  push_id     uuid not null references class_pushes(id) on delete cascade,
  parent_id   uuid references parents(id) on delete set null,
  student_id  uuid references students(id) on delete set null,
  child_name  text not null,
  email       citext not null,
  status      text not null check (status in ('sent', 'held', 'failed')),
  error       text,
  sent_at     timestamptz not null default now()
);
create index if not exists class_push_recipients_push on class_push_recipients (push_id);
create index if not exists class_push_recipients_student on class_push_recipients (student_id);
alter table taster_requests add column if not exists push_id uuid references class_pushes(id) on delete set null;
grant select, insert, update, delete on class_pushes, class_push_recipients to app_user;
alter table class_pushes enable row level security;
alter table class_push_recipients enable row level security;
drop policy if exists school_isolation on class_pushes;
create policy school_isolation on class_pushes to app_user using (school_id = current_school()) with check (school_id = current_school());
drop policy if exists school_isolation on class_push_recipients;
create policy school_isolation on class_push_recipients to app_user using (school_id = current_school()) with check (school_id = current_school());
