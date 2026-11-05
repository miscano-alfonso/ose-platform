-- 5 Nov: the office can start a message from Admin → Messages to a parent, a student or a teacher, or to every parent or
-- student in a class or level. Each person gets their own private conversation (a group send is a "batch"); it shows in
-- their area of the platform (parent and student Messages, the teacher's Messages page) and a copy goes by email.
create table if not exists office_batches (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  label       text not null check (char_length(label) between 1 and 200),   -- who it went to, e.g. "Year 10 parents"
  subject     text not null,
  recipients  integer not null default 0,
  emailed     integer not null default 0,
  held        integer not null default 0,                                  -- emails held back by test mode
  created_by  uuid references users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create table if not exists office_threads (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  batch_id        uuid references office_batches(id) on delete set null,
  to_kind         text not null check (to_kind in ('parent', 'student', 'teacher')),
  parent_id       uuid references parents(id) on delete cascade,
  student_id      uuid references students(id) on delete cascade,           -- for a parent: the child it's about, when there's one
  teacher_id      uuid references teachers(id) on delete cascade,
  subject         text not null check (char_length(subject) between 1 and 160),
  status          text not null default 'open' check (status in ('open', 'closed')),
  created_by      uuid references users(id) on delete set null,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  check ((to_kind = 'parent' and parent_id is not null) or (to_kind = 'student' and student_id is not null) or (to_kind = 'teacher' and teacher_id is not null))
);
create index if not exists office_threads_school on office_threads (school_id, last_message_at desc);
create index if not exists office_threads_parent on office_threads (parent_id) where parent_id is not null;
create index if not exists office_threads_student on office_threads (student_id) where student_id is not null;
create index if not exists office_threads_teacher on office_threads (teacher_id) where teacher_id is not null;
create table if not exists office_messages (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  thread_id       uuid not null references office_threads(id) on delete cascade,
  sender          text not null check (sender in ('office', 'parent', 'student', 'teacher')),
  sender_user_id  uuid references users(id) on delete set null,
  body            text not null check (char_length(body) between 1 and 5000),
  emailed         boolean not null default false,
  created_at      timestamptz not null default now(),
  read_at         timestamptz                                                -- read by the other side
);
create index if not exists office_messages_thread on office_messages (thread_id, created_at);

grant select, insert, update, delete on office_batches, office_threads, office_messages to app_user;
alter table office_batches enable row level security;
alter table office_threads enable row level security;
alter table office_messages enable row level security;
drop policy if exists school_isolation on office_batches;
drop policy if exists school_isolation on office_threads;
drop policy if exists school_isolation on office_messages;
create policy school_isolation on office_batches to app_user using (school_id = current_school()) with check (school_id = current_school());
create policy school_isolation on office_threads to app_user using (school_id = current_school()) with check (school_id = current_school());
create policy school_isolation on office_messages to app_user using (school_id = current_school()) with check (school_id = current_school());
