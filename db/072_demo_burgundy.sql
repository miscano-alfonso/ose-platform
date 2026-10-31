-- Demo Academy's colours (31 Oct): burgundy with yellow highlights (burnt orange comes from the dashboards' demo palette),
-- now and whenever the demo school is rebuilt. Replaces the teal and coral from 038.
create or replace function demo_school_colours() returns trigger language plpgsql as $$
begin
  if new.slug = 'demo-academy' then new.brand := coalesce(new.brand, '{}'::jsonb) || '{"primary":"#7b1e34","accent":"#ffcc33"}'::jsonb; end if;
  return new;
end $$;
update schools set brand = coalesce(brand, '{}'::jsonb) || '{"primary":"#7b1e34","accent":"#ffcc33"}'::jsonb where slug = 'demo-academy';
