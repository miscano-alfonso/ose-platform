-- Teachers email named people only (not the school inbox). Put the principal (leanne@ohsoed.co.uk, if she has an admin
-- account in this school) first on the list, keeping anyone already ticked.
insert into meet_kv (school_id, key, value)
select u.school_id, 'teacher_contacts',
  jsonb_build_array(jsonb_build_object('user_id', u.id, 'label', 'Principal'))
  || coalesce((select jsonb_agg(e) from meet_kv k, jsonb_array_elements(k.value) e where k.school_id = u.school_id and k.key = 'teacher_contacts' and e->>'user_id' <> u.id::text), '[]'::jsonb)
from users u where lower(u.email::text) = 'leanne@ohsoed.co.uk' and u.role = 'school_admin' and u.disabled_at is null
on conflict (school_id, key) do update set value = excluded.value, updated_at = now();
