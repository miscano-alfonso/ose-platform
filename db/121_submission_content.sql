-- 27 Nov (Alfonso: "can you determine if there is work in a student's submission? Najmi has handed in work, but there is
-- no attachment"): what came with each hand-in, from Google Classroom: files/links attached, an answer (question posts),
-- only the copy of the teacher's template that Classroom makes for every student (can't tell if it was written in), or nothing.
alter table classroom_submissions add column if not exists content text check (content in ('files', 'answer', 'template_only', 'none'));
create or replace view student_assignments with (security_invoker = true) as
 SELECT s.id, s.school_id, s.student_id, c.group_id, c.title, c.due_at, c.link, c.max_points, s.points, s.state, s.late, s.turned_in_at,
    CASE
      WHEN s.state = 'turned_in'::submission_state OR (s.state = 'returned'::submission_state AND (s.points IS NOT NULL OR c.max_points IS NULL)) THEN 'submitted'::text
      WHEN c.due_at IS NOT NULL AND c.due_at < now() THEN 'overdue'::text
      ELSE 'due'::text
    END AS parent_status,
    c.one_course_id, s.link AS submission_link, c.description, c.materials, c.posted_at,
    (s.state = 'returned'::submission_state AND s.points IS NULL AND c.max_points IS NOT NULL) AS sent_back,
    s.content
   FROM classroom_submissions s JOIN classroom_coursework c ON c.id = s.coursework_id;
