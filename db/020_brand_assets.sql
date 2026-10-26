-- Logo and browser-tab icon uploaded in Admin → Website (falls back to the built-in files when not set).
create table if not exists brand_assets (
  school_id  uuid not null references schools(id) on delete cascade,
  kind       text not null check (kind in ('logo', 'icon')),
  mime       text not null check (mime in ('image/png', 'image/jpeg', 'image/webp', 'image/svg+xml')),
  data       bytea not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id) on delete set null,
  primary key (school_id, kind)
);
grant select, insert, update, delete on brand_assets to app_user;
alter table brand_assets enable row level security;
drop policy if exists school_isolation on brand_assets;
create policy school_isolation on brand_assets to app_user using (school_id = current_school()) with check (school_id = current_school());
