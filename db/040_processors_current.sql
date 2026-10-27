-- OH-SO ED's suppliers as they are now (the seed had placeholders): hosting is Vercel and Neon, email is Brevo, AttendList is no longer used.
do $$ declare s uuid; begin
  select id into s from schools where slug = 'ohsoed';
  if s is null then return; end if;
  delete from processors where school_id = s and name in ('AttendList', 'Hosting provider (to choose)', 'Email delivery provider (to choose)');
  insert into processors (school_id, name, purpose, data, location, transfer_safeguard)
  select s, x.name, x.purpose, x.data, x.location, x.safeguard from (values
    ('Vercel', 'Website and dashboards (hosting)', 'All platform data passing through the site', 'UK (London region)', 'Vercel DPA'),
    ('Neon', 'Database', 'All platform data', 'UK (London region)', 'Neon DPA'),
    ('Brevo', 'Emails and newsletters', 'Names and email addresses, email opens', 'EU (France)', 'Brevo DPA; EU adequacy')
  ) as x(name, purpose, data, location, safeguard)
  where not exists (select 1 from processors p where p.school_id = s and p.name = x.name);
end $$;
