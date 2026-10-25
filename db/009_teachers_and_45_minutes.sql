-- OH-SO ED (Oct 2026): every lesson is 45 minutes, and each subject has one teacher:
-- English & Literature – Leanne; Geography & Maths – Becky; Business & History – Jade; all Sciences – Rachel.
do $$
declare sch uuid; s record; tid uuid; n_skip int := 0;
begin
  select id into sch from schools where slug = 'ohsoed';
  if sch is null then return; end if;

  -- 45-minute lessons (shortening can never create a clash)
  alter table course_groups alter column lesson_minutes set default 45;
  update course_groups set lesson_minutes = 45 where school_id = sch;
  update lesson_slots set ends_at = starts_at + interval '45 minutes' where school_id = sch;

  -- subject -> teacher
  create temp table subject_teacher on commit drop as
    select sj.id as subject_id, t.id as teacher_id
    from subjects sj
    join lateral (select case
        when sj.name ~* 'english|literature' then 'Leanne'
        when sj.name ~* 'geography|math' then 'Becky'
        when sj.name ~* 'business|history' then 'Jade'
        when sj.name ~* 'science|biology|chemistry|physics' then 'Rachel' end as first) m on m.first is not null
    join teachers t on t.school_id = sch and t.archived_at is null
    join users u on u.id = t.user_id and split_part(u.name, ' ', 1) = m.first
    where sj.school_id = sch;

  -- what each teacher can teach (used for 1:1s): their subjects at every level
  delete from teacher_subjects ts using teachers t where t.id = ts.teacher_id and t.school_id = sch
    and ts.subject_id in (select subject_id from subject_teacher);
  insert into teacher_subjects (teacher_id, level_id, subject_id)
    select st.teacher_id, l.id, st.subject_id from subject_teacher st cross join levels l where l.school_id = sch
    on conflict do nothing;

  -- class teachers, and the teacher on each weekly lesson (skipping any lesson that would double-book them)
  update course_groups g set teacher_id = st.teacher_id from subject_teacher st where g.subject_id = st.subject_id and g.school_id = sch;
  for s in select sl.id, st.teacher_id from lesson_slots sl join course_groups g on g.id = sl.group_id join subject_teacher st on st.subject_id = g.subject_id
           where sl.school_id = sch and sl.teacher_id is distinct from st.teacher_id loop
    begin
      update lesson_slots set teacher_id = s.teacher_id where id = s.id;
    exception when exclusion_violation then n_skip := n_skip + 1;
    end;
  end loop;
  update lesson_events e set teacher_id = sl.teacher_id from lesson_slots sl
    where sl.id = e.slot_id and e.school_id = sch and e.lesson_date >= current_date and e.status = 'scheduled';
  if n_skip > 0 then raise notice '% weekly lessons kept their teacher because of a clash', n_skip; end if;
end $$;
