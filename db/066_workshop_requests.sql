-- Workshop booking requests from the website's workshop pages: an enquiry of kind 'workshop'. The child's name goes in child_name,
-- the workshop's title in subject, and the year group (levels) and whether they already study with us (heard_about) in the usual columns.
alter table enquiries drop constraint if exists enquiries_kind_check;
alter table enquiries add constraint enquiries_kind_check check (kind in ('contact', 'taster', 'marking', 'workshop'));
