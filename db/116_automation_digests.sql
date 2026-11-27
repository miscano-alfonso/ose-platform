-- 27 Nov (Alfonso): new family automations (work due / overdue, attendance this week, reward points). The work and points
-- emails list several things at once; each thing listed is remembered (status 'included') so it's only ever sent once.
alter table automation_sends drop constraint if exists automation_sends_status_check;
alter table automation_sends add constraint automation_sends_status_check check (status in ('sent', 'scheduled', 'failed', 'cancelled', 'held', 'included'));
