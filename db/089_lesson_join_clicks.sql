-- 5 Nov: every press of a Join button (/join/<class>), whoever pressed it. Lets the office see who opened a lesson link and
-- when, and gives a strong clue for an unknown Google account in a lesson ("Ava pressed Join a minute before they joined").
create table if not exists lesson_join_clicks (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  group_id        uuid not null references course_groups(id) on delete cascade,
  lesson_event_id uuid references lesson_events(id) on delete set null,
  student_id      uuid references students(id) on delete set null,
  who             text not null check (who in ('student', 'staff', 'parent', 'link', 'nobody')),
  let_in          boolean not null default true,       -- false: sent to sign in, or turned away
  created_at      timestamptz not null default now()
);
create index if not exists lesson_join_clicks_school on lesson_join_clicks (school_id, created_at desc);
create index if not exists lesson_join_clicks_event on lesson_join_clicks (lesson_event_id) where lesson_event_id is not null;
grant select, insert, update, delete on lesson_join_clicks to app_user;
alter table lesson_join_clicks enable row level security;
drop policy if exists school_isolation on lesson_join_clicks;
create policy school_isolation on lesson_join_clicks to app_user using (school_id = current_school()) with check (school_id = current_school());
