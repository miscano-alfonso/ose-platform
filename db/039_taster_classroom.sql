-- Tasters booked on the website get a Google Classroom invitation for each class they try, and are taken out
-- of the Classroom 3 days after the taster lesson (unless they've booked that course by then).
alter table taster_bookings add column if not exists classroom_state text check (classroom_state in ('invited', 'removed'));
alter table taster_bookings add column if not exists google_invitation_id text;
alter table taster_bookings add column if not exists invited_at timestamptz;
alter table taster_bookings add column if not exists removed_at timestamptz;
alter table taster_requests add column if not exists source text not null default 'office' check (source in ('office', 'website'));
