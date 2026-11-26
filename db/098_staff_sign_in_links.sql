-- 26 Nov 2026: teachers sign in with an emailed link (Staff sign in → "Email me a sign-in link"), like families.
-- Admin accounts still sign in with their password. A link works once, for 30 minutes; the button on the link's
-- page uses it (email scanners that open links don't press buttons).
create table if not exists staff_links (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  token_hash  text not null unique,
  ip          text,
  expires_at  timestamptz not null default now() + interval '30 minutes',
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists staff_links_user on staff_links (school_id, user_id, created_at desc);
-- requests are counted here too (rate limit), whether or not the address belongs to a teacher
create table if not exists staff_link_requests (
  id          bigserial primary key,
  school_id   uuid not null references schools(id) on delete cascade,
  email       text not null,
  ip          text,
  created_at  timestamptz not null default now()
);
create index if not exists staff_link_requests_at on staff_link_requests (school_id, created_at desc);

grant select, insert, update, delete on staff_links, staff_link_requests to app_user;
grant usage, select on sequence staff_link_requests_id_seq to app_user;
alter table staff_links enable row level security;
alter table staff_link_requests enable row level security;
drop policy if exists school_isolation on staff_links;
drop policy if exists school_isolation on staff_link_requests;
create policy school_isolation on staff_links to app_user using (school_id = current_school()) with check (school_id = current_school());
create policy school_isolation on staff_link_requests to app_user using (school_id = current_school()) with check (school_id = current_school());
