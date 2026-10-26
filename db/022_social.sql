-- Social (Admin → Social): post drafts for each platform, pictures, the content calendar,
-- posting to the Facebook Page and Instagram, and "Upcoming moments" found by Claude.
-- Modelled on the Giles CMS social section.

-- settings kept as small JSON values: meta (app id/secret, page tokens: server only), ai (Anthropic key: server only),
-- template (picture template), handles (Instagram handles per teacher), moments (the moments list and weekly report)
create table if not exists social_kv (
  school_id  uuid not null references schools(id) on delete cascade,
  key        text not null check (key ~ '^[a-z_]{1,40}$'),
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (school_id, key)
);

-- posts made from here to Facebook and Instagram, with each channel's result
create table if not exists social_posts (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  created_at  timestamptz not null default now(),
  created_by  text not null default '',
  text        text not null default '' check (char_length(text) <= 20000),
  ig_text     text not null default '' check (char_length(ig_text) <= 5000),
  link        text not null default '' check (char_length(link) <= 500),
  image       text not null default '' check (char_length(image) <= 200),
  images      text[] not null default '{}',
  item_id     text not null default '' check (char_length(item_id) <= 120),
  post_at     timestamptz,
  channels    jsonb not null default '{}'::jsonb,
  stats       jsonb,
  stats_at    timestamptz
);
create index if not exists social_posts_created on social_posts (school_id, created_at desc);

-- the content calendar: one planned post per platform and date
create table if not exists social_plan (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  created_at  timestamptz not null default now(),
  created_by  text not null default '',
  status      text not null default 'planned' check (status in ('planned', 'posted')),
  platform    text not null check (platform in ('instagram', 'facebook', 'linkedin', 'x', 'threads', 'bluesky')),
  plan_date   date not null,
  item_id     text not null default '' check (char_length(item_id) <= 120),
  text        text not null default '' check (char_length(text) <= 5000),
  link        text not null default '' check (char_length(link) <= 500),
  size        text not null default 'square' check (size in ('square', 'portrait', 'story', 'landscape')),
  posted_at   timestamptz,
  url         text not null default '' check (char_length(url) <= 500)
);
create index if not exists social_plan_date on social_plan (school_id, plan_date);

-- JPEG pictures made in the browser for posting: Facebook and Instagram fetch them from /social-img/<id>.jpg
create table if not exists social_images (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  created_at  timestamptz not null default now(),
  data        bytea not null check (octet_length(data) <= 8 * 1024 * 1024)
);

grant select, insert, update, delete on social_kv, social_posts, social_plan, social_images to app_user;
alter table social_kv enable row level security;
alter table social_posts enable row level security;
alter table social_plan enable row level security;
alter table social_images enable row level security;
drop policy if exists school_isolation on social_kv;
create policy school_isolation on social_kv to app_user using (school_id = current_school()) with check (school_id = current_school());
drop policy if exists school_isolation on social_posts;
create policy school_isolation on social_posts to app_user using (school_id = current_school()) with check (school_id = current_school());
drop policy if exists school_isolation on social_plan;
create policy school_isolation on social_plan to app_user using (school_id = current_school()) with check (school_id = current_school());
drop policy if exists school_isolation on social_images;
create policy school_isolation on social_images to app_user using (school_id = current_school()) with check (school_id = current_school());
