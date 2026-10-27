-- Google Classroom invitations sent by the site (from the recordings account, ose@):
-- which address each invitation went to (so a changed address gets a fresh invitation)
-- and when a student was taken out of a class after their place ended.
alter table classroom_memberships add column if not exists invited_email citext;
alter table classroom_memberships add column if not exists removed_at timestamptz;
