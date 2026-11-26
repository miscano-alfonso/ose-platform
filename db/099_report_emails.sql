-- 26 Nov 2026: Reports → "Email the reports to parents": each child's whole report written out in an email to the family
-- (the account holder, and a second parent who gets reports), so parents can read it without signing in. One row per child
-- per report round, so a family is never emailed the same report twice.
create table if not exists report_emails (
  school_id   uuid not null references schools(id) on delete cascade,
  cycle_id    uuid not null references report_cycles(id) on delete cascade,
  student_id  uuid not null references students(id) on delete cascade,
  sent_to     text[] not null default '{}',
  sent_by     uuid references users(id) on delete set null,
  sent_at     timestamptz,
  error       text,
  primary key (cycle_id, student_id)
);
grant select, insert, update, delete on report_emails to app_user;
alter table report_emails enable row level security;
drop policy if exists school_isolation on report_emails;
create policy school_isolation on report_emails to app_user using (school_id = current_school()) with check (school_id = current_school());
