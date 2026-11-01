-- Tasters (1 Nov): booked by registered parents for one of their children, so the request links to the student;
-- attendance is worked out from Google Meet (who joined) instead of being marked by the teacher.
alter table taster_requests add column if not exists student_id uuid references students(id) on delete set null;

-- After a taster lesson has ended (and Meet's attendance has had time to arrive), mark each booked taster as came or
-- didn't come: came if the child's Google account (or their student record) joined the lesson's Meet for 5 minutes or more.
create or replace function settle_tasters() returns integer language plpgsql as $$
declare n integer;
begin
  with done as (
    select b.id, exists (
        select 1 from meet_sessions ms
        where ms.lesson_event_id = b.lesson_event_id and not coalesce(ms.ignored, false)
          and (lower(ms.participant_email::text) = lower(r.child_email::text) or (r.student_id is not null and ms.student_id = r.student_id))
          and coalesce(ms.left_at, ms.joined_at + interval '1 hour') - ms.joined_at >= interval '5 minutes') as came
    from taster_bookings b join taster_requests r on r.id = b.request_id join lesson_events e on e.id = b.lesson_event_id
      join lesson_slots s on s.id = e.slot_id join schools sc on sc.id = b.school_id
    where b.status = 'booked' and e.status <> 'cancelled'
      and (e.lesson_date + s.ends_at) at time zone sc.timezone < now() - interval '90 minutes')
  update taster_bookings b set status = case when d.came then 'attended' else 'no_show' end::taster_status from done d where d.id = b.id;
  get diagnostics n = row_count;
  return n;
end $$;
