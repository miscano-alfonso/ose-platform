import "server-only";
import { withSchool } from "./db";
import { myOfficeThreads } from "./office-messages";
import { teacherEmails, type TeacherEmail } from "./teacher-area";

// 26 Nov: the teacher's Messages inbox: every conversation in one list (messages from the office, the teacher's emails to the
// school, and conversations with families), newest first, each with how many messages are unread.
export type InboxKind = "office" | "school" | "family";
export type InboxItem = { kind: InboxKind; id: string; subject: string; who: string; sub: string | null; initials: string; at: string; preview: string;
  mine: boolean; unread: number; waiting: boolean; closed: boolean; via: "email" | "app" };   // 27 Nov: how the latest message came
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
  // 26 Nov: threads with a reply not yet seen but older than the newest 60 emails were left out of the list while the menu
  // still counted them ("Messages 1" with nothing unread). Those threads are added, using the menu's own rule.
  const have = new Set(mails.map((e) => e.thread_id));
  const older = (await withSchool((q) => q<{ t: string }>(`select distinct im.thread_id as t from inbox_messages im
      where im.kind = 'staff' and lower(im.from_email::text) = (select lower(email::text) from users where id = $1)
        and im.replied_at > coalesce((select ts.seen_at from teacher_seen ts where ts.user_id = $1 and ts.key = 'school:' || im.thread_id), $2::timestamptz)`,
    [userId, SEEN_FROM])).catch(() => [])).map((r) => r.t).filter((t) => !have.has(t));
  if (older.length) mails.push(...await teacherEmails(userId, 200, older));
  const items: InboxItem[] = [];
  for (const t of office) {
    const who = cap(t.office_name || officeLabel);
    items.push({ kind: "office", id: t.id, subject: t.subject, who, sub: "The office", initials: ini(who), at: t.last_at, preview: (t.last_sender === "teacher" ? "You: " : "") + cut(t.last_body),
      mine: t.last_sender === "teacher", unread: t.unread_n ?? (t.unread ? 1 : 0), waiting: false, closed: t.status === "closed", via: "app" });
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
      preview: last.replied_at ? cut(last.reply_body) : "You: " + cut(last.body), mine: !last.replied_at, unread, waiting: false, closed: false,
      via: last.replied_at || !last.local ? "email" : "app" });
  }
  for (const t of family) items.push({ kind: "family", id: t.id, subject: t.subject, who: t.parent, sub: `about ${t.student}`, initials: ini(t.parent), at: t.at,
    preview: (t.last_sender === "parent" ? "" : "You: ") + cut(t.last_body), mine: t.last_sender !== "parent", unread: t.unread, waiting: t.last_sender === "parent" && t.status === "open", closed: t.status === "closed", via: "app" });
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

/** 26 Nov: "Mark as unread": the conversation's latest message from the other side counts as unread again. */
export async function markUnread(userId: string, kind: InboxKind, id: string): Promise<boolean> {
  return withSchool(async (q) => {
    if (kind === "office") {
      if (!/^[0-9a-f-]{36}$/.test(id)) return false;
      return (await q(`update office_messages set read_at = null where id = (select m.id from office_messages m join office_threads th on th.id = m.thread_id join teachers t on t.id = th.teacher_id
        where m.thread_id = $1 and t.user_id = $2 and th.to_kind = 'teacher' and m.sender = 'office' order by m.created_at desc limit 1) returning id`, [id, userId])).length > 0;
    }
    if (kind === "family") {
      if (!/^[0-9a-f-]{36}$/.test(id)) return false;
      return (await q(`update messages set read_by_teacher_at = null where id = (select m.id from messages m join message_threads th on th.id = m.thread_id join teachers t on t.id = th.teacher_id
        where m.thread_id = $1 and t.user_id = $2 and m.sender = 'parent' order by m.created_at desc limit 1) returning id`, [id, userId])).length > 0;
    }
    // the school's replies to this teacher's emails: seen up to just before the latest reply
    const [r] = await q<{ at: string | null }>(`select greatest((select max(im.replied_at) from inbox_messages im
      where im.kind = 'staff' and im.thread_id = $1 and lower(im.from_email::text) = (select lower(email::text) from users where id = $2)),
      (select max(s.sent_at) from inbox_sent s where s.thread_id = $1 and (select lower(email::text) from users where id = $2) = any(s.to_addrs)))::text as at`, [id, userId]);   // 27 Nov: and the school's emails sent from Gmail
    if (!r?.at) return false;
    await q(`insert into teacher_seen (school_id, user_id, key, seen_at) values (current_school(), $1, $2, $3::timestamptz - interval '1 second')
      on conflict (user_id, key) do update set seen_at = excluded.seen_at`, [userId, "school:" + id, r.at]);
    return true;
  }).catch(() => false);
}

// ---------- 27 Nov (Alfonso: "why are the teacher email feature not working like the admin's one?") ----------
// A teacher's Email as a mail reader: each conversation with the school and every email in it, both sides: the teacher's
// emails (written here, or sent from their own email to the school's), the office's replies from the admin's Reply, and
// emails the school sent them from Gmail itself (inbox_sent, db/129).
export type MailMsg = { key: string; mine: boolean; who: string; email: string | null; at: string; body: string; partial: string | null;
  files: { id: string; name: string; size: number }[]; links: string[] };
