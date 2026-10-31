-- Each student's own Classroom submission link (31 Oct): the teacher's dashboard links straight to a student's work,
-- where Classroom keeps the private comments (the Classroom API does not give access to those).
alter table classroom_submissions add column if not exists link text;
