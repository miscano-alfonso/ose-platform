-- Demo Academy (31 Oct): teachers message the school from Messages (no separate Email page), so the demo lists two
-- made-up people at the school, a Principal and IT Support, and its teachers' messages are to them. demo_contacts() runs
-- after demo_comms on every demo rebuild (src/lib/demo.ts) and once here. The two have no password, so can't sign in.
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
end $$;
revoke all on function demo_contacts() from public;
grant execute on function demo_contacts() to app_user;
do $$ begin if exists (select 1 from schools where slug = 'demo-academy' and is_demo) then perform demo_contacts(); end if; end $$;
