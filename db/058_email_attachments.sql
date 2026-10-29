-- Files and Google Drive links on teachers' emails to the school (written in the site).
alter table inbox_messages add column if not exists links text[];
create table if not exists inbox_attachments (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  message_id  uuid not null references inbox_messages(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 200),
  mime        text not null,
  size        integer not null check (size between 1 and 4000000),
  data        bytea not null,
  created_at  timestamptz not null default now()
);
create index if not exists inbox_attachments_msg on inbox_attachments (message_id);
grant select, insert, update, delete on inbox_attachments to app_user;
alter table inbox_attachments enable row level security;
drop policy if exists school_isolation on inbox_attachments;
create policy school_isolation on inbox_attachments to app_user using (school_id = current_school()) with check (school_id = current_school());
