-- 26 Nov 2026 (Alfonso): a class can be marked as a trial / taster class (e.g. a Classroom set up to try a new subject).
-- Everyone in its Google Classroom is treated as trying it: never listed under "Classroom accounts to match".
alter table course_groups add column if not exists trial boolean not null default false;
