-- 27 Nov (Alfonso: "only times should show are the ones the teachers add to their availability"). The first set-up (db/003)
-- gave OH-SO ED's teachers example 1:1 hours from 1 Sept 2026 that no teacher chose: Rachel Mon 16:00–18:00 and Wed
-- 15:00–17:00, Becky Tue 15:30–18:00 and Thu 16:00–18:00, Leanne Wed 16:00–18:00, Jade Thu 16:00–18:00. They are ended
-- (valid_to yesterday, as when hours are removed), so the record stays; hours teachers added, and booked 1:1s, are untouched.
update tutoring_availability a set valid_to = current_date - 1
from teachers t, users u, schools s
where t.id = a.teacher_id and u.id = t.user_id and s.id = a.school_id and s.slug = 'ohsoed'
  and a.valid_from = '2026-09-01' and (a.valid_to is null or a.valid_to >= current_date)
  and (split_part(u.name, ' ', 1), a.weekday, to_char(a.starts_at, 'HH24:MI'), to_char(a.ends_at, 'HH24:MI')) in (
    ('Rachel', 1, '16:00', '18:00'), ('Rachel', 3, '15:00', '17:00'),
    ('Becky', 2, '15:30', '18:00'), ('Becky', 4, '16:00', '18:00'),
    ('Leanne', 3, '16:00', '18:00'), ('Jade', 4, '16:00', '18:00'));
