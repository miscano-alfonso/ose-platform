import "server-only";
import { withSchool } from "./db";
import { myOfficeThreads } from "./office-messages";
import { teacherEmails, type TeacherEmail } from "./teacher-area";

// 26 Nov: the teacher's Messages inbox: every conversation in one list (messages from the office, the teacher's emails to the
// school, and conversations with families), newest first, each with how many messages are unread.
export type InboxKind = "office" | "school" | "family";
export type InboxItem = { kind: InboxKind; id: string; subject: string; who: string; sub: string | null; initials: string; at: string; preview: string;
  mine: boolean; unread: number; waiting: boolean; closed: boolean };
const SEEN_FROM = "2026-11-26T12:00:00Z";   // replies before the inbox started count as read
const ini = (s: string) => s.replace(/[^A-Za-z\s-]/g, "").split(/[\s-]+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";
/** Postgres text timestamps ("2026-11-26 12:39:55.6+00") and ISO ones, as milliseconds. */
const ms = (s: string) => Date.parse(s.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00"));
const cap = (s: string) => s ? s[0].toUpperCase() + s.slice(1) : s;
const cut = (s: string | null | undefined, n = 140) => { const t = (s ?? "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n) + "…" : t; };

export async function teacherInbox(userId: string, officeLabel: string, contacts: { name: string }[]): Promise<{ items: InboxItem[]; mails: TeacherEmail[] }> {
  const [office, mails, family, seen] = await Promise.all([
    myOfficeThreads("teacher", userId).catch(() => []),
    teacherEmails(userId).catch(() => [] as TeacherEmail[]),
    withSchool((q) => q<{ id: string; subject: string; status: string; parent: string; student: string; at: string; last_sender: string | null; last_body: string | null; unread: number }>(`
      select th.id, th.subject, th.status, p.first_name || ' ' || p.last_name as parent, s.first_name as student, th.last_message_at::text as at,
        (select m.sender from messages m where m.thread_id = th.id order by m.created_at desc limit 1) as last_sender,
        (select left(m.body, 300) from messages m where m.thread_id = th.id order by m.created_at desc limit 1) as last_body,
        (select count(*)::int from messages m where m.thread_id = th.id and m.sender = 'parent' and m.read_by_teacher_at is null) as unread
      from message_threads th join parents p on p.id = th.parent_id join students s on s.id = th.student_id join teachers t on t.id = th.teacher_id
      where t.user_id = $1 order by th.last_message_at desc limit 200`, [userId])).catch(() => []),
    withSchool((q) => q<{ key: string; seen_at: string }>(`select key, seen_at::text from teacher_seen where user_id = $1`, [userId])).catch(() => []),
  ]);
  const seenAt = new Map(seen.map((r) => [r.key, r.seen_at]));
  const items: InboxItem[] = [];
  for (const t of office) {
    const who = cap(t.office_name || officeLabel);
    items.push({ kind: "office", id: t.id, subject: t.subject, who, sub: "The office", initials: ini(who), at: t.last_at, preview: (t.last_sender === "teacher" ? "You: " : "") + cut(t.last_body),
      mine: t.last_sender === "teacher", unread: t.unread_n ?? (t.unread ? 1 : 0), waiting: false, closed: t.status === "closed" });
  }
  // emails to the school: one conversation per thread (each row is the teacher's email, with the school's reply on it)
  const threads = new Map<string, TeacherEmail[]>();
  for (const e of mails) threads.set(e.thread_id, [...(threads.get(e.thread_id) ?? []), e]);
  for (const [tid, rows] of threads) {
    const last = rows[0];   // newest first
    const lastAt = last.replied_at ?? last.at, since = seenAt.get("school:" + tid) ?? SEEN_FROM;
    const unread = rows.filter((e) => e.replied_at && ms(e.replied_at) > ms(since)).length;
    const name = rows.find((e) => e.to_name)?.to_name ?? null;
    const label = cap(name && contacts.some((c) => c.name === name) ? name : name ?? officeLabel);
    items.push({ kind: "school", id: tid, subject: last.subject || "(no subject)", who: label, sub: "The school", initials: ini(label), at: lastAt,
      preview: last.replied_at ? cut(last.reply_body) : "You: " + cut(last.body), mine: !last.replied_at, unread, waiting: false, closed: false });
  }
  for (const t of family) items.push({ kind: "family", id: t.id, subject: t.subject, who: t.parent, sub: `about ${t.student}`, initials: ini(t.parent), at: t.at,
    preview: (t.last_sender === "parent" ? "" : "You: ") + cut(t.last_body), mine: t.last_sender !== "parent", unread: t.unread, waiting: t.last_sender === "parent" && t.status === "open", closed: t.status === "closed" });
  items.sort((a, b) => b.at.localeCompare(a.at));
  return { items, mails };
}

/** Opening a conversation with the school: its replies count as read from now on. */
export async function markSchoolSeen(userId: string, threadId: string) {
  await withSchool((q) => q(`insert into teacher_seen (school_id, user_id, key, seen_at) values (current_school(), $1, $2, now())
    on conflict (user_id, key) do update set seen_at = now()`, [userId, "school:" + threadId])).catch(() => {});
}

/** A conversation with a family, if it's this teacher's (opening it marks the parent's messages read). */
export async function familyThread(userId: string, id: string, markRead: boolean) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const { getThread } = await import("./community");
  const t = await getThread(id);
  if (!t || (t.th as { teacher_user?: string }).teacher_user !== userId) return null;
  if (markRead) await withSchool((q) => q(`update messages set read_by_teacher_at = now() where thread_id = $1 and sender = 'parent' and read_by_teacher_at is null`, [id])).catch(() => {});
  return t;
}
