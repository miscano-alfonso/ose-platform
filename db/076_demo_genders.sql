-- Demo Academy (1 Nov): made-up genders, as a parent gives at registration, so report drafts use he/she/they.
-- demo_genders() runs on every demo rebuild (src/lib/demo.ts) and once here.
create or replace function demo_genders() returns void language plpgsql security definer set search_path = public as $$
declare demo uuid;
begin
  select id into demo from schools where slug = 'demo-academy' and is_demo; if demo is null then return; end if;
  update students set gender = case
      when first_name in ('Kit', 'Quinn', 'Sami') then 'Non-binary'
      when first_name in ('Ada','Bea','Cleo','Dora','Elsie','Freya','Grace','Isla','Lola','Nia','Pippa','Rosa','Tess','Ula','Wren','Yara') then 'Female'
      when first_name in ('Arlo','Ben','Cosmo','Dev','Eli','Finn','Hari','Jonah','Milo','Otto','Vince','Xander','Zac') then 'Male'
      else gender end
    where school_id = demo;
end $$;
revoke all on function demo_genders() from public;
grant execute on function demo_genders() to app_user;
do $$ begin if exists (select 1 from schools where slug = 'demo-academy' and is_demo) then perform demo_genders(); end if; end $$;
