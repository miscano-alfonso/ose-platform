-- The two test families from the seed (parent1/parent2@example.test) are removed now that real families are imported.
do $$ declare s uuid; begin
  select id into s from schools where slug = 'ohsoed';
  if s is null then return; end if;
  delete from enrolments where student_id in (select st.id from students st join parents p on p.id = st.parent_id where p.school_id = s and p.email::text like '%@example.test');
  delete from orders where parent_id in (select id from parents where school_id = s and email::text like '%@example.test');
  delete from students where parent_id in (select id from parents where school_id = s and email::text like '%@example.test');
  delete from parents where school_id = s and email::text like '%@example.test';
end $$;
