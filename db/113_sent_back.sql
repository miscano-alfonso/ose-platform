-- 27 Nov (Alfonso): Ellie's Term 1 assessment showed "Handed in" on her report, but Classroom says Missing: the teacher had
-- returned it WITHOUT a mark and asked her to resubmit. In Classroom, work returned without a mark (on a piece that has
-- marks) counts as not handed in. Now it's "sent back" everywhere: the report's assessment ("Sent back to redo"), the
-- parents' Assignments (due / overdue, marked "Sent back to redo"), and it's not counted as handed in.
create or replace function report_assessment_parts(p_entry uuid)
returns table (term_no int, label text, state text, pct numeric, title text, link text) language sql stable as $$
  with e as (select r.*, c.marks_from, c.comments_due, c.assessment_match, c.assess_prev, c.assess_this, c.academic_year_id, t.number as term_no
             from report_entries r join report_cycles c on c.id = r.cycle_id left join terms t on t.id = c.term_id where r.id = p_entry),
  k as (   -- the terms to look in, with their dates
    select tt.number as n, tt.name, tt.starts_on, tt.ends_on from e join terms tt on tt.academic_year_id = e.academic_year_id
      where e.term_no is not null and ((e.assess_this and tt.number = e.term_no) or (e.assess_prev and tt.number = e.term_no - 1))
    union all
    select null::int, null::text, e.marks_from, e.comments_due from e where e.term_no is null),
  w as (select distinct on (k.n) k.n, k.name, cw.id, cw.title, cw.max_points, cw.link
        from k, e, classroom_coursework cw
        where cw.group_id = e.group_id and cw.title ilike '%' || e.assessment_match || '%'
          and (case when k.n is null then coalesce(cw.due_at::date, cw.created_at::date) between k.starts_on - 14 and k.ends_on + 7
                    else title_term(cw.title) = k.n
                      or (title_term(cw.title) is null and coalesce(cw.due_at::date, cw.created_at::date) between k.starts_on - 7 and k.ends_on + 7) end)
        order by k.n, (title_term(cw.title) = k.n) desc nulls last, coalesce(cw.due_at, cw.created_at) desc)
  select k.n, coalesce(k.name || ' assessment', 'End-of-term assessment'),
    case
      when not exists (select 1 from classroom_coursework cw, e where cw.group_id = e.group_id) then 'unknown'
      when w.id is null then 'not_set'
      when s.state = 'returned' and s.points is not null then 'marked'
      when s.state = 'returned' and w.max_points is not null then 'sent_back'   -- returned without a mark: sent back to redo
      when s.state in ('turned_in', 'returned') then 'handed_in'
      else 'set' end,
    case when s.points is not null and w.max_points is not null then round(s.points / w.max_points * 100) end,
    w.title,
    coalesce(s.link, w.link)   -- the student's hand-in in Classroom, or the assessment itself
  from k cross join e left join w on w.n is not distinct from k.n left join classroom_submissions s on s.coursework_id = w.id and s.student_id = e.student_id
  order by k.n;
$$;

create or replace function report_assessment(p_entry uuid)
returns table (state text, pct numeric, title text) language sql stable as $$
  with p as (select * from report_assessment_parts(p_entry))
  select case when not exists (select 1 from p) then 'not_set'
              when bool_or(p.state = 'unknown') then 'unknown'
              when bool_or(p.state = 'not_set') then 'not_set'
              when bool_or(p.state = 'set') then 'set'
              when bool_or(p.state = 'sent_back') then 'sent_back'
              when bool_or(p.state = 'handed_in') then 'handed_in'
              else 'marked' end,
    round(avg(p.pct)), string_agg(p.title, ' + ' order by p.term_no)
  from p;
$$;

create or replace view student_assignments with (security_invoker = true) as
  select s.id, s.school_id, s.student_id, c.group_id, c.title, c.due_at, c.link, c.max_points, s.points, s.state, s.late, s.turned_in_at,
         case when s.state = 'turned_in' or (s.state = 'returned' and (s.points is not null or c.max_points is null)) then 'submitted'
              when c.due_at is not null and c.due_at < now() then 'overdue'
              else 'due' end as parent_status,
         c.one_course_id, s.link as submission_link,
         c.description, c.materials, c.posted_at,
         (s.state = 'returned' and s.points is null and c.max_points is not null) as sent_back
  from classroom_submissions s join classroom_coursework c on c.id = s.coursework_id;
