-- Admin → Automations: emails that send themselves when something happens (a taster is booked, a lesson is about to
-- start, a payment fails…). Each automation can be switched off and its wording and timing changed; every email sent
-- (or scheduled with Brevo for the right minute) is recorded once, so nothing goes twice.
create table if not exists automations (
  school_id   uuid not null references schools(id) on delete cascade,
  key         text not null check (key ~ '^[a-z_]{3,40}$'),
  enabled     boolean not null default true,
  subject     text not null check (char_length(subject) between 1 and 200),
  body        text not null check (char_length(body) between 1 and 5000),
  minutes     integer,                                 -- timing: before (lesson reminders) or after (follow-ups) the event
  to_parent   boolean not null default true,
  to_student  boolean not null default false,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references users(id),
  primary key (school_id, key)
);
create table if not exists automation_sends (
  id            bigserial primary key,
  school_id     uuid not null references schools(id) on delete cascade,
  key           text not null,
  ref           text not null,                         -- what it was about, e.g. the lesson and student
  to_email      citext not null,
  scheduled_for timestamptz,
  created_at    timestamptz not null default now(),
  message_id    text,
  status        text not null default 'sent' check (status in ('sent', 'scheduled', 'failed', 'cancelled')),
  error         text,
  unique (school_id, key, ref, to_email)
);
create index if not exists automation_sends_recent on automation_sends (school_id, created_at desc);
grant select, insert, update, delete on automations, automation_sends to app_user;
grant usage on sequence automation_sends_id_seq to app_user;
alter table automations enable row level security;
alter table automation_sends enable row level security;
drop policy if exists school_isolation on automations;
create policy school_isolation on automations to app_user using (school_id = current_school()) with check (school_id = current_school());
drop policy if exists school_isolation on automation_sends;
create policy school_isolation on automation_sends to app_user using (school_id = current_school()) with check (school_id = current_school());
