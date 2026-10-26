-- OH-SO ED 2026-27: each class's Google Meet code and Google Classroom course, from the "OSE Classroom Links" sheet (2026-27 tab).
-- Matched by the class code (OSE ID); where no class has that code (classes made by the TechSaga import get their own codes),
-- by level and subject. Anything still unmatched can be linked under Attendance → Google Meet.
create temporary table m (code text, lvl text, subj text, meet text, course text) on commit drop;
insert into m values
  ('KEng26/1', 'KS3', 'English Language', 'tio-musg-jxi', '864879941208'), ('KLit26/1', 'KS3', 'English Literature', 'ter-ptat-mvy', '875996327064'),
  ('KHis26/1', 'KS3', 'History', null, '870603882553'), ('KMat26/1', 'KS3', 'Maths', 'uzi-xgoe-rnm', '870603407406'), ('KSci26/1', 'KS3', 'Science', 'yvq-qsky-snq', '870604403773'),
  ('PBus26/1', 'Pre-GCSE', 'Business Studies', 'ydy-dksn-bgn', '826123746520'), ('PHis26/1', 'Pre-GCSE', 'History', 'dej-uocg-fhy', '826123467081'),
  ('PGeo26/1', 'Pre-GCSE', 'Geography', null, '826123654810'), ('PLit26/1', 'Pre-GCSE', 'English Literature', 'zpf-pqgj-arr', '875996638737'),
  ('PEng26/1', 'Pre-GCSE', 'English Language', 'per-bfey-kji', '826123296945'), ('PMat26/1', 'Pre-GCSE', 'Maths', 'vji-qyvf-byd', '875998142851'),
  ('PMed26/1', 'Pre-GCSE', 'Media', 'cvc-rwgf-csp', '883036514390'), ('PSci26/1', 'Pre-GCSE', 'Science', 'iqv-ewyv-wep', '875998042654'),
  ('GBio26/1', 'iGCSE', 'Biology', 'fbd-brdn-faq', '876005000913'), ('GEng26/1', 'iGCSE', 'English Language', 'vbr-bhfv-kpk', '826123642309'),
  ('GEng26/2', null, null, null, '826123845177'), ('GLit26/1', 'iGCSE', 'English Literature', 'jom-orjm-isp', '875996368975'),
  ('GHis26/1', 'iGCSE', 'History', 'smu-ekqg-qyf', '826124057701'), ('GBus26/1', 'iGCSE', 'Business Studies', 'kgr-vkvg-hjy', '826123469462'),
  ('GGeo26/1', 'iGCSE', 'Geography', 'whc-vfvu-crb', '876004288795'), ('GMatF26/1', 'iGCSE', 'Maths Foundation', 'wza-iwxb-fbs', '876004337095'),
  ('GMatH26/1', 'iGCSE', 'Maths Higher', 'ncu-oofr-aya', '875995224642'), ('GSci26/1', 'iGCSE', 'Science Double Award', 'fbh-njhs-ckc', '876002656347');

-- by class code
update course_groups g set meet_url = coalesce('https://meet.google.com/' || m.meet, g.meet_url), google_course_id = coalesce(m.course, g.google_course_id)
from m, schools s where s.id = g.school_id and s.slug = 'ohsoed' and g.code = m.code;

-- otherwise by level and subject (this school year's first class of that course, year 1 only)
update course_groups g set meet_url = coalesce('https://meet.google.com/' || m.meet, g.meet_url), google_course_id = coalesce(m.course, g.google_course_id)
from m, schools s, levels l, subjects sj
where s.id = g.school_id and s.slug = 'ohsoed' and l.id = g.level_id and sj.id = g.subject_id and m.lvl is not null
  and l.name = m.lvl and (lower(sj.name) = lower(m.subj) or (m.subj = 'Science Double Award' and lower(sj.name) like 'science double%'))
  and not exists (select 1 from course_groups x where x.school_id = s.id and x.code = m.code)
  and g.continues_group_id is null
  and g.academic_year_id = (select y.id from academic_years y where y.school_id = s.id and y.ends_on >= current_date order by y.starts_on limit 1)
  and g.id = (select g2.id from course_groups g2 where g2.school_id = s.id and g2.level_id = g.level_id and g2.subject_id = g.subject_id and g2.academic_year_id = g.academic_year_id
              and g2.continues_group_id is null and g2.status <> 'closed' order by g2.code limit 1);

-- GCSE Science Double and GCSE Maths Foundation came across from TechSaga without lesson times (so no lessons, and nothing for
-- attendance to attach to). Add their weekly times, as used in Google Meet since September, with their teachers; skipped if a
-- class already has times, or if a time would double-book the teacher.
do $$
declare r record; gid uuid; tid uuid; yid uuid; sid uuid; mins int;
begin
  select id into sid from schools where slug = 'ohsoed';
  if sid is null then return; end if;
  select id into yid from academic_years where school_id = sid and ends_on >= current_date order by starts_on limit 1;
  for r in select * from (values ('fbh-njhs-ckc', 'Rachel', 2, '11:30'), ('fbh-njhs-ckc', 'Rachel', 5, '13:00'),
                                 ('wza-iwxb-fbs', 'Becky', 1, '11:30'), ('wza-iwxb-fbs', 'Becky', 4, '11:30')) v(meet, teacher, wd, at) loop
    select g.id, g.lesson_minutes into gid, mins from course_groups g where g.school_id = sid and g.academic_year_id = yid and g.meet_url = 'https://meet.google.com/' || r.meet limit 1;
    if gid is null then continue; end if;
    if exists (select 1 from lesson_slots s where s.group_id = gid and not (s.weekday = r.wd and s.starts_at = r.at::time)) and
       not exists (select 1 from lesson_slots s where s.group_id = gid and s.weekday = r.wd and s.starts_at = r.at::time) and
       (select count(*) from lesson_slots s where s.group_id = gid) >= 2 then continue; end if;
    if exists (select 1 from lesson_slots s where s.group_id = gid and s.weekday = r.wd and s.starts_at = r.at::time) then continue; end if;
    select t.id into tid from teachers t join users u on u.id = t.user_id where t.school_id = sid and u.name ilike r.teacher || '%' and t.archived_at is null limit 1;
    update course_groups set teacher_id = coalesce(teacher_id, tid), status = case when status = 'hidden' then 'open'::group_status else status end where id = gid;
    begin
      insert into lesson_slots (school_id, academic_year_id, group_id, teacher_id, weekday, starts_at, ends_at)
        values (sid, yid, gid, coalesce((select teacher_id from course_groups where id = gid), tid), r.wd, r.at::time, r.at::time + make_interval(mins => coalesce(mins, 45)));
    exception when exclusion_violation then raise notice 'skipped % % for %: teacher already teaching', r.wd, r.at, r.meet;
    end;
  end loop;
end $$;
