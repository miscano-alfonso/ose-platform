-- 27 Nov (Alfonso: "give me an option to hide Leanne's and my visits"): browsers that school staff use for the admin,
-- so their introduction-page visits (before and after) can be left out of Visitors.
create table if not exists nd_staff_browsers (
  school_id uuid not null references schools(id) on delete cascade,
  vid text not null,
  user_id uuid not null references users(id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (school_id, vid, user_id)
);
alter table nd_staff_browsers enable row level security;
drop policy if exists school_isolation on nd_staff_browsers;
create policy school_isolation on nd_staff_browsers to app_user using (school_id = current_school()) with check (school_id = current_school());
grant select, insert, update, delete on nd_staff_browsers to app_user;
