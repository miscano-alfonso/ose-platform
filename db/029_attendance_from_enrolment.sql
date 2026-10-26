-- Attendance only counts lessons from the day a child joined the class: a child who started in October isn't marked absent for
-- September. (Uses the enrolment's start date, or the day it was booked.)
create or replace function compute_attendance(p_event uuid) returns integer language plpgsql as $$
declare ev lesson_events; cfg attendance_settings; tz text; st_at timestamptz; en_at timestamptz; n integer;
begin
  select * into ev from lesson_events where id = p_event;
  select * into cfg from attendance_settings where school_id = ev.school_id;
  if cfg is null then cfg := row(ev.school_id, 5, 5, 5, 'attendlist')::attendance_settings; end if;
  select timezone into tz from schools where id = ev.school_id;
  select (ev.lesson_date + s.starts_at) at time zone tz, (ev.lesson_date + s.ends_at) at time zone tz into st_at, en_at
    from lesson_slots s where s.id = ev.slot_id;
  insert into attendance_marks (school_id, lesson_event_id, student_id, mark, source, minutes_present, joined_at, left_at, left_early)
  select ev.school_id, ev.id, e.student_id,
         case when coalesce(x.mins, 0) < cfg.min_minutes then 'absent'
              when x.first_join > st_at + make_interval(mins => cfg.late_grace_minutes) then 'late' else 'present' end::attendance_mark,
         'meet', coalesce(x.mins, 0), x.first_join, x.last_leave,
         coalesce(x.mins, 0) >= cfg.min_minutes and x.last_leave < en_at - make_interval(mins => cfg.early_grace_minutes)
  from enrolments e
  left join lateral (
    select min(ms.joined_at) as first_join, max(coalesce(ms.left_at, en_at)) as last_leave,
           sum(greatest(0, extract(epoch from (least(coalesce(ms.left_at, en_at), en_at) - greatest(ms.joined_at, st_at - interval '15 minutes'))) / 60))::int as mins
    from meet_sessions ms where ms.lesson_event_id = ev.id and ms.student_id = e.student_id) x on true
  where e.group_id = ev.group_id and e.status = 'active' and not e.is_taster
    and coalesce(e.starts_on, e.enrolled_at::date) <= ev.lesson_date
  on conflict (lesson_event_id, student_id) do update
    set mark = excluded.mark, minutes_present = excluded.minutes_present, joined_at = excluded.joined_at,
        left_at = excluded.left_at, left_early = excluded.left_early, updated_at = now()
    where attendance_marks.source = 'meet' and attendance_marks.mark <> 'approved_absence';
  get diagnostics n = row_count; return n;
end $$;

-- remove marks already made for lessons before a child joined the class (unless the child actually came)
delete from attendance_marks m using lesson_events ev, enrolments e
where ev.id = m.lesson_event_id and e.group_id = ev.group_id and e.student_id = m.student_id and e.status = 'active'
  and m.source = 'meet' and m.mark = 'absent' and coalesce(e.starts_on, e.enrolled_at::date) > ev.lesson_date;
