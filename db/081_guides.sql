-- 2 Nov: Guides (/guides): a page of presentations and how-to guides for teachers, parents and students, open to anyone
-- with the link (not in the menu, not indexed). Managed in Admin → Website → Guides.
create table if not exists site_guides (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  audience    text not null check (audience in ('teachers', 'parents', 'students')),
  title       text not null check (length(title) between 1 and 120),
  description text check (description is null or length(description) <= 400),
  url         text not null check (url ~ '^https://' and length(url) <= 600),
  kind        text not null default 'slides' check (kind in ('slides', 'video', 'document', 'link')),
  sort_order  smallint not null default 0,
  hidden      boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists site_guides_school on site_guides (school_id, audience, sort_order);
grant select, insert, update, delete on site_guides to app_user;
alter table site_guides enable row level security;
drop policy if exists school_isolation on site_guides;
create policy school_isolation on site_guides to app_user using (school_id = current_school()) with check (school_id = current_school());

-- OH-SO ED: the teacher dashboard walkthrough (a Claude Slides deck; share it as "anyone with the link" for teachers to open it)
insert into site_guides (school_id, audience, title, description, url, kind, sort_order)
  select s.id, 'teachers', 'Your teacher dashboard',
    'Every menu item, what it does, and how it works with Google Classroom, Meet, Drive and Calendar.',
    'https://claude.ai/artifact/J73CkkYoytJWZ2263CRay9', 'slides', 1
  from schools s where s.slug = 'ohsoed'
    and not exists (select 1 from site_guides g where g.school_id = s.id and g.url = 'https://claude.ai/artifact/J73CkkYoytJWZ2263CRay9');
