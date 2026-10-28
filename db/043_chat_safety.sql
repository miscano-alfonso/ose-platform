-- Chat safety: messages that break the school's chat rules (bad language, unkind words, personal details, arranging to
-- meet, worrying words) are flagged for staff, and blocked ones are kept here so staff still see the attempt.
create table if not exists student_chat_flags (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references schools(id) on delete cascade,
  chat_id           uuid not null references student_chats(id) on delete cascade,
  message_id        uuid references student_chat_messages(id) on delete cascade,  -- null when the message was blocked
  sender_student_id uuid references students(id) on delete set null,
  body              text not null check (char_length(body) <= 1000),
  rules             text[] not null,
  matched           text,
  blocked           boolean not null default false,
  status            text not null default 'open' check (status in ('open', 'hidden', 'no_action')),
  resolved_by       uuid references users(id),
  resolved_at       timestamptz,
  created_at        timestamptz not null default now()
);
create index if not exists student_chat_flags_open on student_chat_flags (school_id, created_at) where status = 'open';
grant select, insert, update, delete on student_chat_flags to app_user;
alter table student_chat_flags enable row level security;
drop policy if exists school_isolation on student_chat_flags;
create policy school_isolation on student_chat_flags to app_user using (school_id = current_school()) with check (school_id = current_school());

-- The parent agreed to the school's chat rules with their child (when turning chat on), and which version.
alter table students add column if not exists chat_rules_agreed_at timestamptz;
alter table students add column if not exists chat_rules_version text;

alter table consent_events drop constraint if exists consent_events_purpose_check;
alter table consent_events add constraint consent_events_purpose_check
  check (purpose in ('marketing_email', 'contact_sharing', 'send_shared_with_teachers', 'leaderboard_name', 'photos', 'student_chat', 'chat_rules'));
