-- Emails sent from the admin (to families, a class, a level, or the marketing list), sent through Brevo.
create table if not exists email_campaigns (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  kind            text not null check (kind in ('message', 'marketing')),
  audience        text not null,
  audience_label  text not null,
  subject         text not null check (char_length(subject) between 1 and 200),
  body            text not null check (char_length(body) between 1 and 20000),
  recipients      integer not null default 0,
  sent            integer not null default 0,
  failed          integer not null default 0,
  error           text,
  sent_by         uuid references users(id) on delete set null,
  created_at      timestamptz not null default now()
);
grant select, insert, update, delete on email_campaigns to app_user;
alter table email_campaigns enable row level security;
drop policy if exists school_isolation on email_campaigns;
create policy school_isolation on email_campaigns to app_user using (school_id = current_school()) with check (school_id = current_school());
