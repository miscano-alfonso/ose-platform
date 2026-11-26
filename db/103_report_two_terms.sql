-- 26 Nov 2026: reports with teacher comments come every two terms (Alfonso): the Term 2 report covers Terms 1 and 2, the
-- Term 4 report Terms 3 and 4, the Term 6 report Terms 5 and 6. So a round tied to an even term uses work from that term
-- and the one before (marks average, suggested grades); its end-of-term assessment is still its own term's (102).

-- the terms a round tied to term n covers: n-1 and n for an even term, n alone otherwise
create or replace function round_terms(p_term_no int) returns int[] language sql immutable as $$
  select case when p_term_no is null then null when p_term_no % 2 = 0 then array[p_term_no - 1, p_term_no] else array[p_term_no] end
$$;
-- true when the work names a term outside the round's terms ("Term 1 …" is inside a Term 2 round, "Term 3 …" isn't)
create or replace function outside_round(p_title text, p_term_no int) returns boolean language sql immutable as $$
  select p_term_no is not null and title_term(p_title) is not null and not (title_term(p_title) = any(round_terms(p_term_no)))
$$;
grant execute on function round_terms(int), outside_round(text, int) to app_user;

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
      and not outside_round(cw.title, t.number)
  ) m on true;

-- rounds not yet published that are tied to an even term and whose marks start with that term: start them with the
-- term before instead (the Term 2 round then counts work from the start of Term 1)
update report_cycles c set marks_from = prev.starts_on
  from terms t, terms prev
  where t.id = c.term_id and t.number % 2 = 0 and c.status <> 'published'
    and prev.academic_year_id = t.academic_year_id and prev.number = t.number - 1
    and c.marks_from >= t.starts_on - 14 and prev.starts_on < c.marks_from;
