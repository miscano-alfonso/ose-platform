-- Demo Academy's new colours (deep teal and coral), now and whenever the demo school is rebuilt.
create or replace function demo_school_colours() returns trigger language plpgsql as $$
begin
  if new.slug = 'demo-academy' then new.brand := coalesce(new.brand, '{}'::jsonb) || '{"primary":"#123c46","accent":"#ff8a65"}'::jsonb; end if;
  return new;
end $$;
drop trigger if exists demo_school_colours on schools;
create trigger demo_school_colours before insert on schools for each row execute function demo_school_colours();
update schools set brand = coalesce(brand, '{}'::jsonb) || '{"primary":"#123c46","accent":"#ff8a65"}'::jsonb where slug = 'demo-academy';
