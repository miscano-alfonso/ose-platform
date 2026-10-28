-- Test mode: while the school tests the new dashboards with real data, nothing goes out to families, students or
-- teachers. Emails to anyone not on the allowed list (the school's admins plus any addresses added) are held and
-- listed here instead; Classroom invitations and posts wait. Switched in Admin → Settings → Test mode (meet_kv test_mode).
create table if not exists held_messages (
  id          bigserial primary key,
  school_id   uuid not null references schools(id) on delete cascade,
  created_at  timestamptz not null default now(),
  channel     text not null,                 -- email / classroom / newsletter
  to_addr     text,
  to_name     text,
  subject     text,
  body        text,
  tag         text
);
create index if not exists held_messages_recent on held_messages (school_id, created_at desc);
grant select, insert, update, delete on held_messages to app_user;
grant usage, select on sequence held_messages_id_seq to app_user;
alter table held_messages enable row level security;
drop policy if exists school_isolation on held_messages;
create policy school_isolation on held_messages to app_user using (school_id = current_school()) with check (school_id = current_school());

-- automatic emails held in test mode are remembered as 'held', so they aren't sent later by surprise
alter table automation_sends drop constraint if exists automation_sends_status_check;
alter table automation_sends add constraint automation_sends_status_check check (status in ('sent', 'scheduled', 'failed', 'cancelled', 'held'));
