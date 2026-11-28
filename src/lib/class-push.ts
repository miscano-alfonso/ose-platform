import "server-only";
import { withSchool } from "./db";
import { fillBody, fillEmail } from "./automations";
import { DAYS } from "./format";

// 28 Nov (Alfonso: "see what classes could do with a sales push if they're low on numbers … sell to current cohort not
// doing a specific course, and seeing if they are interested in a taster? mainly for KS3 and Pre-GCSE").
// Marketing → Fill a class: the emptiest classes; for one, the families who could take it (current students at the same
// level who don't do that subject, and families on its waiting list), and one email inviting each to a free taster with a
// link that has the class (and the child) already chosen. Each send is kept (class_pushes), and tasters booked from its
// link are tied back to it, so the page shows tasters and enrolments that came of it.

type Q = <T = Record<string, unknown>>(s: string, p?: unknown[]) => Promise<T[]>;
export type Candidate = { key: string; kind: "student" | "waiting"; child: string; child_first: string; parent: string; parent_first: string; email: string;
  student_id: string | null; parent_id: string | null; opted: boolean; opted_out: boolean; takes: string | null; clash: string | null; invited_at: string | null; had_taster: boolean };
export type PushSummary = { id: string; created_at: string; by: string | null; sent: number; held: number; failed: number; tasters: number; enrolled: number };

export const DEFAULT_SUBJECT = "A free taster of {{class}} for {{child}}?";
export const DEFAULT_BODY = "Dear {{parent}},\n\nWe have places in our **{{class}}** class ({{times}}, with {{teacher}}), and we thought {{child}} might enjoy it.\n\n{{child}} is welcome to join one of the lessons for free, to see what it’s like:\n\n👉 [Book a free taster]({{taster_link}})\n\nIf you have any questions, just reply to this email.\n\nKind regards,\n{{school}}";
export const FIELDS = ["parent", "child", "class", "times", "teacher", "taster_link", "school"];

const LIVE = `select e.student_id, e.group_id from enrolments e where e.status in ('pending', 'active') and not e.is_taster`;

/** For each class, how many current students at its level don't take its subject (who could be invited). */
export async function candidateCounts(groupIds: string[]): Promise<Record<string, number>> {
  if (!groupIds.length) return {};
  const rows = await withSchool((q) => q<{ id: string; n: number }>(`with live as (${LIVE})
    select g.id, count(distinct x.student_id)::int as n from course_groups g
      join course_groups gx on gx.academic_year_id = g.academic_year_id and gx.level_id = g.level_id join live x on x.group_id = gx.id
    where g.id = any($1::uuid[]) and not exists (select 1 from live y join course_groups gy on gy.id = y.group_id
      where y.student_id = x.student_id and gy.level_id = g.level_id and gy.subject_id = g.subject_id and gy.academic_year_id = g.academic_year_id)
    group by g.id`, [groupIds]));
  return Object.fromEntries(rows.map((r) => [r.id, r.n]));
}

