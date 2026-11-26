-- 26 Nov 2026 (Alfonso): one taster lesson per course for each child, unless they missed the one they booked (no-show): then
-- they can book another. Was: one per class, and a missed taster still counted (so the "book another date" email couldn't work).
-- Also: when a trial class is opened for booking, remember when (trial_ended_at), so the taster families can be emailed.
alter table course_groups add column if not exists trial_ended_at timestamptz;

create or replace function taster_guard() returns trigger language plpgsql as $$
declare ev lesson_events; g course_groups; cap int; req taster_requests;
begin
  select * into ev from lesson_events where id = new.lesson_event_id;
  select * into g from course_groups where id = ev.group_id;
  if g.status not in ('open', 'priority') or ev.status <> 'scheduled' or ev.lesson_date <= current_date then
    raise exception 'tasters can only be booked for upcoming lessons of an open class';
  end if;
  select taster_places_per_lesson into cap from schools where id = new.school_id;
  if (select count(*) from taster_bookings t where t.lesson_event_id = ev.id and t.status <> 'cancelled') >= cap then
    raise exception 'no taster places left for this lesson';
  end if;
  select * into req from taster_requests where id = new.request_id;
  if exists (select 1 from taster_bookings t join lesson_events e2 on e2.id = t.lesson_event_id join course_groups g2 on g2.id = e2.group_id
               join taster_requests r on r.id = t.request_id
             where g2.academic_year_id = g.academic_year_id and g2.level_id = g.level_id and g2.subject_id = g.subject_id
               and t.status not in ('cancelled', 'no_show')
               and (r.child_email = req.child_email or (req.student_id is not null and r.student_id = req.student_id))) then
    raise exception 'this child has already had a taster for this class';
  end if;
  return new;
end $$;
