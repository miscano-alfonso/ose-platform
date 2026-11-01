-- 2 Nov: 1:1 work from Google Classroom. Each 1:1 student has their own Classroom course with their teacher; linking it here
-- (Admin → 1:1 tutoring setup → 1:1 Classrooms) brings its work, hand-ins and marks onto the dashboards (teacher, student,
-- parent), read-only like classes: marking and comments stay in Classroom, and each piece of work links into Classroom.
create table if not exists one_courses (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references schools(id) on delete cascade,
  student_id       uuid not null references students(id) on delete cascade,
  teacher_id       uuid not null references teachers(id) on delete cascade,
  subject_id       uuid references subjects(id) on delete set null,
  google_course_id text not null check (google_course_id ~ '^[0-9]{5,20}$'),
  name             text,                       -- the course's name in Classroom
  link             text,                       -- the course in Classroom
  created_at       timestamptz not null default now(),
  unique (school_id, google_course_id)
);
create index if not exists one_courses_teacher on one_courses (teacher_id);
create index if not exists one_courses_student on one_courses (student_id);
grant select, insert, update, delete on one_courses to app_user;
alter table one_courses enable row level security;
drop policy if exists school_isolation on one_courses;
create policy school_isolation on one_courses to app_user using (school_id = current_school()) with check (school_id = current_school());

-- work in a 1:1's course is kept with the class work, against the 1:1 instead of a class
alter table classroom_coursework alter column group_id drop not null;
alter table classroom_coursework add column if not exists one_course_id uuid references one_courses(id) on delete cascade;
alter table classroom_coursework drop constraint if exists classroom_coursework_owner;
alter table classroom_coursework add constraint classroom_coursework_owner check (group_id is not null or one_course_id is not null);

-- the parent/student view gains the 1:1 and the student's own submission link (new columns go last)
create or replace view student_assignments with (security_invoker = true) as
  select s.id, s.school_id, s.student_id, c.group_id, c.title, c.due_at, c.link, c.max_points, s.points, s.state, s.late, s.turned_in_at,
         case when s.state in ('turned_in', 'returned') then 'submitted'
              when c.due_at is not null and c.due_at < now() then 'overdue'
              else 'due' end as parent_status,
         c.one_course_id, s.link as submission_link
  from classroom_submissions s join classroom_coursework c on c.id = s.coursework_id;
