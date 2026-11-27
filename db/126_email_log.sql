-- 27 Nov (Alfonso: "separate the emails and messages on teacher and parent dashboards"): a copy of each email the school
-- sends to someone (subject and words), so a parent's Email page can list the emails they've had from the school.
create table if not exists email_log (
  id bigserial primary key,
  school_id uuid not null references schools(id) on delete cascade,
  to_email citext not null,
  subject text not null,
  body text not null,
  tag text,
  sent_at timestamptz not null default now(),
  scheduled_for timestamptz
);
create index if not exists email_log_to on email_log (school_id, to_email, sent_at desc);
alter table email_log enable row level security;
drop policy if exists school_isolation on email_log;
create policy school_isolation on email_log to app_user using (school_id = current_school()) with check (school_id = current_school());
grant select, insert, update, delete on email_log to app_user;
grant usage, select on sequence email_log_id_seq to app_user;
