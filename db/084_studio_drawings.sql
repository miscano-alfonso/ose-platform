-- 3 Nov: Sketch Studio (/studio). Drawings made in the studio, in the home page's chalk style: the shapes Claude placed
-- (spec), how they're coloured (palette, bg, hl) and the stroke seed, so any drawing can be opened, changed and saved again.
create table if not exists studio_drawings (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  created_by  uuid references users(id) on delete set null,
  title       text not null default 'Drawing',
  prompt      text not null default '',
  bg          text not null default 'white' check (bg in ('white', 'navy')),
  palette     text not null default 'house',
  hl          text not null default 'soft' check (hl in ('off', 'soft', 'glow')),
  seed        integer not null default 7,
  spec        jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists studio_drawings_school on studio_drawings (school_id, created_at desc);
grant select, insert, update, delete on studio_drawings to app_user;
alter table studio_drawings enable row level security;
drop policy if exists school_isolation on studio_drawings;
create policy school_isolation on studio_drawings to app_user using (school_id = current_school()) with check (school_id = current_school());
