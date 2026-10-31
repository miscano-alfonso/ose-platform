import "server-only";
import { withSchool } from "./db";
import { cleanSettings, type NotifyRole, type NotifySettings, type NotifyEvent } from "./notify-types";

// Each person's notification settings (meet_kv notify:<u|p|s>:<id>) and what has happened since they last looked.
// The dashboard asks every 45 seconds while it's open; nothing is sent anywhere else.
export type Who = { role: NotifyRole; id: string };   // users.id for admin/teacher, parents.id, students.id
const keyOf = (w: Who) => `notify:${w.role === "parent" ? "p" : w.role === "student" ? "s" : "u"}:${w.id}`;
const okId = (id: string) => /^[0-9a-f-]{36}$/.test(id);

export async function getNotify(w: Who): Promise<NotifySettings> {
  if (!okId(w.id)) return cleanSettings(w.role, null);
  const v = (await withSchool((q) => q<{ value: unknown }>(`select value from meet_kv where key = $1`, [keyOf(w)])).catch(() => []))[0]?.value;
  return cleanSettings(w.role, v);
}
export async function saveNotify(w: Who, s: unknown): Promise<NotifySettings> {
  const c = cleanSettings(w.role, s);
  if (okId(w.id)) await withSchool((q) => q(`insert into meet_kv (school_id, key, value) values (current_school(), $1, $2)
    on conflict (school_id, key) do update set value = excluded.value, updated_at = now()`, [keyOf(w), JSON.stringify(c)]));
  return c;
}

const LESSON = (filter: string) => `
  select 'l:' || ev.id as id, 'lesson' as type, l.name || ' ' || sj.name || ' starts at ' || to_char(sl.starts_at, 'HH24:MI') as title,
    'In ' || greatest(1, ceil(extract(epoch from ((ev.lesson_date + sl.starts_at) at time zone sc.timezone - now())) / 60))::int || ' minutes' as body,
    %HREF% as href, now()::text as at
  from lesson_events ev join lesson_slots sl on sl.id = ev.slot_id join course_groups g on g.id = ev.group_id join levels l on l.id = g.level_id
    join subjects sj on sj.id = g.subject_id join schools sc on sc.id = ev.school_id
  where ev.status = 'scheduled' and ev.lesson_date between current_date - 1 and current_date + 1
    and (ev.lesson_date + sl.starts_at) at time zone sc.timezone between now() and now() + interval '10 minutes 30 seconds' and ${filter}`;