/** The families who could be invited to try this class. */
export async function candidates(groupId: string): Promise<Candidate[]> {
  return withSchool(async (q) => {
    const kids = await q<Candidate>(`with g as (select id, level_id, subject_id, academic_year_id from course_groups where id = $1), live as (${LIVE}),
      pool as (select distinct x.student_id from g join course_groups gx on gx.academic_year_id = g.academic_year_id and gx.level_id = g.level_id join live x on x.group_id = gx.id
        where not exists (select 1 from live y join course_groups gy on gy.id = y.group_id where y.student_id = x.student_id and gy.level_id = g.level_id and gy.subject_id = g.subject_id and gy.academic_year_id = g.academic_year_id))
      select 's:' || s.id as key, 'student' as kind, s.first_name || ' ' || s.last_name as child, s.first_name as child_first, p.first_name || ' ' || p.last_name as parent, p.first_name as parent_first,
        p.email::text as email, s.id as student_id, p.id as parent_id, coalesce(p.marketing_opt_in, false) as opted, (not coalesce(p.marketing_opt_in, false) and p.marketing_changed_at is not null) as opted_out,
        (select string_agg(distinct coalesce(nullif(sj.short_name, ''), sj.name), ', ') from live x join course_groups gx on gx.id = x.group_id join subjects sj on sj.id = gx.subject_id
          where x.student_id = s.id and gx.academic_year_id = g.academic_year_id) as takes,
        (select string_agg(distinct coalesce(nullif(sj.short_name, ''), sj.name) || ' (' || (array['','Mon','Tue','Wed','Thu','Fri','Sat','Sun'])[a.weekday + 1] || ' ' || to_char(a.starts_at, 'HH24:MI') || ')', ', ')
          from live x join course_groups gx on gx.id = x.group_id join subjects sj on sj.id = gx.subject_id join lesson_slots a on a.group_id = gx.id and a.one_off_on is null
          join lesson_slots b on b.group_id = g.id and b.one_off_on is null and b.weekday = a.weekday and b.starts_at < a.ends_at and a.starts_at < b.ends_at
          where x.student_id = s.id and gx.id <> g.id) as clash,
        (select max(r.sent_at)::text from class_push_recipients r join class_pushes cp on cp.id = r.push_id where r.student_id = s.id and cp.group_id = g.id and r.status <> 'failed') as invited_at,
        exists (select 1 from taster_requests tr join taster_bookings tb on tb.request_id = tr.id join lesson_events le on le.id = tb.lesson_event_id join course_groups g4 on g4.id = le.group_id
          where g4.level_id = g.level_id and g4.subject_id = g.subject_id and tb.status <> 'cancelled' and (tr.student_id = s.id or lower(tr.child_email::text) = lower(s.email::text))) as had_taster
      from g, pool join students s on s.id = pool.student_id join parents p on p.id = s.parent_id
      where p.email is not null order by s.first_name, s.last_name`, [groupId]);
    const waiting = await q<Candidate>(`with g as (select id, level_id, subject_id, academic_year_id from course_groups where id = $1)
      select 'w:' || w.id as key, 'waiting' as kind, w.child_name as child, split_part(trim(w.child_name), ' ', 1) as child_first, w.parent_name as parent, split_part(trim(w.parent_name), ' ', 1) as parent_first,
        w.email::text as email, null as student_id, (select id from parents p where p.email = w.email) as parent_id, true as opted, false as opted_out, null as takes, null as clash,
        (select max(r.sent_at)::text from class_push_recipients r join class_pushes cp on cp.id = r.push_id where lower(r.email::text) = lower(w.email::text) and lower(r.child_name) = lower(w.child_name) and cp.group_id = g.id and r.status <> 'failed') as invited_at,
        false as had_taster
      from g join waitlist_entries w on w.enrolled_at is null and (w.group_id = g.id or (w.group_id is null and w.level_id = g.level_id and w.subject_id = g.subject_id))
      order by w.created_at`, [groupId]);
    // someone on the waiting list who is already a current student shows once
    const seen = new Set(kids.map((k) => `${k.email.toLowerCase()}|${k.child_first.toLowerCase()}`));
    return [...kids, ...waiting.filter((w) => !seen.has(`${w.email.toLowerCase()}|${w.child_first.toLowerCase()}`))];
  });
}

/** Ticked to start with: they haven't said no to marketing emails, nothing clashes, they haven't had a taster of it, and
 *  they weren't asked in the last 30 days. */
export const startTicked = (c: Candidate) => !c.opted_out && !c.clash && !c.had_taster && !(c.invited_at && Date.parse(c.invited_at) > Date.now() - 30 * 864e5);

/** Past sends for a class, with what came of them. */
export async function pushHistory(groupId?: string): Promise<(PushSummary & { group_id: string })[]> {
  return withSchool((q) => q(`select cp.id, cp.group_id, cp.created_at::text, u.name as by,
      (select count(*) from class_push_recipients r where r.push_id = cp.id and r.status = 'sent')::int as sent,
      (select count(*) from class_push_recipients r where r.push_id = cp.id and r.status = 'held')::int as held,
      (select count(*) from class_push_recipients r where r.push_id = cp.id and r.status = 'failed')::int as failed,
      (select count(distinct tr.id) from taster_requests tr where tr.push_id = cp.id)::int as tasters,
      (select count(distinct tr.id) from taster_requests tr join taster_bookings b on b.request_id = tr.id join taster_journey tj on tj.id = b.id
        where tr.push_id = cp.id and (tj.enrolled_at is not null or b.status = 'booked_course'))::int as enrolled
    from class_pushes cp left join users u on u.id = cp.created_by ${groupId ? "where cp.group_id = $1" : ""} order by cp.created_at desc`, groupId ? [groupId] : []));
}

