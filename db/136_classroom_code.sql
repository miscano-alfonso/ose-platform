-- 28 Nov: Admin → Classes → Connect Classroom also keeps the Classroom's class code, for its invitation link.
alter table course_groups add column if not exists classroom_code text;
