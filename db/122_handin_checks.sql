-- 27 Nov (Alfonso: "message students if their work is empty ... and to re-submit work if a photo is not the right way
-- round"): the files attached to each hand-in (from Classroom), and the check of its photos: ok, sideways, upside_down
-- or unclear (null = not checked yet; files changed = checked again).
alter table classroom_submissions add column if not exists files jsonb;
alter table classroom_submissions add column if not exists photo_check text check (photo_check in ('ok', 'sideways', 'upside_down', 'unclear'));
create or replace view student_assignments with (security_invoker = true) as
 SELECT s.id, s.school_id, s.student_id, c.group_id, c.title, c.due_at, c.link, c.max_points, s.points, s.state, s.late, s.turned_in_at,
    CASE
      WHEN s.state = 'turned_in'::submission_state OR (s.state = 'returned'::submission_state AND (s.points IS NOT NULL OR c.max_points IS NULL)) THEN 'submitted'::text
      WHEN c.due_at IS NOT NULL AND c.due_at < now() THEN 'overdue'::text
      ELSE 'due'::text
    END AS parent_status,
    c.one_course_id, s.link AS submission_link, c.description, c.materials, c.posted_at,
    (s.state = 'returned'::submission_state AND s.points IS NULL AND c.max_points IS NOT NULL) AS sent_back,
    s.content, s.photo_check
   FROM classroom_submissions s JOIN classroom_coursework c ON c.id = s.coursework_id;
