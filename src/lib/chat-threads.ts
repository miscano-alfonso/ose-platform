import "server-only";
import { withSchool } from "./db";

// Class chats as threads (31 Oct): each conversation has a topic and its replies, so "Homework question 3" and
// "Quiz on Thursday" don't get mixed up. Used by the student, teacher and office chat pages.
// `me` is the student reading (their own name shows as "You", and Report only shows on others' messages); null for staff.

export type ChatThread = { id: string; topic: string | null; who: string; body: string; hidden: boolean; at: string; replies: number; last_at: string; last_who: string | null };
export type ChatMsg = { id: string; who: string; body: string; hidden: boolean; at: string; mine: boolean; reported: boolean; teacher: boolean };

const WHO = (first: boolean) => `coalesce(${first ? "s.first_name" : "s.first_name || ' ' || s.last_name"}, tu.name, case when m.sender_office then 'The office' end)`;
const JOIN = `left join students s on s.id = m.sender_student_id left join teachers t on t.id = m.sender_teacher_id left join users tu on tu.id = t.user_id`;

/** The chat's threads, most recently active first. */
export async function chatThreads(chatId: string, me: string | null = null, limit = 60): Promise<ChatThread[]> {
  return withSchool((q) => q<ChatThread>(`
    select m.id, m.topic, ${WHO(!!me)} as who, case when m.hidden_at is null or $2::uuid is null then m.body else '' end as body, m.hidden_at is not null as hidden, m.created_at::text as at,
      (select count(*)::int from student_chat_messages r where r.parent_id = m.id) as replies,
      coalesce((select max(r.created_at) from student_chat_messages r where r.parent_id = m.id), m.created_at)::text as last_at,
      (select coalesce(rs.first_name, rtu.name, case when r.sender_office then 'The office' end) from student_chat_messages r left join students rs on rs.id = r.sender_student_id
         left join teachers rt on rt.id = r.sender_teacher_id left join users rtu on rtu.id = rt.user_id where r.parent_id = m.id order by r.created_at desc limit 1) as last_who
    from student_chat_messages m ${JOIN}
    where m.chat_id = $1 and m.parent_id is null
    order by 8 desc limit $3`, [chatId, me, limit]));
}

/** One thread: the message that started it, then the replies in order. */
export async function threadMessages(chatId: string, threadId: string, me: string | null = null): Promise<ChatMsg[]> {
  return withSchool((q) => q<ChatMsg>(`
    select m.id, ${WHO(!!me)} as who, case when m.hidden_at is null or $3::uuid is null then m.body else '' end as body, m.hidden_at is not null as hidden, m.created_at::text as at,
      coalesce(m.sender_student_id = $3::uuid, false) as mine, m.sender_teacher_id is not null as teacher,
      $3::uuid is not null and exists (select 1 from student_chat_reports r where r.message_id = m.id and r.reported_by = $3::uuid) as reported
    from student_chat_messages m ${JOIN}
    where m.chat_id = $1 and (m.id = $2 or m.parent_id = $2)
    order by m.parent_id nulls first, m.created_at limit 300`, [chatId, threadId, me]));
}

/** Topic and thread from a chat form: a reply carries `thread`; a new thread carries `topic`. */
export function threadFields(f: FormData): { parent: string | null; topic: string | null } {
  const parent = String(f.get("thread") ?? "").trim();
  const topic = String(f.get("topic") ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  return { parent: /^[0-9a-f-]{36}$/.test(parent) ? parent : null, topic: parent ? null : topic || null };
}

/** A thread's title: its topic, or the start of its first message. */
export const threadTitle = (t: { topic: string | null; body: string; hidden?: boolean }) =>
  t.topic ?? (t.hidden || !t.body ? "Message removed by staff" : t.body.length > 70 ? t.body.slice(0, 68).trimEnd() + "…" : t.body);