/** What happened after `since` (at most 2 hours back) that this person can be told about. */
export async function notifyEvents(w: Who, since: Date): Promise<NotifyEvent[]> {
  if (!okId(w.id)) return [];
  const from = new Date(Math.max(since.getTime(), Date.now() - 2 * 3600e3)).toISOString();
  return withSchool(async (q) => {
    const run = (sql: string, p: unknown[]) => q<NotifyEvent>(sql, p).catch(() => [] as NotifyEvent[]);
    const T = `(select id from teachers where user_id = $1)`;
    let parts: Promise<NotifyEvent[]>[] = [];
    if (w.role === "admin") parts = [
      run(`select 'e:' || m.id as id, 'email' as type, 'Email from ' || coalesce(nullif(m.from_name, ''), m.from_email::text) as title, m.subject as body, '/admin/email?tab=inbox&m=' || m.id as href, m.received_at::text as at
        from inbox_messages m where m.received_at > $1::timestamptz and m.read_at is null order by m.received_at desc limit 10`, [from]),
      run(`select 'm:' || m.id as id, 'message' as type, 'Message from ' || case when m.sender = 'parent' then p.first_name || ' ' || p.last_name else (select u.name from users u join teachers t on t.user_id = u.id where t.id = th.teacher_id) end as title,
          th.subject as body, '/admin/messages/' || th.id as href, m.created_at::text as at
        from messages m join message_threads th on th.id = m.thread_id join parents p on p.id = th.parent_id where m.created_at > $1::timestamptz and m.sender in ('parent','teacher') order by m.created_at desc limit 10`, [from]),
      run(`select 't:' || r.id as id, 'taster' as type, 'Taster request: ' || r.child_name as title, r.parent_first_name || ' ' || r.parent_last_name as body, '/admin/tasters' as href, r.created_at::text as at
        from taster_requests r where r.created_at > $1::timestamptz order by r.created_at desc limit 10`, [from]),
      run(`select 'q:' || e.id as id, 'enquiry' as type, 'New enquiry: ' || e.name as title, coalesce(left(e.message, 120), '') as body, '/admin/enquiries' as href, e.created_at::text as at
        from enquiries e where e.created_at > $1::timestamptz order by e.created_at desc limit 10`, [from]),
      run(LESSON("true").replace("%HREF%", "'/admin/register/' || ev.id"), []),
    ];
    if (w.role === "teacher") parts = [
      run(LESSON(`ev.teacher_id = ${T}`).replace("%HREF%", "g.meet_url"), [w.id]),
      run(`select 'm:' || m.id as id, 'message' as type, 'Message from ' || p.first_name || ' ' || p.last_name as title, th.subject as body, '/admin/messages/' || th.id as href, m.created_at::text as at
        from messages m join message_threads th on th.id = m.thread_id join parents p on p.id = th.parent_id
        where th.teacher_id = ${T} and m.sender = 'parent' and m.created_at > $2::timestamptz order by m.created_at desc limit 10`, [w.id, from]),
      run(`select 'r:' || m.id as id, 'email' as type, 'The school replied: ' || m.subject as title, left(coalesce(m.reply_body, ''), 140) as body, '/admin/teacher/email' as href, m.replied_at::text as at
        from inbox_messages m where m.kind = 'staff' and lower(m.from_email::text) = (select lower(email::text) from users where id = $1) and m.replied_at > $2::timestamptz limit 10`, [w.id, from]),
      run(`select 'c:' || cm.id as id, 'chat' as type, coalesce(nullif(st.known_as, ''), st.first_name) || ' in ' || l.name || ' ' || sj.name as title, left(cm.body, 140) as body,
          '/admin/teacher/chats?c=' || c.id || '&t=' || coalesce(cm.parent_id, cm.id) as href, cm.created_at::text as at
        from student_chat_messages cm join student_chats c on c.id = cm.chat_id join course_groups g on g.id = c.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
          join students st on st.id = cm.sender_student_id
        where c.kind = 'class' and g.teacher_id = ${T} and cm.hidden_at is null and cm.created_at > $2::timestamptz order by cm.created_at desc limit 10`, [w.id, from]),
    ];
    const KIDS = `(select e.group_id from enrolments e join students s on s.id = e.student_id where s.parent_id = $1 and e.status in ('pending','active'))`;
    if (w.role === "parent") parts = [
      run(LESSON(`ev.group_id in ${KIDS}`).replace("%HREF%", "'/parent'"), [w.id]),
      run(`select 'm:' || m.id as id, 'message' as type, 'Message from ' || (select u.name from users u join teachers t on t.user_id = u.id where t.id = th.teacher_id) as title, th.subject as body,
          '/parent/messages?t=' || th.id as href, m.created_at::text as at
        from messages m join message_threads th on th.id = m.thread_id where th.parent_id = $1 and m.sender = 'teacher' and m.created_at > $2::timestamptz order by m.created_at desc limit 10`, [w.id, from]),
      run(`select 'rp:' || c.id as id, 'report' as type, c.name || ' is ready' as title, 'Read it on the Reports page' as body, '/parent/reports' as href, c.published_at::text as at
        from report_cycles c where c.published_at > $2::timestamptz and exists (select 1 from report_entries e join students s on s.id = e.student_id where e.cycle_id = c.id and s.parent_id = $1)`, [w.id, from]),
      run(`select 'p:' || i.id || ':' || i.due_on as id, 'payment' as type, 'Payment tomorrow: £' || to_char(i.amount_pence / 100.0, 'FM999990.00') as title,
          'Taken from your saved card on ' || to_char(i.due_on, 'FMDay FMDD Mon') as body, '/parent/payments' as href, now()::text as at
        from instalments i join enrolments e on e.id = i.enrolment_id join students s on s.id = e.student_id
        where s.parent_id = $1 and i.status = 'scheduled' and i.due_on = current_date + 1 and extract(hour from now() at time zone 'Europe/London') between 8 and 20`, [w.id]),
    ];
    if (w.role === "student") parts = [
      run(LESSON(`ev.group_id in (select group_id from enrolments where student_id = $1 and status in ('pending','active'))`).replace("%HREF%", "'/join/' || g.id"), [w.id]),
      run(`select 'c:' || cm.id as id, 'chat' as type, coalesce(case when cm.sender_teacher_id is not null then (select u.name from users u join teachers t on t.user_id = u.id where t.id = cm.sender_teacher_id) end,
            (select coalesce(nullif(known_as, ''), first_name) from students where id = cm.sender_student_id), 'The office') as title, left(cm.body, 140) as body, '/student/chat?c=' || c.id || case when c.kind = 'class' then '&t=' || coalesce(cm.parent_id, cm.id) else '' end as href, cm.created_at::text as at
        from student_chat_messages cm join student_chats c on c.id = cm.chat_id
        where cm.created_at > $2::timestamptz and cm.hidden_at is null and (cm.sender_student_id is null or cm.sender_student_id <> $1)
          and (c.group_id in (select group_id from enrolments where student_id = $1 and status in ('pending','active')) or exists (select 1 from student_chat_members mm where mm.chat_id = c.id and mm.student_id = $1))
        order by cm.created_at desc limit 10`, [w.id, from]),
      run(`select 'pt:' || r.id as id, 'points' as type, '+' || r.points || ' reward point' || case when r.points = 1 then '' else 's' end as title, r.reason as body, '/student/rewards' as href, r.created_at::text as at
        from reward_points r where r.student_id = $1 and r.created_at > $2::timestamptz`, [w.id, from]),
    ];
    return (await Promise.all(parts)).flat().sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 20);
  });
}
