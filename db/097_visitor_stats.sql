-- 26 Nov 2026: Admin → Visitors (/visitors): who has looked at the /newdashboard introduction pages and who uses the dashboards.
-- A browser that opens an introduction page gets a random id (cookie ose_vid). The id is tied to a person once that
-- browser is signed in: a parent or student straight away, a teacher the next time they open their dashboard.
-- Dashboard use is one row per person per day (teachers, parents, students; never an admin "Viewing as" someone).

create table if not exists nd_page_views (
  id         bigserial primary key,
  school_id  uuid not null references schools(id) on delete cascade,
  vid        text not null check (vid ~ '^[A-Za-z0-9_-]{16,40}$'),
  page       text not null check (page in ('teacher', 'parent', 'student')),
  at         timestamptz not null default now()
);
create index if not exists nd_page_views_school on nd_page_views (school_id, at desc);
create index if not exists nd_page_views_vid on nd_page_views (school_id, vid);

create table if not exists nd_visitor_people (
  school_id  uuid not null references schools(id) on delete cascade,
  vid        text not null,
  kind       text not null check (kind in ('teacher', 'parent', 'student')),
  person_id  uuid not null,
  linked_at  timestamptz not null default now(),
  primary key (school_id, vid, kind, person_id)
);
create index if not exists nd_visitor_people_person on nd_visitor_people (school_id, kind, person_id);

create table if not exists dashboard_days (
  school_id  uuid not null references schools(id) on delete cascade,
  kind       text not null check (kind in ('teacher', 'parent', 'student')),
  person_id  uuid not null,
  day        date not null,
  first_at   timestamptz not null default now(),
  last_at    timestamptz not null default now(),
  hits       integer not null default 1,
  primary key (school_id, kind, person_id, day)
);

grant select, insert, update, delete on nd_page_views, nd_visitor_people, dashboard_days to app_user;
grant usage, select on sequence nd_page_views_id_seq to app_user;
alter table nd_page_views enable row level security;
alter table nd_visitor_people enable row level security;
alter table dashboard_days enable row level security;
drop policy if exists school_isolation on nd_page_views;
drop policy if exists school_isolation on nd_visitor_people;
drop policy if exists school_isolation on dashboard_days;
create policy school_isolation on nd_page_views to app_user using (school_id = current_school()) with check (school_id = current_school());
create policy school_isolation on nd_visitor_people to app_user using (school_id = current_school()) with check (school_id = current_school());
create policy school_isolation on dashboard_days to app_user using (school_id = current_school()) with check (school_id = current_school());

-- what's already known: families' own sign-ins still on record, and teachers' last sign-in
insert into dashboard_days (school_id, kind, person_id, day, first_at, last_at, hits)
select school_id, case when parent_id is not null then 'parent' else 'student' end, coalesce(parent_id, student_id), created_at::date, min(created_at), max(greatest(created_at, coalesce(last_seen_at, created_at))), count(*)::int
from family_sessions where viewer_user_id is null and coalesce(parent_id, student_id) is not null
group by 1, 2, 3, 4
on conflict do nothing;
insert into dashboard_days (school_id, kind, person_id, day, first_at, last_at, hits)
select u.school_id, 'teacher', u.id, u.last_sign_in_at::date, u.last_sign_in_at, u.last_sign_in_at, 1
from users u where u.role = 'teacher' and u.last_sign_in_at is not null and u.school_id is not null
on conflict do nothing;
