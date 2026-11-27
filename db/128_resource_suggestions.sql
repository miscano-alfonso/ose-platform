-- 27 Nov (Alfonso: "add a Resources item to [the teachers'] nav, so they can see resources, and suggest resources to
-- admin for their subjects"). Teachers suggest a resource; the office adds it to the Resources page (Admin → Website →
-- Resources) or says not for now. The teacher sees what happened on their Resources page.
create table if not exists resource_suggestions (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  teacher_id  uuid not null references teachers(id) on delete cascade,
  subject     text not null check (length(subject) between 1 and 60),
  title       text not null check (length(title) between 1 and 120),
  description text check (description is null or length(description) <= 400),
  url         text check (url is null or (url ~ '^https://' and length(url) <= 600)),
  kind        text not null default 'website' check (kind in ('website', 'watch', 'listen', 'book', 'tip')),
  status      text not null default 'new' check (status in ('new', 'added', 'not_now')),
  office_note text check (office_note is null or length(office_note) <= 500),
  resource_id uuid references site_resources(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists resource_suggestions_school on resource_suggestions (school_id, status, created_at desc);
grant select, insert, update, delete on resource_suggestions to app_user;
alter table resource_suggestions enable row level security;
drop policy if exists school_isolation on resource_suggestions;
create policy school_isolation on resource_suggestions to app_user using (school_id = current_school()) with check (school_id = current_school());
