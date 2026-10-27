-- OH-SO EdTech (/osedtech): free-trial requests from teachers who want the platform for their own school.
-- Kept with the school that runs the site (OH-SO ED) and listed in Admin → Settings → EdTech trials.
create table if not exists edtech_trials (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  name        text not null,
  email       citext not null,
  business    text not null default '',
  website     text not null default '',
  teachers    text not null default '',
  students    text not null default '',
  plan        text not null default '' check (plan in ('', 'solo', 'growth', 'school')),
  subjects    text not null default '',
  tools       text not null default '',
  message     text not null default '',
  status      text not null default 'new' check (status in ('new', 'contacted', 'trial', 'customer', 'closed')),
  note        text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists edtech_trials_recent on edtech_trials (school_id, created_at desc);
grant select, insert, update, delete on edtech_trials to app_user;
alter table edtech_trials enable row level security;
drop policy if exists school_isolation on edtech_trials;
create policy school_isolation on edtech_trials to app_user using (school_id = current_school()) with check (school_id = current_school());
