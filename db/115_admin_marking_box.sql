-- 27 Nov (Alfonso): the admin home gets a Marking box (every teacher's marking). Admins who have arranged their own
-- home already get it placed straight after their Messages box (or at the end), at the same width, once.
update dashboard_layouts d set layout = (
  select jsonb_agg(x.item order by x.ord, x.sub)
  from (
    select e.value as item, e.ordinality::numeric as ord, 0 as sub from jsonb_array_elements(d.layout) with ordinality e
    union all
    select jsonb_build_object('id', 'marking', 'size', coalesce((select m.value->>'size' from jsonb_array_elements(d.layout) m where m.value->>'id' = 'messages' limit 1), 'l')),
      coalesce((select m.ordinality from jsonb_array_elements(d.layout) with ordinality m where m.value->>'id' = 'messages' limit 1), jsonb_array_length(d.layout))::numeric, 1
  ) x)
where d.page = 'admin-home' and jsonb_typeof(d.layout) = 'array'
  and not exists (select 1 from jsonb_array_elements(d.layout) m where m.value->>'id' = 'marking');
