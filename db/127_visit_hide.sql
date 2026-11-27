-- 27 Nov (Alfonso: "show visitor code like in Giles, so I can hide my visits"): where a visit came from (town and
-- country, from the hosting's own lookup; no IP address kept), and browsers hidden from Visitors by hand.
alter table nd_page_views add column if not exists place text;
create table if not exists nd_hidden_browsers (
  school_id uuid not null references schools(id) on delete cascade,
  vid text not null,
  hidden_by uuid references users(id) on delete set null,
  hidden_at timestamptz not null default now(),
  primary key (school_id, vid)
);
alter table nd_hidden_browsers enable row level security;
drop policy if exists school_isolation on nd_hidden_browsers;
create policy school_isolation on nd_hidden_browsers to app_user using (school_id = current_school()) with check (school_id = current_school());
grant select, insert, update, delete on nd_hidden_browsers to app_user;
