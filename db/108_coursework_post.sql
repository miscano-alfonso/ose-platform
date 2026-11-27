-- 27 Nov (Alfonso): parents can't open Google Classroom (they aren't signed in as their child), so the platform keeps the
-- teacher's post for each piece of work: its instructions, what's attached, and when it was posted. Parents see it by
-- opening the piece of work on Assignments.
alter table classroom_coursework add column if not exists description text;
alter table classroom_coursework add column if not exists materials jsonb not null default '[]';   -- [{ kind, title, url }]
alter table classroom_coursework add column if not exists posted_at timestamptz;

create or replace view student_assignments with (security_invoker = true) as
  select s.id, s.school_id, s.student_id, c.group_id, c.title, c.due_at, c.link, c.max_points, s.points, s.state, s.late, s.turned_in_at,
         case when s.state in ('turned_in', 'returned') then 'submitted'
              when c.due_at is not null and c.due_at < now() then 'overdue'
              else 'due' end as parent_status,
         c.one_course_id, s.link as submission_link,
         c.description, c.materials, c.posted_at
  from classroom_submissions s join classroom_coursework c on c.id = s.coursework_id;
