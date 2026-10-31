import "server-only";
import { withSchool } from "./db";

type Q = <T = Record<string, unknown>>(s: string, p?: unknown[]) => Promise<T[]>;
const audit = (q: Q, a: string, act: string, ent: string, id: string | null, d: unknown = {}) =>
  q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, $2, $3, $4, $5)`, [a, act, ent, id, JSON.stringify(d)]);

// ================= messages between parents, teachers and the office =================
export type Thread = { id: string; subject: string; status: string; parent: string; parent_email: string; student: string; teacher: string; started_by: string;
  last_message_at: string; last_sender: string | null; messages: number; office_copied: boolean };
const THREADS = `select th.id, th.subject, th.status, p.first_name || ' ' || p.last_name as parent, p.email::text as parent_email, s.first_name || ' ' || s.last_name as student,
    u.name as teacher, th.started_by, th.last_message_at::text, th.office_copied,
    (select m.sender from messages m where m.thread_id = th.id order by m.created_at desc limit 1) as last_sender,
    (select count(*)::int from messages m where m.thread_id = th.id) as messages
  from message_threads th join parents p on p.id = th.parent_id join students s on s.id = th.student_id join teachers t on t.id = th.teacher_id join users u on u.id = t.user_id`;

export async function listThreads(teacherUserId: string | null, show: string) {
  return withSchool((q) => q<Thread>(`${THREADS} where ($1::uuid is null or t.user_id = $1::uuid) and ($2 = 'all' or th.status = $2)
    order by th.last_message_at desc limit 200`, [teacherUserId, show]));
}

export type Msg = { id: string; sender: string; who: string; body: string; created_at: string };
export async function getThread(id: string) {
  return withSchool(async (q) => {
    const th = (await q<Thread & { teacher_user: string }>(`${THREADS.replace("u.name as teacher,", "u.name as teacher, t.user_id as teacher_user,")} where th.id = $1`, [id]))[0];
    if (!th) return null;
    const msgs = await q<Msg>(`select m.id, m.sender, coalesce(su.name, case m.sender when 'parent' then (select first_name || ' ' || last_name from parents where id = th.parent_id) else 'Office' end) as who,
        m.body, m.created_at::text from messages m join message_threads th on th.id = m.thread_id left join users su on su.id = m.sender_user_id where m.thread_id = $1 order by m.created_at`, [id]);
    return { th, msgs };
  });
}

export async function replyThread(actor: { id: string; role: string }, id: string, body: string, asOffice: boolean): Promise<string | null> {
  try {
    return await withSchool(async (q) => {
      const th = (await q<{ teacher_user: string; status: string }>(`select t.user_id as teacher_user, th.status from message_threads th join teachers t on t.id = th.teacher_id where th.id = $1`, [id]))[0];
      if (!th) return "That conversation wasn’t found.";
      const isTeacher = th.teacher_user === actor.id;
      if (!isTeacher && actor.role !== "school_admin") return "You can’t reply to this conversation.";
      const sender = isTeacher && !asOffice ? "teacher" : "office";
      if (th.status === "closed" && sender !== "office") return "This conversation is closed.";
      await q(`insert into messages (school_id, thread_id, sender, sender_user_id, body, read_by_teacher_at) values (current_school(), $1, $2, $3, $4, case when $2 = 'teacher' then now() end)`, [id, sender, actor.id, body]);
      await audit(q, actor.id, "reply", "message_thread", id, { sender });
      return null;
    });
  } catch (e) { return (e as Error).message.includes("closed") ? "This conversation is closed." : "Couldn’t send that message."; }
}

export async function setThreadStatus(actorId: string, id: string, status: "open" | "closed") {
  await withSchool(async (q) => { await q(`update message_threads set status = $2 where id = $1`, [id, status]); await audit(q, actorId, status === "closed" ? "close" : "reopen", "message_thread", id); });
}

/** A teacher writes to the parent of a student they teach. */
export async function startThread(actorId: string, studentId: string, subject: string, body: string): Promise<{ id?: string; error?: string }> {
  try {
    return await withSchool(async (q) => {
      const r = (await q<{ teacher_id: string; parent_id: string }>(`select t.id as teacher_id, s.parent_id from teachers t, students s where t.user_id = $1 and s.id = $2`, [actorId, studentId]))[0];
      if (!r) return { error: "Only teachers can start a conversation with a family." };
      const th = (await q<{ id: string }>(`insert into message_threads (school_id, parent_id, teacher_id, student_id, subject, started_by) values (current_school(), $1, $2, $3, $4, 'teacher') returning id`,
        [r.parent_id, r.teacher_id, studentId, subject]))[0];
      await q(`insert into messages (school_id, thread_id, sender, sender_user_id, body, read_by_teacher_at) values (current_school(), $1, 'teacher', $2, $3, now())`, [th.id, actorId, body]);
      await audit(q, actorId, "start", "message_thread", th.id);
      return { id: th.id };
    });
  } catch (e) { return { error: (e as Error).message.includes("who teach") ? "You can only write about students in your classes." : "Couldn’t start the conversation." }; }
}

export async function myStudents(userId: string) {
  return withSchool((q) => q<{ id: string; name: string; class: string }>(`select distinct on (s.id) s.id, s.first_name || ' ' || s.last_name as name, l.name || ' ' || sj.name as class
    from course_groups g join teachers t on t.id = g.teacher_id join enrolments e on e.group_id = g.id and e.status = 'active' and not e.is_taster join students s on s.id = e.student_id
    join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id where t.user_id = $1 order by s.id, s.first_name`, [userId]));
}

// ================= student chat (moderation) =================
export async function ensureClassChats() {
  await withSchool((q) => q(`insert into student_chats (school_id, kind, group_id) select g.school_id, 'class', g.id from course_groups g join academic_years y on y.id = g.academic_year_id
    where y.ends_on >= current_date and g.status <> 'closed' and not exists (select 1 from student_chats c where c.group_id = g.id)`));
}
export async function chatOverview() {
  await ensureClassChats();
  return withSchool(async (q) => ({
    chats: await q<{ id: string; kind: string; name: string; messages: number; last_at: string | null }>(`select c.id, c.kind,
        case when c.kind = 'class' then l.name || ' ' || sj.name || ' (' || g.code || ')'
             else (select string_agg(s.first_name || ' ' || s.last_name, ' & ' order by s.first_name) from student_chat_members m join students s on s.id = m.student_id where m.chat_id = c.id) end as name,
        (select count(*)::int from student_chat_messages x where x.chat_id = c.id) as messages, (select max(created_at)::text from student_chat_messages x where x.chat_id = c.id) as last_at
      from student_chats c left join course_groups g on g.id = c.group_id left join levels l on l.id = g.level_id left join subjects sj on sj.id = g.subject_id
      order by (select max(created_at) from student_chat_messages x where x.chat_id = c.id) desc nulls last, c.kind, l.sort_order, sj.name`),
    reports: await q<{ id: string; message_id: string; chat_id: string; thread: string; body: string; sender: string; reporter: string; created_at: string }>(`select r.id, r.message_id, m.chat_id, coalesce(m.parent_id, m.id) as thread, m.body,
        coalesce(ss.first_name || ' ' || ss.last_name, 'Teacher') as sender, rs.first_name || ' ' || rs.last_name as reporter, r.created_at::text
      from student_chat_reports r join student_chat_messages m on m.id = r.message_id left join students ss on ss.id = m.sender_student_id join students rs on rs.id = r.reported_by
      where r.status = 'open' order by r.created_at`),
    words: (await q<{ word: string }>(`select word::text from chat_blocked_words order by word`)).map((w) => w.word),
  }));
}
export async function chatMessages(chatId: string) {
  return withSchool((q) => q<{ id: string; who: string; body: string; hidden: boolean; created_at: string }>(`select m.id,
      coalesce(s.first_name || ' ' || s.last_name, tu.name, case when m.sender_office then 'Office' end) as who, m.body, m.hidden_at is not null as hidden, m.created_at::text
    from student_chat_messages m left join students s on s.id = m.sender_student_id left join teachers t on t.id = m.sender_teacher_id left join users tu on tu.id = t.user_id
    where m.chat_id = $1 order by m.created_at desc limit 200`, [chatId]));
}
export async function setHidden(actorId: string, messageId: string, hide: boolean) {
  await withSchool(async (q) => {
    await q(`update student_chat_messages set hidden_at = case when $2 then now() end, hidden_by = case when $2 then $3::uuid end where id = $1`, [messageId, hide, actorId]);
    await q(`update student_chat_reports set status = case when $2 then 'hidden' else status end, resolved_by = $3 where message_id = $1 and status = 'open'`, [messageId, hide, actorId]);
    await audit(q, actorId, hide ? "hide" : "unhide", "chat_message", messageId);
  });
}
export async function dismissReport(actorId: string, id: string) {
  await withSchool(async (q) => { await q(`update student_chat_reports set status = 'no_action', resolved_by = $2 where id = $1`, [id, actorId]); await audit(q, actorId, "dismiss", "chat_report", id); });
}
export async function officePost(actorId: string, chatId: string, body: string, th: { parent: string | null; topic: string | null } = { parent: null, topic: null }): Promise<string | null> {
  try { await withSchool(async (q) => { await q(`insert into student_chat_messages (school_id, chat_id, sender_office, body, parent_id, topic) values (current_school(), $1, true, $2, $3, $4)`, [chatId, body, th.parent, th.topic]); await audit(q, actorId, "post", "student_chat", chatId); }); return null; }
  catch (e) { return (e as Error).message.includes("not allowed") ? "That message contains a blocked word." : "Couldn’t post that."; }
}
export async function setWords(actorId: string, words: string[]) {
  await withSchool(async (q) => {
    await q(`delete from chat_blocked_words`);
    if (words.length) await q(`insert into chat_blocked_words (school_id, word) select current_school(), w from unnest($1::text[]) w on conflict do nothing`, [words]);
    await audit(q, actorId, "words", "chat_blocked_words", null, { n: words.length });
  });
}

// ================= rewards =================
const TERM_NOW = `(select id from terms where ends_on >= current_date - 21 order by starts_on limit 1)`;
export async function rewardsOverview(termId: string | null) {
  return withSchool(async (q) => {
    const terms = await q<{ id: string; name: string; ends_on: string; ended: boolean; winners: number }>(`select t.id, t.name, t.ends_on::text, t.ends_on < current_date as ended,
      (select count(*)::int from reward_winners w where w.term_id = t.id) as winners from terms t join academic_years y on y.id = t.academic_year_id where y.ends_on >= current_date order by t.number`);
    const term = terms.find((t) => t.id === termId) ?? (await q<{ id: string }>(`select ${TERM_NOW} as id`)).map((r) => terms.find((t) => t.id === r.id))[0] ?? terms[0];
    const board = term ? await q<{ student_id: string; name: string; points: number; rank: number }>(`select lb.student_id, s.first_name || ' ' || s.last_name as name, lb.points::int, lb.rank::int
      from term_leaderboard($1) lb join students s on s.id = lb.student_id where lb.points > 0 order by lb.rank, s.first_name limit 15`, [term.id]) : [];
    const recent = await q<{ id: string; student: string; teacher: string; class: string; points: number; reason: string; awarded_on: string }>(`select rp.id, s.first_name || ' ' || s.last_name as student,
        u.name as teacher, l.name || ' ' || sj.name as class, rp.points, rp.reason, rp.awarded_on::text from reward_points rp join students s on s.id = rp.student_id
      join teachers t on t.id = rp.teacher_id join users u on u.id = t.user_id join course_groups g on g.id = rp.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
      order by rp.created_at desc limit 30`);
    const prizes = await q<{ place: number; description: string }>(`select place, description from reward_prizes order by place`);
    const winners = term ? await q<{ id: string; place: number; name: string; points: number; prize: string; parent_emailed_at: string | null; gift_sent_at: string | null }>(`select w.id, w.place,
      s.first_name || ' ' || s.last_name as name, w.points, w.prize, w.parent_emailed_at::text, w.gift_sent_at::text from reward_winners w join students s on s.id = w.student_id where w.term_id = $1 order by w.place`, [term.id]) : [];
    return { terms, term, board, recent, prizes, winners };
  });
}
export async function setPrizes(actorId: string, prizes: string[]) {
  await withSchool(async (q) => {
    for (let i = 0; i < 3; i++) {
      if (prizes[i]) await q(`insert into reward_prizes (school_id, place, description) values (current_school(), $1::int, $2) on conflict (school_id, place) do update set description = excluded.description`, [i + 1, prizes[i]]);
      else await q(`delete from reward_prizes where place = $1::int`, [i + 1]);
    }
    await audit(q, actorId, "prizes", "reward_prizes", null, { prizes });
  });
}
export async function confirmWinners(actorId: string, termId: string): Promise<string | null> {
  try { await withSchool(async (q) => { await q(`select confirm_reward_winners($1)`, [termId]); await audit(q, actorId, "confirm", "reward_winners", termId); }); return null; }
  catch (e) { const m = (e as Error).message; return m.includes("tie") ? "There’s a tie for a prize place, so the winners need choosing by hand." : m.includes("ended") ? "Winners can be confirmed once the term has ended." : m.includes("already") ? "Winners are already confirmed for this term." : "Couldn’t confirm the winners."; }
}
export async function markWinner(actorId: string, id: string, field: "parent_emailed_at" | "gift_sent_at") {
  await withSchool(async (q) => { await q(`update reward_winners set ${field} = coalesce(${field}, now()) where id = $1`, [id]); await audit(q, actorId, field, "reward_winner", id); });
}

/** Points are given by the class teacher; an admin gives them on the class teacher's behalf. */
export async function givePoints(actor: { id: string; role: string }, groupId: string, studentId: string, points: number, reason: string): Promise<string | null> {
  try {
    return await withSchool(async (q) => {
      const g = (await q<{ teacher_id: string | null; teacher_user: string | null }>(`select g.teacher_id, t.user_id as teacher_user from course_groups g left join teachers t on t.id = g.teacher_id where g.id = $1`, [groupId]))[0];
      if (!g?.teacher_id) return "This class has no teacher set.";
      if (actor.role !== "school_admin" && g.teacher_user !== actor.id) return "You can only give points in your own classes.";
      await q(`insert into reward_points (school_id, student_id, teacher_id, group_id, points, reason) values (current_school(), $1, $2, $3, $4::int, $5)`, [studentId, g.teacher_id, groupId, points, reason]);
      await audit(q, actor.id, "points", "reward_points", studentId, { points, reason });
      return null;
    });
  } catch { return "Couldn’t give those points. The student must be in the class."; }
}
export async function classesForPoints(userId: string, admin: boolean) {
  return withSchool((q) => q<{ group_id: string; class: string; students: { id: string; name: string; term_points: number }[] }>(`select g.id as group_id, l.name || ' ' || sj.name || ' (' || g.code || ')' as class,
      coalesce((select json_agg(json_build_object('id', s.id, 'name', s.first_name || ' ' || s.last_name, 'term_points',
        coalesce((select sum(rp.points) from reward_points rp where rp.student_id = s.id and rp.awarded_on between (select starts_on from terms where id = ${TERM_NOW}) and (select ends_on from terms where id = ${TERM_NOW})), 0)) order by s.first_name)
        from enrolments e join students s on s.id = e.student_id where e.group_id = g.id and e.status = 'active' and not e.is_taster), '[]') as students
    from course_groups g join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id join academic_years y on y.id = g.academic_year_id
    left join teachers t on t.id = g.teacher_id where y.ends_on >= current_date and ($2 or t.user_id = $1)
      and exists (select 1 from enrolments e where e.group_id = g.id and e.status = 'active') order by l.sort_order, sj.name`, [userId, admin]));
}
