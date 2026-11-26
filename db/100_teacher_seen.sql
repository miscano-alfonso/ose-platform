-- 26 Nov 2026: the teacher's Messages inbox (list + conversation). When a teacher last opened each conversation with the
-- school (their emails to the office), so a reply from the school shows as unread until they open it. Family messages
-- (messages.read_by_teacher_at) and office messages (office_messages.read_at) already keep their own.
create table if not exists teacher_seen (
  school_id  uuid not null references schools(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  key        text not null,               -- 'school:<email thread id>'
  seen_at    timestamptz not null default now(),
  primary key (user_id, key)
);
grant select, insert, update, delete on teacher_seen to app_user;
alter table teacher_seen enable row level security;
drop policy if exists school_isolation on teacher_seen;
create policy school_isolation on teacher_seen to app_user using (school_id = current_school()) with check (school_id = current_school());
