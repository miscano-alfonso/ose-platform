-- 26 Nov 2026: a report round only uses work from its own term. Alfonso: the Term 2 report was showing "Term 1 Lesson 12 -
-- ASSESSMENT" (due 2 Nov, the first day of Term 2's marks window, and the window also looked 14 days back) as the
-- end-of-term assessment; it should wait for the Term 2 assessment. Now Classroom work whose title names a different term
-- ("Term 1 …", "T1 …") never counts for a round tied to another term: not as its assessment, not in its marks average.

-- the term number a Classroom title names ("Term 1: Lesson 12", "T2 L6", "Term 2 - Lesson 2"), or null
create or replace function title_term(p_title text) returns int language sql immutable as $$
  select nullif(substring(lower(coalesce(p_title, '')) from '\m(?:term|t)\s*-?\s*0*([1-6])(?![0-9])'), '')::int
$$;
-- true when the work belongs to another term than the round's (rounds without a term accept everything)
create or replace function other_term_work(p_title text, p_term_no int) returns boolean language sql immutable as $$
  select p_term_no is not null and title_term(p_title) is not null and title_term(p_title) <> p_term_no
$$;
grant execute on function title_term(text), other_term_work(text, int) to app_user;

create or replace function report_assessment(p_entry uuid)
returns table (state text, pct numeric, title text) language sql stable as $$
  with e as (select r.*, c.marks_from, c.comments_due, c.assessment_match, t.number as term_no
             from report_entries r join report_cycles c on c.id = r.cycle_id left join terms t on t.id = c.term_id where r.id = p_entry),
  w as (select cw.* from classroom_coursework cw, e where cw.group_id = e.group_id
          and cw.title ilike '%' || e.assessment_match || '%'
          and not other_term_work(cw.title, e.term_no)
          and coalesce(cw.due_at::date, cw.created_at::date) between e.marks_from - 14 and e.comments_due + 7
        order by (title_term(cw.title) = e.term_no) desc nulls last, coalesce(cw.due_at, cw.created_at) desc limit 1)
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

create or replace view report_lines with (security_invoker = true) as
  select r.id, r.school_id, r.cycle_id, r.student_id, r.group_id, l.name as level, sj.name as subject,
         m.avg_pct, m.marked,
         coalesce(r.progress_override, progress_score(r.school_id, m.avg_pct)) as progress,
         r.effort, r.working_grade, r.predicted_grade, r.comment, r.status
  from report_entries r
  join report_cycles c on c.id = r.cycle_id
  left join terms t on t.id = c.term_id
  join course_groups g on g.id = r.group_id
  join levels l on l.id = g.level_id
  join subjects sj on sj.id = g.subject_id
  left join lateral (
    select round(avg(cs.points / cw.max_points * 100), 1) as avg_pct, count(*)::int as marked
    from classroom_submissions cs join classroom_coursework cw on cw.id = cs.coursework_id
    where cw.group_id = r.group_id and cs.student_id = r.student_id and cs.state = 'returned'
      and cs.points is not null and cw.max_points is not null and cs.graded_at::date between c.marks_from and c.marks_to
      and not other_term_work(cw.title, t.number)
  ) m on true;