async function classFacts(q: Q, groupId: string) {
  return (await q<{ cls: string; level: string; subject: string; teacher: string | null; times: string | null; school: string; base: string | null }>(`
    select l.name || ' ' || sj.name as cls, l.name as level, sj.name as subject, u.name as teacher,
      (select string_agg(to_char(s.starts_at, 'HH24:MI') || '|' || s.weekday, ',' order by s.weekday, s.starts_at) from lesson_slots s where s.group_id = g.id and s.one_off_on is null) as times,
      sc.name as school, (select value #>> '{}' from social_kv where key = 'base') as base
    from course_groups g join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id join schools sc on sc.id = g.school_id
      left join teachers t on t.id = g.teacher_id left join users u on u.id = t.user_id where g.id = $1`, [groupId]))[0];
}
const timesText = (t: string | null) => (t ?? "").split(",").filter(Boolean).map((x) => { const [hm, wd] = x.split("|"); return `${DAYS[+wd]}s at ${hm}`; }).join(" and ") || "times to be confirmed";

/** The words for one family, for the preview and the send. */
export function words(f: NonNullable<Awaited<ReturnType<typeof classFacts>>>, c: Pick<Candidate, "parent_first" | "child_first" | "student_id">, pushId: string, base: string) {
  const link = `${base}/taster?${new URLSearchParams({ level: f.level, subject: f.subject, ...(c.student_id ? { child: c.student_id } : {}), push: pushId })}`;
  return { parent: c.parent_first || "there", child: c.child_first || "your child", class: f.cls, times: timesText(f.times), teacher: f.teacher ?? "one of our teachers", taster_link: link, school: f.school };
}

export async function previewFor(groupId: string, c: Candidate | undefined, subject: string, body: string) {
  return withSchool(async (q) => {
    const f = await classFacts(q, groupId); if (!f) return null;
    const base = (process.env.SITE_URL || f.base || "").replace(/\/$/, "");
    const v = words(f, c ?? { parent_first: "Laura", child_first: "Sam", student_id: null }, "…", base);
    return { subject: fillEmail(subject, v), body: fillBody(body, v), cls: f.cls, times: timesText(f.times), teacher: f.teacher, school: f.school };
  });
}

/** Sends the invitation to the chosen families (or, with `testTo`, one example to the admin). */
export async function sendPush(actorId: string, groupId: string, keys: string[], subject: string, body: string, testTo?: { email: string; name: string }): Promise<{ sent: number; held: number; failed: number; error?: string }> {
  const { sendOne } = await import("./email");
  const list = await candidates(groupId), chosen = list.filter((c) => keys.includes(c.key));
  if (!testTo && !chosen.length) return { sent: 0, held: 0, failed: 0, error: "Tick at least one family." };
  const facts = await withSchool((q) => classFacts(q, groupId));
  if (!facts) return { sent: 0, held: 0, failed: 0, error: "That class wasn’t found." };
  const base = (process.env.SITE_URL || facts.base || "").replace(/\/$/, "");
  if (!base) return { sent: 0, held: 0, failed: 0, error: "The website address isn’t set, so the taster link can’t be made." };
  if (testTo) {
    const c = chosen[0] ?? list[0], v = words(facts, c ?? { parent_first: testTo.name.split(" ")[0], child_first: "Sam", student_id: null }, "test", base);
    const r = await sendOne([testTo], `[Test] ${fillEmail(subject, v)}`, `(Test: this is how ${c ? `${c.parent}’s` : "a family’s"} email will look. Only you received it.)\n\n${fillBody(body, v)}`, { tag: "class-push-test" });
    return r.ok ? { sent: 1, held: 0, failed: 0 } : { sent: 0, held: 0, failed: 1, error: r.error };
  }
  const push = (await withSchool((q) => q<{ id: string }>(`insert into class_pushes (school_id, group_id, subject, body, created_by) values (current_school(), $1, $2, $3, $4) returning id`, [groupId, subject, body, actorId])))[0];
  let sent = 0, held = 0, failed = 0;
  for (const c of chosen) {
    const v = words(facts, c, push.id, base);
    const r = await sendOne([{ email: c.email, name: c.parent }], fillEmail(subject, v), fillBody(body, v), { tag: "class-push" }).catch((e) => ({ ok: false, ids: [], error: String(e) } as { ok: boolean; ids: string[]; error?: string; held?: number }));
    const st = r.ok ? ((r as { held?: number }).held ? "held" : "sent") : "failed";
    if (st === "sent") sent++; else if (st === "held") held++; else failed++;
    await withSchool((q) => q(`insert into class_push_recipients (school_id, push_id, parent_id, student_id, child_name, email, status, error) values (current_school(), $1, $2, $3, $4, $5, $6, $7)`,
      [push.id, c.parent_id, c.student_id, c.child, c.email, st, r.ok ? null : (r.error ?? "").slice(0, 300)]));
  }
  await withSchool((q) => q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'class_push', 'course_group', $2, $3)`,
    [actorId, groupId, JSON.stringify({ push: push.id, sent, held, failed })]));
  return { sent, held, failed };
}
