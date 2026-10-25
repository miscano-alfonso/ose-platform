-- Staff sign-in for the admin: server-side sessions (only a hash of the cookie token is stored)
-- and a log of sign-in attempts used to lock out password guessing.
create table staff_sessions (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  user_id         uuid not null references users(id) on delete cascade,
  token_hash      text not null unique,                     -- sha-256 of the cookie value
  created_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  expires_at      timestamptz not null,
  ip              text,
  user_agent      text
);
create index staff_sessions_user on staff_sessions (user_id);

create table sign_in_attempts (
  id              bigserial primary key,
  school_id       uuid not null references schools(id) on delete cascade,
  email           citext not null,
  ip              text,
  ok              boolean not null,
  created_at      timestamptz not null default now()
);
create index sign_in_attempts_recent on sign_in_attempts (school_id, email, created_at);

grant select, insert, update, delete on staff_sessions, sign_in_attempts to app_user;
grant usage on all sequences in schema public to app_user;
do $$ declare t text; begin
  foreach t in array array['staff_sessions', 'sign_in_attempts'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I no force row level security', t);
    execute format('create policy school_isolation on %I to app_user using (school_id = current_school()) with check (school_id = current_school())', t);
  end loop;
end $$;
