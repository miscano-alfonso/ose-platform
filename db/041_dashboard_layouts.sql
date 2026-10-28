-- Each admin's own arrangement of their dashboard: which modules show, in what order and at what size.
create table if not exists dashboard_layouts (
  school_id   uuid not null references schools(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  page        text not null check (page ~ '^[a-z-]{1,40}$'),
  layout      jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, page)
);
grant select, insert, update, delete on dashboard_layouts to app_user;
alter table dashboard_layouts enable row level security;
drop policy if exists school_isolation on dashboard_layouts;
create policy school_isolation on dashboard_layouts to app_user using (school_id = current_school()) with check (school_id = current_school());
