-- OH-SO ED 2026-27 timetable, as published on ohsoed.co.uk/time_table (all lessons 45 minutes), with each class's teacher from the
-- "OSE Classroom Links" sheet. Replaces the example times in the new admin. For each course the class used is this year's first
-- class of that level and subject. Lessons that already have attendance, tasters or reported absences are kept.
do $$
declare sid uuid; yid uuid; r record; tid uuid; mins int; n int := 0;
begin
  select id into sid from schools where slug = 'ohsoed';
  if sid is null then return; end if;
  select id into yid from academic_years where school_id = sid and ends_on >= current_date order by starts_on limit 1;
  if yid is null then return; end if;
  create temporary table tt (lvl text, subj text, teacher text, wd int, at time) on commit drop;
  insert into tt values
    ('KS3', 'History', 'Jade', 4, '09:30'), ('KS3', 'Geography', 'Aimee', 4, '10:30'), ('KS3', 'English Language', 'Leanne', 2, '11:30'),
    ('KS3', 'English Literature', 'Leanne', 3, '11:30'), ('KS3', 'Maths', 'Becky', 2, '13:00'), ('KS3', 'Science', 'Rachel', 3, '13:00'),
    ('Pre-GCSE', 'Maths', 'Becky', 1, '09:30'), ('Pre-GCSE', 'English Language', 'Leanne', 2, '09:30'), ('Pre-GCSE', 'English Literature', 'Leanne', 3, '09:30'),
    ('Pre-GCSE', 'Science', 'Rachel', 1, '10:30'), ('Pre-GCSE', 'Maths', 'Becky', 2, '10:30'), ('Pre-GCSE', 'English Language', 'Leanne', 4, '10:30'),
    ('Pre-GCSE', 'Science', 'Rachel', 5, '10:30'), ('Pre-GCSE', 'History', 'Jade', 2, '11:30'), ('Pre-GCSE', 'Business Studies', 'Jade', 4, '11:30'),
    ('Pre-GCSE', 'Geography', 'Aimee', 3, '13:00'),
    ('iGCSE', 'Biology', 'Rachel', 1, '09:30'), ('iGCSE', 'Maths Higher', 'Becky', 2, '09:30'), ('iGCSE', 'English Literature', 'Leanne', 4, '09:30'),
    ('iGCSE', 'Maths Higher', 'Becky', 5, '09:30'), ('iGCSE', 'Geography', 'Aimee', 1, '10:30'), ('iGCSE', 'English Language', 'Leanne', 2, '10:30'),
    ('iGCSE', 'English Literature', 'Leanne', 3, '10:30'), ('iGCSE', 'Business Studies', 'Jade', 4, '10:30'), ('iGCSE', 'Geography', 'Aimee', 5, '10:30'),
    ('iGCSE', 'Maths Foundation', 'Becky', 1, '11:30'), ('iGCSE', 'Science Double Award', 'Rachel', 2, '11:30'), ('iGCSE', 'Maths Foundation', 'Becky', 4, '11:30'),
    ('iGCSE', 'English Literature', 'Leanne', 2, '13:00'), ('iGCSE', 'English Language', 'Leanne', 3, '13:00'), ('iGCSE', 'English Language', 'Leanne', 4, '13:00'),
    ('iGCSE', 'Science Double Award', 'Rachel', 5, '13:00'), ('iGCSE', 'Business Studies', 'Jade', 2, '14:00'), ('iGCSE', 'Biology', 'Rachel', 3, '14:00'),
    ('iGCSE', 'Biology', 'Rachel', 4, '14:00'), ('iGCSE', 'History', 'Jade', 2, '15:00'), ('iGCSE', 'History', 'Jade', 4, '15:00');

  -- which class each course is
  create temporary table tg on commit drop as
    select distinct on (t.lvl, t.subj) t.lvl, t.subj, t.teacher, g.id as gid
    from (select distinct lvl, subj, teacher from tt) t
    join levels l on l.school_id = sid and l.name = t.lvl
    join subjects sj on sj.school_id = sid and (lower(sj.name) = lower(t.subj) or (t.subj = 'Science Double Award' and lower(sj.name) like 'science double%'))
    join course_groups g on g.school_id = sid and g.academic_year_id = yid and g.level_id = l.id and g.subject_id = sj.id and g.continues_group_id is null and g.status <> 'closed'
    order by t.lvl, t.subj, (g.meet_url is null), g.code;

  -- clear the old (example) times. For these classes, every weekly time that isn't on the published timetable goes, with its lessons:
  -- attendance comes from Google Meet and is worked out again on the next Re-read. Lessons with tasters or reported absences are kept.
  delete from lesson_slots s using tg where s.group_id = tg.gid
    and not exists (select 1 from tt join tg t2 using (lvl, subj) where t2.gid = s.group_id and tt.wd = s.weekday and tt.at = s.starts_at)
    and not exists (select 1 from lesson_events e join taster_bookings b on b.lesson_event_id = e.id where e.slot_id = s.id)
    and not exists (select 1 from lesson_events e join absence_notices a on a.lesson_event_id = e.id where e.slot_id = s.id);
  -- and this year's classes nobody is enrolled in (example classes whose times would clash), keeping any lesson that has a record
  delete from lesson_events e using course_groups g where e.group_id = g.id and g.school_id = sid and g.academic_year_id = yid
    and g.id not in (select gid from tg) and not exists (select 1 from enrolments x where x.group_id = g.id and x.status in ('pending','active'))
    and not exists (select 1 from attendance_marks m where m.lesson_event_id = e.id) and not exists (select 1 from taster_bookings b where b.lesson_event_id = e.id)
    and not exists (select 1 from absence_notices a where a.lesson_event_id = e.id);
  delete from lesson_slots s using course_groups g where s.group_id = g.id and g.school_id = sid and g.academic_year_id = yid
    and g.id not in (select gid from tg) and not exists (select 1 from enrolments x where x.group_id = g.id and x.status in ('pending','active'))
    and not exists (select 1 from lesson_events e where e.slot_id = s.id);

  -- teachers, then the new weekly times
  for r in select * from tg loop
    select t.id into tid from teachers t join users u on u.id = t.user_id where t.school_id = sid and u.name ilike r.teacher || '%' and t.archived_at is null limit 1;
    update course_groups set teacher_id = coalesce(tid, teacher_id), status = case when status = 'hidden' then 'open'::group_status else status end where id = r.gid;
  end loop;
  for r in select tt.*, tg.gid from tt join tg using (lvl, subj) loop
    select teacher_id, coalesce(lesson_minutes, 45) into tid, mins from course_groups where id = r.gid;
    if exists (select 1 from lesson_slots s where s.group_id = r.gid and s.weekday = r.wd and s.starts_at = r.at) then continue; end if;
    begin
      insert into lesson_slots (school_id, academic_year_id, group_id, teacher_id, weekday, starts_at, ends_at)
        values (sid, yid, r.gid, tid, r.wd, r.at, r.at + make_interval(mins => mins));
      n := n + 1;
    exception when exclusion_violation then raise notice 'skipped % % % %: teacher already teaching then', r.lvl, r.subj, r.wd, r.at;
    end;
  end loop;
  insert into audit_log (school_id, action, entity, detail) values (sid, 'import', 'timetable', jsonb_build_object('source', 'ohsoed.co.uk/time_table', 'lessons', n));
end $$;
