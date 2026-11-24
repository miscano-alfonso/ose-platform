-- 25 Nov: swapping a course charges the new course by its lessons (Alfonso: better not to overcharge than to keep it simple).
-- The new course costs the lessons from the start of the start term to the end of the year × its price per lesson,
-- paid in equal termly instalments over those terms. From Term 1 this is the same as before (the whole year).
create or replace function swap_course(p_enrolment uuid, p_to_group uuid, p_start text default 'current', p_on date default current_date)
returns table (to_enrolment uuid, starts_term text, pay_now_pence integer, refund_now_pence integer, per_term_pence integer)
language plpgsql as $$
#variable_conflict use_column
declare e enrolments; g course_groups; pp price_plans; cur terms; nxt terms; st terms; ratio numeric; net integer; share integer;
        new_id uuid; old_cur instalments; diff integer := 0; taken integer;
        left_ev integer; year_ev integer; v_lessons integer; terms_left integer;
begin
  if p_start not in ('current', 'next') then raise exception 'start must be current or next'; end if;
  select * into e from enrolments where id = p_enrolment for update;
  if e.status <> 'active' or e.notice_given_on is not null then raise exception 'only an active course without a cancellation notice can be swapped'; end if;
  select * into g from course_groups where id = p_to_group;
  if g.id = e.group_id then raise exception 'that is the same class'; end if;
  if g.status not in ('open', 'priority') then raise exception 'that class is not taking bookings'; end if;
  select count(*) into taken from enrolments x where x.group_id = g.id and x.status in ('pending', 'active');
  if group_is_full(g.id) then raise exception 'that class is full'; end if;
  if exists (select 1 from enrolments x where x.student_id = e.student_id and x.group_id = g.id and x.status in ('pending', 'active')) then
    raise exception 'already enrolled in that class'; end if;

  select * into cur from terms where academic_year_id = g.academic_year_id and p_on between starts_on and ends_on;
  select * into nxt from terms where academic_year_id = g.academic_year_id and starts_on > p_on order by starts_on limit 1;
  if p_start = 'current' and cur.id is not null and p_on > cur.ends_on - 7 then
    raise exception 'in the last week of term a swap starts next term';
  end if;
  st := case when p_start = 'current' and cur.id is not null then cur else nxt end;
  if st.id is null then raise exception 'no term left this year to swap into'; end if;

  select * into pp from price_plans where id = g.price_plan_id;
  ratio := case when e.list_price_pence > 0 then e.discount_pence::numeric / e.list_price_pence else 0 end;
  -- 25 Nov: the new course costs its lessons from the start of the start term to the end of the year × its price per
  -- lesson (never more than that), spread equally over those terms; remainder pennies go on the start term
  select count(*) filter (where t.number >= st.number), count(*) into left_ev, year_ev
    from lesson_events ev join terms t on t.id = ev.term_id where ev.group_id = g.id and ev.status <> 'cancelled';
  v_lessons := case when year_ev > 0 then round(pp.lessons * least(1, left_ev::numeric / year_ev))::int
                  else round(pp.lessons * greatest(0, pp.term_count - st.number + 1)::numeric / pp.term_count)::int end;
  terms_left := greatest(1, pp.term_count - st.number + 1);
  net := pp.cost_per_lesson_pence * v_lessons;
  net := net - round(net * ratio)::int;
  share := net / terms_left;

  insert into enrolments (school_id, student_id, group_id, status, list_price_pence, discount_pence, swapped_from_id, starts_on)
    values (e.school_id, e.student_id, g.id, 'active', pp.cost_per_lesson_pence * v_lessons, round(pp.cost_per_lesson_pence * v_lessons * ratio)::int, e.id,   -- what was bought: its lessons
            case when st.id = cur.id then p_on else st.starts_on end)
    returning id into new_id;

  if st.id = cur.id then
    -- moving now: this term is re-priced
    -- what the family has already paid for this term, across any earlier swaps (net of refunds)
    with recursive chain as (select e.id as id, e.swapped_from_id as prev union all
                             select x.id, x.swapped_from_id from enrolments x join chain c on x.id = c.prev)
    select coalesce(sum(i.amount_pence - i.refunded_pence) filter (where i.status in ('paid', 'part_refunded')), 0)
           - coalesce((select sum(-a.amount_pence) from swap_adjustments a where a.amount_pence < 0 and a.term_id = cur.id
                       and a.from_enrolment_id in (select id from chain)), 0)
      into taken from instalments i where i.term_id = cur.id and i.enrolment_id in (select id from chain);
    if taken > 0 then
      diff := share + (net - share * terms_left) - taken;
      if diff > 0 then
        insert into instalments (school_id, enrolment_id, term_id, due_on, amount_pence) values (e.school_id, new_id, cur.id, p_on, diff);
      end if;
      if diff <> 0 then insert into swap_adjustments (school_id, from_enrolment_id, to_enrolment_id, term_id, amount_pence) values (e.school_id, e.id, new_id, cur.id, diff); end if;
    elsif cur.number <= pp.term_count then
      insert into instalments (school_id, enrolment_id, term_id, due_on, amount_pence) values (e.school_id, new_id, cur.id, p_on, share + (net - share * terms_left));
    end if;
    update instalments set status = 'cancelled' where enrolment_id = e.id and status in ('scheduled', 'failed') and term_id <> cur.id or (enrolment_id = e.id and term_id = cur.id and status in ('scheduled', 'failed'));
    update enrolments set status = 'swapped', ended_at = now(), end_reason = 'Swapped to ' || g.code where id = e.id;
  else
    -- moving next term: the old class runs to the end of this term, then closes
    update instalments i set status = 'cancelled' from terms t
      where i.enrolment_id = e.id and t.id = i.term_id and t.starts_on >= st.starts_on and i.status in ('scheduled', 'failed');
    update enrolments set last_billed_term_id = cur.id, end_reason = 'Swapping to ' || g.code || ' from ' || st.name where id = e.id;
  end if;

  -- the new course's later terms
  insert into instalments (school_id, enrolment_id, term_id, due_on, amount_pence)
    select e.school_id, new_id, t.id, t.bills_on, share + case when t.id = st.id then net - share * terms_left else 0 end
    from terms t where t.academic_year_id = g.academic_year_id and t.number <= pp.term_count
      and t.starts_on >= st.starts_on and t.id <> coalesce(case when st.id = cur.id then cur.id end, '00000000-0000-0000-0000-000000000000'::uuid);

  return query select new_id, st.name, greatest(diff, 0), greatest(-diff, 0), share;
end $$;
