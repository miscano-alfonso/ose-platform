-- 27 Nov (Alfonso): Marking.
--  * Work from an earlier term that's still not marked is archived: it leaves the to-mark list (and stops reminders) and
--    is kept under "Archived" on the Marking page. Earlier term = the title names an earlier term ("Term 1: Lesson 6" in
--    Term 2), or (no term in the title) it was due before this term started; either way once its 7 days have passed.
--  * A teacher can resolve a piece of work they've chosen not to mark: it leaves the list too (and can be put back).
alter table classroom_coursework add column if not exists resolved_at timestamptz;
alter table classroom_coursework add column if not exists resolved_by uuid references users(id) on delete set null;
alter table classroom_coursework add column if not exists resolved_note text;

create or replace function coursework_earlier_term(p_title text, p_at timestamptz) returns boolean language sql stable as $$
  with cur as (select t.number, t.starts_on, y.starts_on as year_start from terms t join academic_years y on y.id = t.academic_year_id
               where t.starts_on <= current_date order by t.starts_on desc limit 1)
  select coalesce((select p_at is not null and p_at::date + 7 < current_date and (
      p_at::date < cur.year_start
      or (title_term(p_title) is not null and title_term(p_title) < cur.number)
      or (title_term(p_title) is null and p_at::date < cur.starts_on)) from cur), false)
$$;
grant execute on function coursework_earlier_term(text, timestamptz) to app_user;
