-- 28 Nov (Alfonso): a report a teacher had started for a child who has since left the class is archived automatically
-- (kept here, out of the round), rather than left in the round or deleted. If the child rejoins the class while the round
-- is still open, the report comes back as it was.
create table if not exists report_entries_archive (like report_entries including defaults);
alter table report_entries_archive add column if not exists archived_at timestamptz not null default now();
create index if not exists report_entries_archive_cycle on report_entries_archive (cycle_id, student_id, group_id);
grant select, insert, update, delete on report_entries_archive to app_user;
alter table report_entries_archive enable row level security;
drop policy if exists school_isolation on report_entries_archive;
create policy school_isolation on report_entries_archive to app_user using (school_id = current_school()) with check (school_id = current_school());
