import "server-only";
import { withSchool } from "./db";
import { getNotify, type Who } from "./notify";

// 26 Nov (Alfonso): people choose on their Notifications page whether messages also come to their email, and whether
// they get a daily round-up of messages still waiting for their answer. Both are off until they tick them. (The office's
// own "Also send a copy by email" tick on replies is gone: the person's choice decides.) Emails go through the usual
// test-mode gate.
const SITE = () => (process.env.SITE_URL || "https://dev.ohsoed.co.uk").replace(/\/$/, "");
const cut = (s: string, n = 600) => { const t = s.trim(); return t.length > n ? t.slice(0, n) + "…" : t; };
type Person = Who & { name: string; email: string | null; link: string };

async function wants(w: Who, what: "messages" | "digest") { const e = (await getNotify(w).catch(() => null))?.email; return what === "messages" ? e?.messages !== false : e?.digest === true; }
async function send(to: Person, subject: string, body: string, tag: string) {
  if (!to.email) return false;
  const { sendOne } = await import("./email");
  const r = await sendOne([{ name: to.name, email: to.email }], subject, body, { tag }).catch(() => null);
  return !!r?.ok;
}
const first = (n: string) => n.split(" ")[0] || "there";

/** A new message was written: email a copy to whoever it's for, if they asked for messages by email. */
export async function emailNewMessage(kind: "family" | "office", threadId: string, sender: string, body: string, fromName?: string | null): Promise<number> {
  try {
    const { subject, people, from } = await withSchool(async (q) => {
      if (kind === "family") {
        const [t] = await q<{ subject: string; parent_id: string; parent: string; parent_email: string | null; teacher_user: string; teacher: string; teacher_email: string; student: string }>(`
          select th.subject, p.id as parent_id, p.first_name || ' ' || p.last_name as parent, p.email::text as parent_email, t.user_id as teacher_user, u.name as teacher, u.email::text as teacher_email, s.first_name as student
          from message_threads th join parents p on p.id = th.parent_id join students s on s.id = th.student_id join teachers t on t.id = th.teacher_id join users u on u.id = t.user_id where th.id = $1`, [threadId]);
        if (!t) return { subject: "", people: [] as Person[], from: "" };
        const from = sender === "parent" ? t.parent : sender === "teacher" ? t.teacher : "The office";
        const people: Person[] = sender === "parent"
          ? [{ role: "teacher", id: t.teacher_user, name: t.teacher, email: t.teacher_email, link: `/admin/teacher/messages?family=${threadId}` }]
          : [{ role: "parent", id: t.parent_id, name: t.parent, email: t.parent_email, link: `/parent/messages` }];
        return { subject: `${t.subject} (about ${t.student})`, people, from };
      }
      const [t] = await q<{ subject: string; to_kind: string; parent_id: string | null; student_id: string | null; name: string; email: string | null; teacher_user: string | null }>(`
        select th.subject, th.to_kind, th.parent_id, th.student_id, coalesce(p.first_name || ' ' || p.last_name, s.first_name || ' ' || s.last_name, tu.name) as name,
          coalesce(p.email::text, s.email::text, tu.email::text) as email, t.user_id as teacher_user
        from office_threads th left join parents p on th.to_kind = 'parent' and p.id = th.parent_id left join students s on th.to_kind = 'student' and s.id = th.student_id
          left join teachers t on t.id = th.teacher_id left join users tu on tu.id = t.user_id where th.id = $1`, [threadId]);
      if (!t) return { subject: "", people: [] as Person[], from: "" };
      if (sender !== "office") {   // a reply to the office: every admin who asked for messages by email
        const admins = await q<{ id: string; name: string; email: string }>(`select id, name, email::text from users where role = 'school_admin' and disabled_at is null`);
        return { subject: t.subject, from: t.name, people: admins.map((a): Person => ({ role: "admin", id: a.id, name: a.name, email: a.email, link: `/admin/messages?office=${threadId}` })) };
      }
      const p: Person = t.to_kind === "teacher" ? { role: "teacher", id: t.teacher_user ?? "", name: t.name, email: t.email, link: `/admin/teacher/messages?office=${threadId}` }
        : t.to_kind === "student" ? { role: "student", id: t.student_id ?? "", name: t.name, email: t.email, link: `/student/messages?o=${threadId}` }
        : { role: "parent", id: t.parent_id ?? "", name: t.name, email: t.email, link: `/parent/messages?o=${threadId}` };
      return { subject: t.subject, people: [p], from: "The office" };
    });
    let n = 0;
    for (const p of people) {
      if (!p.id || !p.email || !(await wants(p, "messages"))) continue;
      const who = fromName || from || "Someone";
      if (await send(p, `New message: ${subject}`, `Hello ${first(p.name)},\n\n${who} wrote:\n\n${cut(body)}\n\nRead and reply: ${SITE()}${p.link}\n\nYou can stop getting messages by email in your Notifications settings.`, "message-copy")) n++;
    }
    return n;
  } catch { return 0; }
}

