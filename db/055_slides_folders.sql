-- Each class's lesson-slides folder in Google Drive (folder id), set by its teacher. The school's recordings account
-- (ose@) reads it; students never get the folder: they get the slides when the teacher's Classroom post goes out.
alter table course_groups add column if not exists slides_folder text check (slides_folder is null or slides_folder ~ '^[A-Za-z0-9_-]{10,100}$');
