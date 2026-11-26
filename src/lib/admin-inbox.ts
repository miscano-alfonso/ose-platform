import "server-only";
import { withSchool } from "./db";

// 26 Nov: the admin's Messages page as one inbox, like the teacher's (list + conversation side by side). It holds the
// conversations the office started (with parents, students and teachers; a message sent to a whole class or level shows
// as one row until someone replies), and conversations between parents and teachers (safeguarding).
// Unread: office conversations use office_messages.read_at; parent ↔ teacher conversations use teacher_seen per admin
// (key "afam:<thread>"), new messages after 26 Nov 16:00 count.
export type AdminKind = "office" | "family" | "batch";
export type AdminItem = { kind: AdminKind; id: string; subject: string; who: string; sub: string | null; initials: string; at: string; preview: string;
  mine: boolean; unread: number; waiting: boolean; closed: boolean; tag: string; canUnread: boolean };
export const ADMIN_SEEN_FROM = "2026-11-26T16:00:00Z";
const KIND: Record<string, string> = { parent: "Parent", student: "Student", teacher: "Teacher" };
const ini = (s: string) => s.replace(/[^A-Za-z\s-]/g, "").split(/[\s-]+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";
const cut = (s: string | null | undefined, n = 140) => { const t = (s ?? "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n) + "…" : t; };

export async function adminInbox(userId: string): Promise<AdminItem[]> {
  return withSchool(async (q) => {
    const office = await q<{ id: string; to_kind: string; name: string; about: string | null; subject: string; status: string; batch_id: string | null; batch: string | null; batch_size: number | null;
      at: string; last_sender: string; last_body: string | null; unread: number; replies: number }>(`
      select th.id, th.to_kind, coalesce(p.first_name || ' ' || p.last_name, s.first_name || ' ' || s.last_name, tu.name) as name,
        case when th.to_kind = 'parent' then (select first_name from students where id = th.student_id) end as about,
        th.subject, th.status, th.batch_id, b.label as batch, b.recipients as batch_size, th.last_message_at::text as at,
        (select m.sender from office_messages m where m.thread_id = th.id order by m.created_at desc limit 1) as last_sender,
        (select left(m.body, 300) from office_messages m where m.thread_id = th.id order by m.created_at desc limit 1) as last_body,
        (select count(*)::int from office_messages m where m.thread_id = th.id and m.sender <> 'office' and m.read_at is null) as unread,
        (select count(*)::int from office_messages m where m.thread_id = th.id and m.sender <> 'office') as replies
      from office_threads th left join parents p on th.to_kind = 'parent' and p.id = th.parent_id left join students s on th.to_kind = 'student' and s.id = th.student_id
        left join teachers t on t.id = th.teacher_id left join users tu on tu.id = t.user_id left join office_batches b on b.id = th.batch_id
      order by th.last_message_at desc limit 400`);
    const family = await q<{ id: string; subject: string; status: string; parent: string; student: string; teacher: string; at: string; last_sender: string | null; last_body: string | null; seen: string | null; office_copied: boolean }>(`
      select th.id, th.subject, th.status, p.first_name || ' ' || p.last_name as parent, s.first_name as student, u.name as teacher, th.last_message_at::text as at, th.office_copied,
        (select m.sender from messages m where m.thread_id = th.id order by m.created_at desc limit 1) as last_sender,
        (select left(m.body, 300) from messages m where m.thread_id = th.id order by m.created_at desc limit 1) as last_body,
        (select ts.seen_at::text from teacher_seen ts where ts.user_id = $1 and ts.key = 'afam:' || th.id) as seen
      from message_threads th join parents p on p.id = th.parent_id join students s on s.id = th.student_id join teachers t on t.id = th.teacher_id join users u on u.id = t.user_id
      order by th.last_message_at desc limit 200`, [userId]);
    const items: AdminItem[] = [];
    const batches = new Map<string, typeof office>();
    for (const t of office) {
      if (t.batch_id && t.replies === 0) { batches.set(t.batch_id, [...(batches.get(t.batch_id) ?? []), t]); continue; }   // one row per class/level message until someone replies
      items.push({ kind: "office", id: t.id, subject: t.subject, who: t.name ?? "(no name)", sub: `${KIND[t.to_kind] ?? ""}${t.about ? ` · about ${t.about}` : ""}${t.batch ? ` · ${t.batch}` : ""}`,
        initials: ini(t.name ?? "?"), at: t.at, preview: (t.last_sender === "office" ? "You: " : "") + cut(t.last_body), mine: t.last_sender === "office",
        unread: t.unread, waiting: t.last_sender !== "office" && t.status === "open", closed: t.status === "closed", tag: "Office", canUnread: t.replies > 0 });
    }
    for (const [bid, rows] of batches) {
      const t = rows[0];
      items.push({ kind: "batch", id: bid, subject: t.subject, who: t.batch ?? "A group", sub: `${t.batch_size ?? rows.length} people · no replies yet`, initials: ini(t.batch ?? "G"),
        at: rows.map((r) => r.at).sort().reverse()[0], preview: "You: " + cut(t.last_body), mine: true, unread: 0, waiting: false, closed: rows.every((r) => r.status === "closed"), tag: "Group", canUnread: false });
    }
    const ms = (s: string) => Date.parse(s.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00"));
    for (const t of family) {
      const unread = t.last_sender && t.last_sender !== "office" && ms(t.at) > ms(t.seen ?? ADMIN_SEEN_FROM) ? 1 : 0;
      items.push({ kind: "family", id: t.id, subject: t.subject, who: `${t.parent} ↔ ${t.teacher}`, sub: `about ${t.student}${t.office_copied ? " · passed to the office" : ""}`,
        initials: ini(t.parent), at: t.at, preview: (t.last_sender === "office" ? "You: " : t.last_sender === "teacher" ? `${t.teacher.split(" ")[0]}: ` : "") + cut(t.last_body),
        mine: t.last_sender === "office", unread, waiting: t.status === "open" && t.last_sender === "parent" && Date.now() - ms(t.at) > 2 * 864e5, closed: t.status === "closed", tag: "Parents ↔ teachers", canUnread: true });
    }
    items.sort((a, b) => ms(b.at) - ms(a.at));
    return items;
  });
}

/** An admin opening a parent ↔ teacher conversation: it counts as read from now. */
export async function markFamilySeen(userId: string, id: string) {
  await withSchool((q) => q(`insert into teacher_seen (school_id, user_id, key, seen_at) values (current_school(), $1, $2, now())
    on conflict (user_id, key) do update set seen_at = now()`, [userId, "afam:" + id])).catch(() => {});
}
/** "Mark as unread" on the admin's inbox. */
export async function adminMarkUnread(userId: string, kind: AdminKind, id: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return false;
  return withSchool(async (q) => {
    if (kind === "office") return (await q(`update office_messages set read_at = null where id = (select id from office_messages where thread_id = $1 and sender <> 'office' order by created_at desc limit 1) returning id`, [id])).length > 0;
    if (kind === "family") {
      await q(`insert into teacher_seen (school_id, user_id, key, seen_at) select current_school(), $1, $2, th.last_message_at - interval '1 second' from message_threads th where th.id = $3
        on conflict (user_id, key) do update set seen_at = excluded.seen_at`, [userId, "afam:" + id, id]);
      return true;
    }
    return false;
  }).catch(() => false);
}
/** The admin menu's Messages count: office conversations with an unread reply + parent ↔ teacher conversations with something new. */
export const ADMIN_MSG_COUNT_SQL = `(select count(distinct thread_id)::int from office_messages where sender <> 'office' and read_at is null)
  + (select count(*)::int from message_threads th where (select m.sender from messages m where m.thread_id = th.id order by m.created_at desc limit 1) <> 'office'
      and th.last_message_at > coalesce((select ts.seen_at from teacher_seen ts where ts.user_id = $1 and ts.key = 'afam:' || th.id), '${ADMIN_SEEN_FROM}'::timestamptz))`;
