-- 1 Nov: the website's Teachers page becomes People (/people). Besides the teachers, it can show other people at the school
-- (e.g. the person who looks after systems and support): a name, a role and a photo, with no profile page of their own.
-- Managed in Admin → Teachers → "Also on the People page". Shown in the same order as the teachers (sort_order; on a tie,
-- after the teachers).
create table if not exists site_people (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references schools(id) on delete cascade,
  name             text not null check (length(name) between 1 and 80),
  role             text check (role is null or length(role) <= 80),
  photo            bytea,
  photo_type       text,
  photo_updated_at timestamptz,
  photo_asset      text,                 -- a photo shipped with the site (public/people), when none is uploaded
  sort_order       smallint not null default 0,
  archived_at      timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists site_people_school on site_people (school_id, sort_order);
grant select, insert, update, delete on site_people to app_user;
alter table site_people enable row level security;
drop policy if exists school_isolation on site_people;
create policy school_isolation on site_people to app_user using (school_id = current_school()) with check (school_id = current_school());

-- OH-SO ED: Alfonso, next to Leanne
insert into site_people (school_id, name, role, photo_asset, sort_order)
  select s.id, 'Alfonso Iacurci', 'Systems & Support', '/people/alfonso-iacurci.webp',
    coalesce((select t.sort_order from teachers t join users u on u.id = t.user_id where t.school_id = s.id and u.name ilike 'Leanne%' and t.archived_at is null limit 1), 0)
  from schools s where s.slug = 'ohsoed'
    and not exists (select 1 from site_people p where p.school_id = s.id and p.name = 'Alfonso Iacurci');

-- Demo Academy: its made-up Principal and IT Support are on its People page too (demo_contacts runs on every demo rebuild)
create or replace function demo_contacts() returns void language plpgsql security definer set search_path = public as $$
declare demo uuid; pr uuid; it uuid;
begin
  select id into demo from schools where slug = 'demo-academy' and is_demo; if demo is null then return; end if;
  select id into pr from users where school_id = demo and lower(email::text) = 'principal@demoacademy.example';
  if pr is null then insert into users (school_id, email, name, role) values (demo, 'principal@demoacademy.example', 'Helen Ward', 'school_admin') returning id into pr; end if;
  select id into it from users where school_id = demo and lower(email::text) = 'it.support@demoacademy.example';
  if it is null then insert into users (school_id, email, name, role) values (demo, 'it.support@demoacademy.example', 'Tom Reid', 'school_admin') returning id into it; end if;
  insert into meet_kv (school_id, key, value) values (demo, 'teacher_contacts', jsonb_build_array(jsonb_build_object('user_id', pr, 'label', 'Principal'), jsonb_build_object('user_id', it, 'label', 'IT Support')))
    on conflict (school_id, key) do update set value = excluded.value, updated_at = now();
  -- the Meet problem went to IT Support, the rest to the principal (who answers as herself)
  update inbox_messages set to_user = case when subject ilike '%meet%' then it else pr end,
      reply_from = case when replied_at is not null then 'principal@demoacademy.example' end
    where school_id = demo and kind = 'staff';
  delete from site_people where school_id = demo;
  insert into site_people (school_id, name, role, sort_order) values (demo, 'Helen Ward', 'Principal', -1), (demo, 'Tom Reid', 'Systems & Support', 99);
end $$;
revoke all on function demo_contacts() from public;
grant execute on function demo_contacts() to app_user;
do $$ begin if exists (select 1 from schools where slug = 'demo-academy' and is_demo) then perform demo_contacts(); end if; end $$;
