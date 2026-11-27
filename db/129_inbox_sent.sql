-- 27 Nov (Alfonso: "why are the teacher email feature not working like the admin's one?"). Emails the school sends a
-- teacher from Gmail itself (a reply typed in Gmail, or a new email to them) weren't kept, so a teacher's Email showed only
-- their own side. The inbox check now keeps the school's sent emails that go to a teacher or answer a teacher's email.
create table if not exists inbox_sent (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references schools(id) on delete cascade,
  gmail_id   text not null,
  thread_id  text not null,
  mailbox    citext,
  from_name  text,
  from_email citext,
  to_addrs   text[] not null default '{}',
  subject    text,
  body       text,
  sent_at    timestamptz not null,
  unique (school_id, gmail_id)
);
create index if not exists inbox_sent_thread on inbox_sent (school_id, thread_id);
create index if not exists inbox_sent_to on inbox_sent using gin (to_addrs);
grant select, insert, update, delete on inbox_sent to app_user;
alter table inbox_sent enable row level security;
drop policy if exists school_isolation on inbox_sent;
create policy school_isolation on inbox_sent to app_user using (school_id = current_school()) with check (school_id = current_school());

-- 27 Nov (Alfonso: "make the email and message features you've made for admin, the EXACT same for the teachers and parents"):
-- the parent's Email page shows New / All like the admin's inbox, so each email remembers when it was opened there.
alter table email_log add column if not exists read_at timestamptz;
