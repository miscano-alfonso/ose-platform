-- Demo Academy (31 Oct): no yellow. The accent (buttons, badges, the "Viewing as" bar) is a bright burgundy on the dark burgundy,
-- now and whenever the demo school is rebuilt. Replaces the yellow accent from 072.
create or replace function demo_school_colours() returns trigger language plpgsql as $$
begin
  if new.slug = 'demo-academy' then new.brand := coalesce(new.brand, '{}'::jsonb) || '{"primary":"#6e1830","accent":"#c8325e"}'::jsonb; end if;
  return new;
end $$;
update schools set brand = coalesce(brand, '{}'::jsonb) || '{"primary":"#6e1830","accent":"#c8325e"}'::jsonb where slug = 'demo-academy';
