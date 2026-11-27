-- 27 Nov (Alfonso): a two-term report round can use the PREVIOUS term's assessment, THIS term's, or both, chosen per round
-- (Reports → the round → Assessments). The Term 2 round uses the Term 1 assessment when Term 2's won't be marked in time.
-- A report can be submitted once every chosen assessment is marked (or the teacher gives a reason there isn't one).
alter table report_cycles add column if not exists assess_prev boolean not null default false;
alter table report_cycles add column if not exists assess_this boolean not null default true;

-- each chosen assessment for a report line: one row per term (or one "End-of-term" row for a round without a term)
create or replace function report_assessment_parts(p_entry uuid)
returns table (term_no int, label text, state text, pct numeric, title text) language sql stable as $$
  with e as (select r.*, c.marks_from, c.comments_due, c.assessment_match, c.assess_prev, c.assess_this, c.academic_year_id, t.number as term_no
             from report_entries r join report_cycles c on c.id = r.cycle_id left join terms t on t.id = c.term_id where r.id = p_entry),
  k as (   -- the terms to look in, with their dates
    select tt.number as n, tt.name, tt.starts_on, tt.ends_on from e join terms tt on tt.academic_year_id = e.academic_year_id
      where e.term_no is not null and ((e.assess_this and tt.number = e.term_no) or (e.assess_prev and tt.number = e.term_no - 1))
    union all
    select null::int, null::text, e.marks_from, e.comments_due from e where e.term_no is null),
  w as (select distinct on (k.n) k.n, k.name, cw.id, cw.title, cw.max_points
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
    w.title
  from k cross join e left join w on w.n is not distinct from k.n left join classroom_submissions s on s.coursework_id = w.id and s.student_id = e.student_id
  order by k.n;
$$;
grant execute on function report_assessment_parts(uuid) to app_user;

-- the line's assessments together: the least-done state (a report waits for every chosen assessment), the average mark
create or replace function report_assessment(p_entry uuid)
returns table (state text, pct numeric, title text) language sql stable as $$
  with p as (select * from report_assessment_parts(p_entry))
  select case when not exists (select 1 from p) then 'not_set'
              when bool_or(p.state = 'unknown') then 'unknown'
              when bool_or(p.state = 'not_set') then 'not_set'
              when bool_or(p.state = 'set') then 'set'
              when bool_or(p.state = 'handed_in') then 'handed_in'
              else 'marked' end,
    round(avg(p.pct)), string_agg(p.title, ' + ' order by p.term_no)
  from p;
$$;