/** The daily round-up (from the daily job): to everyone who asked for it, the conversations whose last message is waiting
 *  for their answer. Nothing is sent to someone with nothing waiting. */
export async function messageDigests(): Promise<number> {
  const subs = await withSchool((q) => q<{ key: string }>(`select key from meet_kv where key like 'notify:%' and (value->'email'->>'digest') = 'true'`)).catch(() => []);
  let sent = 0;
  for (const { key } of subs) {
    const [, k, id] = key.split(":");
    if (!id || !/^[0-9a-f-]{36}$/.test(id)) continue;
    const list = await withSchool(async (q) => {
      const last = (t: string, m: string) => `(select x.sender from ${m} x where x.thread_id = ${t}.id order by x.created_at desc limit 1)`;
      if (k === "p") {
        const [p] = await q<{ name: string; email: string | null }>(`select first_name || ' ' || last_name as name, email::text from parents where id = $1`, [id]);
        const rows = await q<{ subject: string; who: string }>(`select th.subject, 'The office' as who from office_threads th where th.to_kind = 'parent' and th.parent_id = $1 and th.status = 'open' and ${last("th", "office_messages")} = 'office'
          union all select th.subject, u.name from message_threads th join teachers t on t.id = th.teacher_id join users u on u.id = t.user_id
            where th.parent_id = $1 and th.status = 'open' and ${last("th", "messages")} in ('teacher', 'office')`, [id]);
        return p ? { person: { role: "parent", id, name: p.name, email: p.email, link: "/parent/messages" } as Person, rows } : null;
      }
      if (k === "s") {
        const [s] = await q<{ name: string; email: string | null }>(`select first_name || ' ' || last_name as name, email::text from students where id = $1`, [id]);
        const rows = await q<{ subject: string; who: string }>(`select th.subject, 'The office' as who from office_threads th where th.to_kind = 'student' and th.student_id = $1 and th.status = 'open' and ${last("th", "office_messages")} = 'office'`, [id]);
        return s ? { person: { role: "student", id, name: s.name, email: s.email, link: "/student/messages" } as Person, rows } : null;
      }
      const [u] = await q<{ name: string; email: string; role: string }>(`select name, email::text, role::text from users where id = $1 and disabled_at is null`, [id]);
      if (!u) return null;
      if (u.role === "school_admin") {
        const rows = await q<{ subject: string; who: string }>(`select th.subject, coalesce(p.first_name || ' ' || p.last_name, s.first_name || ' ' || s.last_name, tu.name, 'Someone') as who
          from office_threads th left join parents p on th.to_kind = 'parent' and p.id = th.parent_id left join students s on th.to_kind = 'student' and s.id = th.student_id
            left join teachers t on t.id = th.teacher_id left join users tu on tu.id = t.user_id
          where th.status = 'open' and ${last("th", "office_messages")} <> 'office' order by th.last_message_at`);
        return { person: { role: "admin", id, name: u.name, email: u.email, link: "/admin/messages?f=unread" } as Person, rows };
      }
      const rows = await q<{ subject: string; who: string }>(`select th.subject, 'The office' as who from office_threads th join teachers t on t.id = th.teacher_id
          where t.user_id = $1 and th.to_kind = 'teacher' and th.status = 'open' and ${last("th", "office_messages")} = 'office'
        union all select th.subject, p.first_name || ' ' || p.last_name from message_threads th join teachers t on t.id = th.teacher_id join parents p on p.id = th.parent_id
          where t.user_id = $1 and th.status = 'open' and ${last("th", "messages")} = 'parent'`, [id]);
      return { person: { role: "teacher", id, name: u.name, email: u.email, link: "/admin/teacher/messages" } as Person, rows };
    }).catch(() => null);
    if (!list || !list.rows.length) continue;
    const lines = list.rows.slice(0, 30).map((r) => `• ${r.subject} (${r.who})`).join("\n");
    if (await send(list.person, `${list.rows.length} message${list.rows.length === 1 ? "" : "s"} waiting for your reply`,
      `Hello ${first(list.person.name)},\n\nThese conversations are waiting for your reply:\n\n${lines}${list.rows.length > 30 ? `\n…and ${list.rows.length - 30} more` : ""}\n\nOpen your messages: ${SITE()}${list.person.link}\n\nYou get this daily round-up because you chose it in Notifications. You can switch it off there.`, "message-digest")) sent++;
  }
  return sent;
}
