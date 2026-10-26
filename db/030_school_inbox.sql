-- Admin → Email → Inbox: emails from families to the school's inbox (read-only from Gmail), linked to the family.
-- Only messages from people the school knows (parents, second guardians, enquiries, waiting list, taster bookings) are kept:
-- the sender, subject, a short preview and the Gmail thread, so the office can open the full email in Gmail.
create table if not exists inbox_messages (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  gmail_id    text not null,
  thread_id   text not null,
  from_name   text,
  from_email  citext not null,
  subject     text not null default '',
  snippet     text not null default '',
  received_at timestamptz not null,
  parent_id   uuid references parents(id) on delete set null,
  kind        text not null default 'family' check (kind in ('family', 'enquiry', 'waiting', 'taster')),
  read_at     timestamptz,
  read_by     uuid references users(id) on delete set null,
  unique (school_id, gmail_id)
);
create index if not exists inbox_messages_recent on inbox_messages (school_id, received_at desc);
grant select, insert, update, delete on inbox_messages to app_user;
alter table inbox_messages enable row level security;
drop policy if exists school_isolation on inbox_messages;
create policy school_isolation on inbox_messages to app_user using (school_id = current_school()) with check (school_id = current_school());
