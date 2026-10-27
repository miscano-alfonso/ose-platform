-- Reports: each round has an end-of-term assessment set in Google Classroom (found by a word in its title, "assessment" by default).
-- A report can be submitted once that assessment is marked, or once the teacher says why there isn't one (e.g. absent).
alter table report_cycles add column if not exists assessment_match text not null default 'assessment';
alter table report_entries add column if not exists no_assessment text;

-- The assessment for a report line: the newest matching piece of Classroom work in that class during the round, and the student's hand-in.
create or replace function report_assessment(p_entry uuid)
returns table (state text, pct numeric, title text) language sql stable as $$
  with e as (select r.*, c.marks_from, c.comments_due, c.assessment_match from report_entries r join report_cycles c on c.id = r.cycle_id where r.id = p_entry),
  w as (select cw.* from classroom_coursework cw, e where cw.group_id = e.group_id
          and cw.title ilike '%' || e.assessment_match || '%'
          and coalesce(cw.due_at::date, cw.created_at::date) between e.marks_from - 14 and e.comments_due + 7
        order by coalesce(cw.due_at, cw.created_at) desc limit 1)
  select case
      when not exists (select 1 from classroom_coursework cw, e where cw.group_id = e.group_id) then 'unknown'
      when not exists (select 1 from w) then 'not_set'
      when s.state = 'returned' and s.points is not null then 'marked'
      when s.state in ('turned_in', 'returned') then 'handed_in'
      else 'set' end,
    case when s.points is not null and w.max_points is not null then round(s.points / w.max_points * 100) end,
    w.title
  from e left join w on true left join classroom_submissions s on s.coursework_id = w.id and s.student_id = e.student_id;
$$;
