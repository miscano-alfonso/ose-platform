-- Admin → Marketing → Post designs: ready-made social post designs in the OH-SO ED style (the Facebook page's look),
-- filled from the courses, teachers and term dates. Illustrations come from uploads or from a Canva folder (read-only).
create table if not exists design_assets (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  name        text not null,
  kind        text not null default 'illustration' check (kind in ('illustration', 'photo')),
  source      text not null default 'upload' check (source in ('upload', 'canva')),
  canva_id    text,                                   -- the Canva design it was exported from
  mime        text not null check (mime in ('image/png', 'image/jpeg', 'image/webp')),
  data        bytea not null,
  created_by  uuid references users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists design_assets_recent on design_assets (school_id, created_at desc);
create unique index if not exists design_assets_canva on design_assets (school_id, canva_id) where canva_id is not null;

-- Canva connection (client id/secret, refresh token, the chosen folder) and other studio settings.
create table if not exists design_kv (
  school_id  uuid not null references schools(id) on delete cascade,
  key        text not null check (key ~ '^[a-z0-9_:-]{1,80}$'),
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (school_id, key)
);

grant select, insert, update, delete on design_assets, design_kv to app_user;
alter table design_assets enable row level security;
alter table design_kv enable row level security;
drop policy if exists school_isolation on design_assets;
create policy school_isolation on design_assets to app_user using (school_id = current_school()) with check (school_id = current_school());
drop policy if exists school_isolation on design_kv;
create policy school_isolation on design_kv to app_user using (school_id = current_school()) with check (school_id = current_school());
