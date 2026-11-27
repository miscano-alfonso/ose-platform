-- 27 Nov (Alfonso): on the report-writing page, each assessment links to Google Classroom (the student's hand-in, or the
-- assessment itself), so the teacher can open it and mark it. Adds a link column, so the function is made again.
drop function if exists report_assessment_parts(uuid);
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
      when s.state in ('turned_in', 'returned') then 'handed_in'
      else 'set' end,
    case when s.points is not null and w.max_points is not null then round(s.points / w.max_points * 100) end,
    w.title,
    coalesce(s.link, w.link)   -- the student's hand-in in Classroom, or the assessment itself
  from k cross join e left join w on w.n is not distinct from k.n left join classroom_submissions s on s.coursework_id = w.id and s.student_id = e.student_id
  order by k.n;
$$;
grant execute on function report_assessment_parts(uuid) to app_user;
