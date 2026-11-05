import "server-only";
import { withSchool } from "./db";
import { sendBatch, type Recipient } from "./email";

// Messages the office starts (Admin → Messages → New message), to one person or to every parent or student in a class
// or level. Each person gets a private conversation of their own (office_threads), shown in their area of the platform,
// with a copy by email. Replies on the platform come back here; replies to the email land in Email → Inbox.

type Q = <T = Record<string, unknown>>(s: string, p?: unknown[]) => Promise<T[]>;
export type ToKind = "parent" | "student" | "teacher";
export type Audience = "parent" | "student" | "teacher" | "class-parents" | "class-students" | "level-parents" | "level-students" | "teachers";
export const AUDIENCES: { id: Audience; label: string; pick: "parent" | "student" | "teacher" | "class" | "level" | null }[] = [
  { id: "parent", label: "A parent", pick: "parent" }, { id: "student", label: "A student", pick: "student" }, { id: "teacher", label: "A teacher", pick: "teacher" },
  { id: "class-parents", label: "A class’s parents", pick: "class" }, { id: "class-students", label: "A class’s students", pick: "class" },
  { id: "level-parents", label: "A level’s parents", pick: "level" }, { id: "level-students", label: "A level’s students", pick: "level" },
  { id: "teachers", label: "All teachers", pick: null },
];
const okId = (s: string) => /^[0-9a-f-]{36}$/.test(s);
const audit = (q: Q, a: string, act: string, id: string | null, d: unknown = {}) =>
  q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, $2, 'office_thread', $3, $4)`, [a, act, id, JSON.stringify(d)]);

// active, non-taster enrolments in this academic year's classes
const CURRENT = `e.status = 'active' and not e.is_taster and y.ends_on >= current_date`;
const ENROLLED = `from enrolments e join course_groups g on g.id = e.group_id join academic_years y on y.id = g.academic_year_id join students s on s.id = e.student_id`;

export type Options = {
  parents: { id: string; label: string }[]; students: { id: string; label: string }[]; teachers: { id: string; label: string }[];
  classes: { id: string; label: string; families: number; students: number }[]; levels: { id: string; label: string; families: number; students: number }[];
};
/** Everyone and every group the office can write to. */
export async function messageOptions(): Promise<Options> {
  return withSchool(async (q) => {
    const [parents, students, teachers, classes, levels] = await Promise.all([
      q<{ id: string; label: string }>(`select p.id, p.first_name || ' ' || p.last_name || coalesce(' · ' || (select string_agg(s.first_name, ', ' order by s.first_name) from students s where s.parent_id = p.id), '') as label
        from parents p order by p.first_name, p.last_name`),
      q<{ id: string; label: string }>(`select s.id, s.first_name || ' ' || s.last_name || coalesce(' · ' || (select string_agg(distinct l.name, ', ') ${ENROLLED.replace("join students s on s.id = e.student_id", "join levels l on l.id = g.level_id")} where e.student_id = s.id and ${CURRENT}), '') as label
        from students s order by s.first_name, s.last_name`),
      q<{ id: string; label: string }>(`select t.id, u.name as label from teachers t join users u on u.id = t.user_id where t.archived_at is null and u.disabled_at is null order by u.name`),
      q<{ id: string; label: string; families: number; students: number }>(`select g.id, l.name || ' ' || sj.name || ' (' || g.code || ')' as label,
          count(distinct s.parent_id)::int as families, count(distinct s.id)::int as students
        ${ENROLLED} join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id where ${CURRENT} group by g.id, l.name, l.sort_order, sj.name, g.code order by l.sort_order, sj.name, g.code`),
      q<{ id: string; label: string; families: number; students: number }>(`select l.id, l.name as label, count(distinct s.parent_id)::int as families, count(distinct s.id)::int as students
        ${ENROLLED} join levels l on l.id = g.level_id where ${CURRENT} group by l.id, l.name, l.sort_order order by l.sort_order`),
    ]);
    return { parents, students, teachers, classes, levels };
  });
}

type To = { kind: ToKind; parent_id: string | null; student_id: string | null; teacher_id: string | null; name: string; email: string | null };
/** The people an audience reaches, one entry per conversation. A parent with two children in the class gets one. */
async function resolve(q: Q, aud: Audience, target: string): Promise<{ to: To[]; label: string }> {
  const P = `'parent' as kind, p.id as parent_id, null::uuid as teacher_id, p.first_name || ' ' || p.last_name as name, p.email::text as email`;
  const S = `'student' as kind, null::uuid as parent_id, s.id as student_id, null::uuid as teacher_id, s.first_name || ' ' || s.last_name as name, s.email::text as email`;
  const T = `'teacher' as kind, null::uuid as parent_id, null::uuid as student_id, t.id as teacher_id, u.name, u.email::text as email`;
  if (aud === "teachers") return { label: "All teachers", to: await q<To>(`select ${T} from teachers t join users u on u.id = t.user_id where t.archived_at is null and u.disabled_at is null order by u.name`) };
  if (!okId(target)) return { to: [], label: "" };
  if (aud === "teacher") { const to = await q<To>(`select ${T} from teachers t join users u on u.id = t.user_id where t.id = $1 and t.archived_at is null`, [target]); return { to, label: to[0]?.name ?? "" }; }
  if (aud === "student") { const to = await q<To>(`select ${S} from students s where s.id = $1`, [target]); return { to, label: to[0]?.name ?? "" }; }
  if (aud === "parent") {   // about their child, when they have just one
    const to = await q<To>(`select ${P}, case when (select count(*) from students s where s.parent_id = p.id) = 1 then (select s.id from students s where s.parent_id = p.id limit 1) end as student_id
      from parents p where p.id = $1`, [target]);
    return { to, label: to[0]?.name ?? "" };
  }
  const byClass = aud.startsWith("class"), field = byClass ? "g.id" : "g.level_id";
  const name = (await q<{ n: string }>(byClass ? `select l.name || ' ' || sj.name || ' (' || g.code || ')' as n from course_groups g join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id where g.id = $1`
    : `select name as n from levels where id = $1`, [target]))[0]?.n;
  if (!name) return { to: [], label: "" };
  if (aud.endsWith("students")) return { label: `${name} students`, to: await q<To>(`select distinct on (s.id) ${S} ${ENROLLED} where ${field} = $1 and ${CURRENT} order by s.id`, [target]) };
  // parents: one each, about the child in the group when there's only one of theirs
  return { label: `${name} parents`, to: await q<To>(`select ${P}, case when count(distinct s.id) = 1 then (array_agg(s.id))[1] end as student_id
    ${ENROLLED} join parents p on p.id = s.parent_id where ${field} = $1 and ${CURRENT} group by p.id, p.first_name, p.last_name, p.email`, [target]) };
}

const LINK: Record<ToKind, string> = { parent: "/parent/messages", student: "/student/messages", teacher: "/admin/teacher/messages" };
const footer = (base: string, kind: ToKind, id: string | null) =>
  `\n\n—\nReply to this email, or read and reply in your ${kind === "teacher" ? "staff area" : "account"}: ${base}${LINK[kind]}${id ? `?${kind === "teacher" ? "office" : "o"}=${id}` : ""}`;

/** Start a conversation with everyone the audience reaches, and email each of them a copy (test mode can hold the emails). */
export async function sendOfficeMessage(actorId: string, d: { aud: Audience; target: string; subject: string; body: string; email: boolean; base: string }):
  Promise<{ error?: string; threads?: string[]; batch?: string | null; count?: number; emailed?: number; held?: number; noEmail?: number; emailError?: string }> {
  if (!AUDIENCES.some((a) => a.id === d.aud)) return { error: "Choose who it’s to." };
  const subject = d.subject.trim().slice(0, 160), body = d.body.trim().slice(0, 4500);
  if (!subject || !body) return { error: "Add a subject and a message." };
  const made = await withSchool(async (q) => {
    const { to, label } = await resolve(q, d.aud, d.target);
    if (!to.length) return { error: "Nobody to send it to. Choose someone, or a class or level with students in it." } as const;
    if (to.length > 1000) return { error: "That’s too many people for one message." } as const;
    const single = to.length === 1 && ["parent", "student", "teacher"].includes(d.aud);
    const batch = single ? null : (await q<{ id: string }>(`insert into office_batches (school_id, label, subject, recipients, created_by) values (current_school(), $1, $2, $3, $4) returning id`,
      [label, subject, to.length, actorId]))[0].id;
    const ids: string[] = [];
    for (const r of to) {
      const th = (await q<{ id: string }>(`insert into office_threads (school_id, batch_id, to_kind, parent_id, student_id, teacher_id, subject, created_by) values (current_school(), $1, $2, $3, $4, $5, $6, $7) returning id`,
        [batch, r.kind, r.parent_id, r.student_id, r.teacher_id, subject, actorId]))[0];
      await q(`insert into office_messages (school_id, thread_id, sender, sender_user_id, body) values (current_school(), $1, 'office', $2, $3)`, [th.id, actorId, body]);
      ids.push(th.id);
    }
    await audit(q, actorId, "send", single ? ids[0] : null, { audience: d.aud, label, recipients: to.length, batch });
    return { to, ids, batch, label };
  });
  if ("error" in made) return { error: made.error };
  const { to, ids, batch } = made;
  let emailed = 0, held = 0, emailError: string | undefined;
  const withEmail = to.map((r, i) => ({ ...r, id: ids[i] })).filter((r) => r.email);
  if (d.email && withEmail.length) {
    // one email per kind of person (the link differs); a single person gets a link straight to their conversation
    for (const kind of ["parent", "student", "teacher"] as ToKind[]) {
      const list = withEmail.filter((r) => r.kind === kind); if (!list.length) continue;
      const r = await sendBatch(subject, body + footer(d.base, kind, list.length === 1 && ids.length === 1 ? list[0].id : null), list.map((x): Recipient => ({ name: x.name, email: x.email! })), false);
      emailed += r.sent; held += r.held ?? 0; if (r.error) emailError = r.error;
    }
    const sentIds = withEmail.map((r) => r.id);
    await withSchool(async (q) => {
      await q(`update office_messages set emailed = true where thread_id = any($1::uuid[]) and sender = 'office'`, [sentIds]);
      if (batch) await q(`update office_batches set emailed = $2, held = $3 where id = $1`, [batch, emailed, held]);
    });
  }
  return { threads: ids, batch, count: ids.length, emailed, held, noEmail: to.length - withEmail.length, emailError };
}

// ---------- the office's view ----------
export type OfficeThread = { id: string; to_kind: ToKind; name: string; email: string | null; about: string | null; subject: string; status: string; batch_id: string | null; batch: string | null;
  batch_size: number | null; last_message_at: string; last_sender: string; messages: number; unread: number; by: string | null };
const OT = `select th.id, th.to_kind,
    coalesce(p.first_name || ' ' || p.last_name, s.first_name || ' ' || s.last_name, tu.name) as name, coalesce(p.email::text, s.email::text, tu.email::text) as email,
    case when th.to_kind = 'parent' then (select first_name || ' ' || last_name from students where id = th.student_id) end as about,
    th.subject, th.status, th.batch_id, b.label as batch, b.recipients as batch_size, th.last_message_at::text,
    (select m.sender from office_messages m where m.thread_id = th.id order by m.created_at desc limit 1) as last_sender,
    (select count(*)::int from office_messages m where m.thread_id = th.id) as messages,
    (select count(*)::int from office_messages m where m.thread_id = th.id and m.sender <> 'office' and m.read_at is null) as unread, cu.name as by
  from office_threads th left join parents p on th.to_kind = 'parent' and p.id = th.parent_id left join students s on th.to_kind = 'student' and s.id = th.student_id
    left join teachers t on t.id = th.teacher_id left join users tu on tu.id = t.user_id left join office_batches b on b.id = th.batch_id left join users cu on cu.id = th.created_by`;
export async function officeThreads(show: string, batch?: string | null) {
  return withSchool((q) => q<OfficeThread>(`${OT} where ($1 = 'all' or th.status = $1 or ($1 = 'replies' and exists (select 1 from office_messages m where m.thread_id = th.id and m.sender <> 'office')))
    and ($2::uuid is null or th.batch_id = $2::uuid) order by th.last_message_at desc limit 300`, [show, batch && okId(batch) ? batch : null]));
}
export async function officeCounts() {
  return (await withSchool((q) => q<{ open: number; unread: number }>(`select (select count(*)::int from office_threads where status = 'open') as open,
    (select count(distinct thread_id)::int from office_messages where sender <> 'office' and read_at is null) as unread`)))[0] ?? { open: 0, unread: 0 };
}
export type OfficeMsg = { id: string; sender: string; who: string; body: string; emailed: boolean; created_at: string; read_at: string | null };
export async function officeThread(id: string, markRead: boolean) {
  if (!okId(id)) return null;
  return withSchool(async (q) => {
    const th = (await q<OfficeThread>(`${OT} where th.id = $1`, [id]))[0];
    if (!th) return null;
    if (markRead) await q(`update office_messages set read_at = now() where thread_id = $1 and sender <> 'office' and read_at is null`, [id]);
    const msgs = await q<OfficeMsg>(`select m.id, m.sender, case when m.sender = 'office' then coalesce(u.name, 'The office') else $2 end as who, m.body, m.emailed, m.created_at::text, m.read_at::text
      from office_messages m left join users u on u.id = m.sender_user_id where m.thread_id = $1 order by m.created_at`, [id, th.name]);
    return { th, msgs };
  });
}
export async function officeReply(actorId: string, id: string, body: string, email: boolean, base: string): Promise<{ error?: string; emailed?: boolean; held?: boolean }> {
  const t = await officeThread(id, false);
  if (!t) return { error: "That conversation wasn’t found." };
  const text = body.trim().slice(0, 4500); if (!text) return { error: "Write a message first." };
  const mid = await withSchool(async (q) => {
    if (t.th.status === "closed") await q(`update office_threads set status = 'open' where id = $1`, [id]);   // writing again reopens it
    const m = (await q<{ id: string }>(`insert into office_messages (school_id, thread_id, sender, sender_user_id, body) values (current_school(), $1, 'office', $2, $3) returning id`, [id, actorId, text]))[0];
    await q(`update office_threads set last_message_at = now() where id = $1`, [id]);
    await q(`update office_messages set read_at = now() where thread_id = $1 and sender <> 'office' and read_at is null`, [id]);
    return m.id;
  });
  if (!email || !t.th.email) return {};
  const r = await sendBatch(/^re:/i.test(t.th.subject) ? t.th.subject : `Re: ${t.th.subject}`, text + footer(base, t.th.to_kind, id), [{ name: t.th.name, email: t.th.email }], false);
  if (r.sent) await withSchool((q) => q(`update office_messages set emailed = true where id = $1`, [mid]));
  return r.error ? { error: `Saved, but the email didn’t send: ${r.error}` } : { emailed: r.sent > 0, held: (r.held ?? 0) > 0 };
}
export async function setOfficeStatus(actorId: string, id: string, status: "open" | "closed") {
  if (!okId(id)) return;
  await withSchool(async (q) => { await q(`update office_threads set status = $2 where id = $1`, [id, status]); await audit(q, actorId, status === "closed" ? "close" : "reopen", id); });
}

// ---------- the person it was sent to ----------
const OWN: Record<ToKind, string> = { parent: "th.parent_id", student: "th.student_id", teacher: "th.teacher_id" };
const who = async (q: Q, kind: ToKind, id: string) => kind !== "teacher" ? id : (await q<{ id: string }>(`select id from teachers where user_id = $1`, [id]))[0]?.id ?? null;
export type MineThread = { id: string; subject: string; status: string; about: string | null; last_at: string; last_sender: string; unread: boolean };
/** kind teacher: id is the teacher's user id; otherwise the parent's or student's id. */
export async function myOfficeThreads(kind: ToKind, id: string) {
  if (!okId(id)) return [];
  return withSchool(async (q) => {
    const me = await who(q, kind, id); if (!me) return [];
    return q<MineThread>(`select th.id, th.subject, th.status, (select first_name from students where id = th.student_id and th.to_kind = 'parent') as about, th.last_message_at::text as last_at,
        (select m.sender from office_messages m where m.thread_id = th.id order by m.created_at desc limit 1) as last_sender,
        exists (select 1 from office_messages m where m.thread_id = th.id and m.sender = 'office' and m.read_at is null) as unread
      from office_threads th where th.to_kind = $1 and ${OWN[kind]} = $2 order by th.last_message_at desc`, [kind, me]);
  });
}
export async function myOfficeThread(kind: ToKind, id: string, threadId: string, markRead: boolean) {
  if (!okId(id) || !okId(threadId)) return null;
  return withSchool(async (q) => {
    const me = await who(q, kind, id); if (!me) return null;
    const th = (await q<MineThread>(`select th.id, th.subject, th.status, (select first_name from students where id = th.student_id and th.to_kind = 'parent') as about, th.last_message_at::text as last_at, '' as last_sender, false as unread
      from office_threads th where th.id = $1 and th.to_kind = $2 and ${OWN[kind]} = $3`, [threadId, kind, me]))[0];
    if (!th) return null;
    if (markRead) await q(`update office_messages set read_at = now() where thread_id = $1 and sender = 'office' and read_at is null`, [threadId]);
    const msgs = await q<{ id: string; sender: string; who: string; body: string; at: string }>(`select m.id, m.sender, case when m.sender = 'office' then coalesce(u.name, 'The office') || ' · the office' else 'You' end as who,
      m.body, m.created_at::text as at from office_messages m left join users u on u.id = m.sender_user_id where m.thread_id = $1 order by m.created_at`, [threadId]);
    return { th, msgs };
  });
}
export async function myOfficeReply(kind: ToKind, id: string, threadId: string, body: string): Promise<string | null> {
  const text = body.trim().slice(0, 5000); if (!text) return "Write a message first.";
  const t = await myOfficeThread(kind, id, threadId, false);
  if (!t) return "That conversation wasn’t found.";
  if (t.th.status === "closed") return "This conversation is closed. The office can reopen it.";
  await withSchool(async (q) => {
    await q(`insert into office_messages (school_id, thread_id, sender, sender_user_id, body) values (current_school(), $1, $2, $3, $4)`, [threadId, kind, kind === "teacher" ? id : null, text]);
    await q(`update office_threads set last_message_at = now() where id = $1`, [threadId]);
  });
  return null;
}