export type MailThread = { id: string; subject: string; who: string; at: string; officeAt: string | null; msgs: MailMsg[]; preview: string; mine: boolean };
export async function teacherMail(userId: string, officeLabel: string): Promise<MailThread[]> {
  const rows = await withSchool(async (q) => {
    const me = (await q<{ email: string; name: string }>(`select lower(email::text) as email, name from users where id = $1`, [userId]))[0];
    if (!me) return null;
    const own = await q<{ id: string; thread_id: string; subject: string; body: string | null; body_text: string | null; snippet: string | null; local: boolean; at: string;
      replied_at: string | null; reply_body: string | null; reply_from: string | null; replier: string | null; to_name: string | null; links: string[] | null; files: { id: string; name: string; size: number }[] }>(`
      select m.id, m.thread_id, m.subject, m.body, m.body_text, m.snippet, m.gmail_id like 'local:%' as local, m.received_at::text as at, m.replied_at::text, m.reply_body, m.reply_from::text,
        ru.name as replier, coalesce((select string_agg(x.name, ' & ' order by array_position(m.to_users, x.id)) from users x where x.id = any(m.to_users)), tu.name) as to_name, m.links,
        coalesce((select json_agg(json_build_object('id', f.id, 'name', f.name, 'size', f.size) order by f.created_at) from inbox_attachments f where f.message_id = m.id), '[]'::json) as files
      from inbox_messages m left join users tu on tu.id = m.to_user left join users ru on ru.id = m.replied_by
      where m.kind = 'staff' and lower(m.from_email::text) = $1 order by m.received_at desc limit 300`, [me.email]);
    const sent = await q<{ id: string; thread_id: string; subject: string; body: string | null; at: string; from_name: string | null; from_email: string | null; sender: string | null }>(`
      select s.id, s.thread_id, s.subject, s.body, s.sent_at::text as at, s.from_name, s.from_email::text, (select u.name from users u where lower(u.email::text) = lower(s.from_email::text) limit 1) as sender
      from inbox_sent s where $1 = any(s.to_addrs) order by s.sent_at desc limit 300`, [me.email]);   // only emails sent to this teacher (never one the office forwarded to someone else)
    return { me, own, sent };
  }).catch(() => null);
  if (!rows) return [];
  const { stripQuoted } = await import("./inbox");
  const threads = new Map<string, MailThread>();
  const th = (id: string, subject: string) => { let t = threads.get(id); if (!t) { t = { id, subject, who: cap(officeLabel), at: "", officeAt: null, msgs: [], preview: "", mine: false }; threads.set(id, t); } return t; };
  for (const r of rows.own) {
    const t = th(r.thread_id, r.subject);
    if (r.to_name) t.who = r.to_name;
    const full = r.body ?? r.body_text;
    t.msgs.push({ key: "m" + r.id, mine: true, who: "You", email: null, at: r.at, body: stripQuoted(full ?? r.snippet ?? ""), partial: full == null && !r.local ? r.id : null, files: r.files ?? [], links: r.links ?? [] });
    if (r.replied_at) t.msgs.push({ key: "r" + r.id, mine: false, who: r.replier ?? r.to_name ?? cap(officeLabel), email: r.reply_from, at: r.replied_at, body: stripQuoted(r.reply_body ?? ""), partial: null, files: [], links: [] });
  }
  for (const s of rows.sent) {
    const t = th(s.thread_id, s.subject);
    const who = s.sender ?? cap(officeLabel);   // the school's own inbox (e.g. ose@) shows as the office's name
    if (!rows.own.some((r) => r.thread_id === s.thread_id)) t.who = who;
    t.msgs.push({ key: "s" + s.id, mine: false, who, email: s.from_email, at: s.at, body: s.body ?? "", partial: null, files: [], links: [] });
  }
  for (const t of threads.values()) {
    t.msgs.sort((a, b) => ms(b.at) - ms(a.at));   // newest first, as in the admin's inbox
    const last = t.msgs[0];
    t.at = last.at; t.mine = last.mine; t.subject = t.msgs.length ? (t.subject || "(no subject)") : t.subject;
    t.officeAt = t.msgs.find((m) => !m.mine)?.at ?? null;
    t.preview = (last.mine ? "You: " : "") + cut(last.body);
  }
  return [...threads.values()].sort((a, b) => ms(b.at) - ms(a.at));
}
/** The whole text of the teacher's own emails sent from their email app (only a preview is kept until one is opened). */
export async function fillMailBodies(thread: MailThread): Promise<void> {
  const need = thread.msgs.filter((m) => m.partial);
  if (!need.length) return;
  const { inboxMessage, stripQuoted } = await import("./inbox");
  await Promise.all(need.map(async (m) => { const r = await inboxMessage(m.partial!).catch(() => null); if (r && !("error" in r)) { m.body = stripQuoted(r.body); m.partial = null; } }));
}
/** Unread conversations with the school: the office's latest email came after the teacher last opened it. */
export const mailUnread = (t: MailThread, seen: Map<string, string>) => !!t.officeAt && ms(t.officeAt) > ms(seen.get("school:" + t.id) ?? SEEN_FROM);
export async function seenMap(userId: string): Promise<Map<string, string>> {
  const r = await withSchool((q) => q<{ key: string; seen_at: string }>(`select key, seen_at::text from teacher_seen where user_id = $1 and key like 'school:%'`, [userId])).catch(() => []);
  return new Map(r.map((x) => [x.key, x.seen_at]));
}
