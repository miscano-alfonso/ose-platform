-- Parents and students sign in with a link emailed to them (no passwords to forget). Only a hash of each token is kept.
-- An admin "Viewing as" a parent or student gets a session marked with their own user id: they see exactly what the family
-- sees, but nothing can be changed or sent in the family's name.
create table if not exists family_links (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  parent_id   uuid references parents(id) on delete cascade,
  student_id  uuid references students(id) on delete cascade,
  token_hash  text not null unique,
  expires_at  timestamptz not null default now() + interval '30 minutes',
  used_at     timestamptz,
  created_at  timestamptz not null default now(),
  check (num_nonnulls(parent_id, student_id) = 1)
);
create table if not exists family_sessions (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  parent_id       uuid references parents(id) on delete cascade,
  student_id      uuid references students(id) on delete cascade,
  viewer_user_id  uuid references users(id) on delete cascade,     -- set when an admin is viewing as this family
  token_hash      text not null unique,
  created_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  expires_at      timestamptz not null,
  check (num_nonnulls(parent_id, student_id) = 1)
);
create index if not exists family_sessions_parent on family_sessions (parent_id);
grant select, insert, update, delete on family_links, family_sessions to app_user;
alter table family_links enable row level security;
alter table family_sessions enable row level security;
drop policy if exists school_isolation on family_links;
create policy school_isolation on family_links to app_user using (school_id = current_school()) with check (school_id = current_school());
drop policy if exists school_isolation on family_sessions;
create policy school_isolation on family_sessions to app_user using (school_id = current_school()) with check (school_id = current_school());
