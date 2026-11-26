import "server-only";
import { withSchool } from "./db";

// 26 Nov: the "join the waiting list" link in the email after a taster in a trial class. The token is the taster
// booking's join_token, so the family doesn't need to sign in or fill in a form.

export type JoinInfo = { child: string; parent: string; cls: string; slug: string; status: string; trial: boolean; needed: number; count: number; joined: boolean; place: number | null };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function joinInfo(token: string): Promise<JoinInfo | null> {
  if (!UUID.test(token)) return null;
  const rows = await withSchool((q) => q<JoinInfo>(`select split_part(r.child_name, ' ', 1) as child, r.parent_first_name as parent, l.name || ' ' || sj.name as cls,
      lower(regexp_replace(l.name, '[^A-Za-z0-9]+', '-', 'g')) || '/' || lower(regexp_replace(sj.name, '[^A-Za-z0-9]+', '-', 'g')) as slug,
      g.status::text, g.trial, g.waitlist_threshold::int as needed,
      (select count(*)::int from waitlist_entries w where w.group_id = g.id and w.enrolled_at is null) as count,
      w.id is not null as joined,
      (select count(*)::int from waitlist_entries x where x.group_id = g.id and x.created_at <= w.created_at) as place
    from taster_bookings b join taster_requests r on r.id = b.request_id join lesson_events e on e.id = b.lesson_event_id
      join course_groups g on g.id = e.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
      left join waitlist_entries w on w.group_id = g.id and (w.taster_booking_id = b.id or (lower(w.email::text) = lower(r.parent_email::text) and lower(w.child_name) = lower(r.child_name)))
    where b.join_token = $1::uuid and b.status <> 'cancelled' limit 1`, [token]));
  return rows[0] ?? null;
}

/** Adds the taster child to their class's waiting list (once). Reaching the class's target opens it (db trigger). */
export async function joinWaitlist(token: string): Promise<boolean> {
  if (!UUID.test(token)) return false;
  const n = await withSchool((q) => q<{ id: string }>(`insert into waitlist_entries (school_id, level_id, subject_id, group_id, parent_name, child_name, email, taster_booking_id, emailed_at)
    select b.school_id, g.level_id, g.subject_id, g.id, r.parent_first_name || ' ' || r.parent_last_name, r.child_name, r.parent_email, b.id,
      case when g.status = 'priority' then now() end   -- the class is already opening: they can book in the head start too
    from taster_bookings b join taster_requests r on r.id = b.request_id join lesson_events e on e.id = b.lesson_event_id join course_groups g on g.id = e.group_id
    where b.join_token = $1::uuid and b.status <> 'cancelled' and (g.trial or g.status in ('waitlist', 'priority'))
      and not exists (select 1 from waitlist_entries w where w.group_id = g.id and (w.taster_booking_id = b.id
        or (lower(w.email::text) = lower(r.parent_email::text) and lower(w.child_name) = lower(r.child_name))))
    on conflict do nothing returning id`, [token]));
  return n.length > 0;
}
