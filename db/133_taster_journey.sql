-- 28 Nov: each taster's journey, worked out from what the family did after the lesson. Read by Admin → Tasters, the admin
-- home and the automations (the final follow-up goes only to families who haven't done any of these yet):
--   enrolled_at  the child (matched by student record, Google email, or the parent's email plus first name) was booked onto
--                any course after the taster was booked; enrolled_in names the course(s)
--   rebooked_at  the same family booked another taster for the same child afterwards
--   waitlist_at  they joined a waiting list (from this taster's link, or with the parent's email, afterwards)
--   replied_at   an email from the parent or the child reached the school's inbox after the lesson
create or replace view taster_journey with (security_invoker = true) as
select b.id, b.school_id,
  ((e.lesson_date + s.starts_at) at time zone sc.timezone) as starts,
  ((e.lesson_date + s.ends_at) at time zone sc.timezone) as ends,
  en.enrolled_at, en.enrolled_in,
  (select min(b2.created_at) from taster_bookings b2 join taster_requests r2 on r2.id = b2.request_id
    where b2.school_id = b.school_id and b2.id <> b.id and b2.created_at > b.created_at and b2.status <> 'cancelled'
      and lower(r2.parent_email::text) = lower(r.parent_email::text)
      and lower(split_part(trim(r2.child_name), ' ', 1)) = lower(split_part(trim(r.child_name), ' ', 1))) as rebooked_at,
  (select min(w.created_at) from waitlist_entries w
    where w.school_id = b.school_id and (w.taster_booking_id = b.id or (lower(w.email::text) = lower(r.parent_email::text) and w.created_at > b.created_at))) as waitlist_at,
  (select min(m.received_at) from inbox_messages m
    where m.school_id = b.school_id and lower(m.from_email::text) in (lower(r.parent_email::text), lower(r.child_email::text))
      and m.received_at > ((e.lesson_date + s.ends_at) at time zone sc.timezone)) as replied_at
from taster_bookings b
  join taster_requests r on r.id = b.request_id
  join lesson_events e on e.id = b.lesson_event_id
  join lesson_slots s on s.id = e.slot_id
  join schools sc on sc.id = b.school_id
  left join lateral (
    select min(x.enrolled_at) as enrolled_at, string_agg(distinct l.name || ' ' || sj.name, ', ') as enrolled_in
    from enrolments x join students st on st.id = x.student_id join parents p on p.id = st.parent_id
      join course_groups g on g.id = x.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
    where x.school_id = b.school_id and not x.is_taster and x.status in ('pending', 'active', 'completed') and x.enrolled_at >= b.created_at
      and (st.id = r.student_id or lower(st.email::text) = lower(r.child_email::text)
        or (lower(p.email::text) = lower(r.parent_email::text) and lower(st.first_name) = lower(split_part(trim(r.child_name), ' ', 1))))
  ) en on true;

grant select on taster_journey to app_user;
