-- 1:1s get their own Google Meet (1 Nov): a Google Calendar event made by the recordings account (ose@) when a 1:1 is
-- booked, inviting the teacher and the child. The link shows on the teacher's My day, the child's and parent's dashboards.
alter table tutoring_bookings add column if not exists meet_url text;
alter table tutoring_bookings add column if not exists calendar_event_id text;
alter table tutoring_bookings add column if not exists calendar_guests text[];   -- who the event invites (only allowed addresses while test mode is on)
