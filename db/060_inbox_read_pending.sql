-- Read/unread changed in the site but not yet copied to Gmail (the inbox hasn't been given permission to change it yet,
-- or Gmail couldn't be reached). Such emails keep the site's state until it's copied, instead of flipping back.
alter table inbox_messages add column if not exists read_pending boolean not null default false;
