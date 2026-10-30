-- Course bookings from the website basket: an enquiry of kind 'booking' (the courses, prices and payment choice in the message) for the office to confirm
-- and send a payment link, until online card payment is switched on.
alter table enquiries drop constraint if exists enquiries_kind_check;
alter table enquiries add constraint enquiries_kind_check check (kind in ('contact', 'taster', 'marking', 'workshop', 'booking'));
