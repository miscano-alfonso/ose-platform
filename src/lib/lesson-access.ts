import "server-only";
import { withSchool } from "./db";
import { googleAccess, recCanLive } from "./meet";
import { meetingCode } from "./meet-live";

// Who gets into lessons (5 Nov). Three parts:
// 1. "Join through the dashboard" (off until the school switches it on): lesson reminders link to /join/<class> without
//    the signed link, so the student has to be signed in to their own account; parents and anyone else are turned away.
// 2. Each class's Google Meet setting (Open / Trusted / Restricted), read from the Meet API with the recordings account
//    (ose@), which hosts the lessons. Read-only: the setting itself is changed in Meet.
// 3. Who was in a lesson's Meet but isn't one of that class's students (an unknown account, someone the office marked
//    "not a student", or a student from another class), from the Meet log the attendance sync already reads.

type Q = <T = Record<string, unknown>>(s: string, p?: unknown[]) => Promise<T[]>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AccessSettings = { viaDashboard: boolean };
export async function accessSettings(q?: Q): Promise<AccessSettings> {
  const run = async (qq: Q) => (await qq<{ value: Partial<AccessSettings> }>(`select value from meet_kv where key = 'lesson_access'`))[0]?.value ?? {};
  const v = q ? await run(q) : await withSchool(run).catch(() => ({} as Partial<AccessSettings>));
  return { viaDashboard: v.viaDashboard === true };
}
export async function saveAccessSettings(actorId: string, s: AccessSettings) {
  await withSchool(async (q) => {
    await q(`insert into meet_kv (school_id, key, value) values (current_school(), 'lesson_access', $1) on conflict (school_id, key) do update set value = excluded.value, updated_at = now()`, [JSON.stringify(s)]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'lesson_access', 'school', null, $2)`, [actorId, JSON.stringify(s)]);
  });
}

/** Is this student booked on this class (or booked for a taster in it)? */
export async function onClass(groupId: string, studentId: string): Promise<boolean> {
  if (!UUID.test(groupId) || !UUID.test(studentId)) return false;
  return withSchool(async (q) => (await q<{ ok: boolean }>(`select exists (select 1 from enrolments where group_id = $1 and student_id = $2 and (status in ('active', 'pending') or is_taster)) as ok`, [groupId, studentId]))[0]?.ok ?? false);
}

/** Note a press of a Join button, against the class's lesson that is about to start or under way (if any). */
export async function logJoinClick(groupId: string, studentId: string | null, who: "student" | "staff" | "parent" | "link" | "nobody", letIn: boolean) {
  if (!UUID.test(groupId) || (studentId && !UUID.test(studentId))) return;
  await withSchool((q) => q(`insert into lesson_join_clicks (school_id, group_id, lesson_event_id, student_id, who, let_in)
    select current_school(), g.id, (select e.id from lesson_events e join lesson_slots s on s.id = e.slot_id join schools sc on sc.id = e.school_id
        where e.group_id = g.id and e.status <> 'cancelled' and e.lesson_date between current_date - 1 and current_date + 1
          and now() >= ((e.lesson_date + s.starts_at) at time zone sc.timezone) - interval '30 minutes' and now() <= ((e.lesson_date + s.ends_at) at time zone sc.timezone)
        order by abs(extract(epoch from (((e.lesson_date + s.starts_at) at time zone sc.timezone) - now()))) limit 1), $2, $3, $4
    from course_groups g where g.id = $1`, [groupId, studentId, who, letIn])).catch((e) => console.error("join click", e));
}

/** A Meet link that opens in the student's own Google account (if it's signed in on that device), else the link as it is. */
export function meetAs(link: string, email: string | null): string {
  if (!email || !/^[^@\s]+@[^@\s]+$/.test(email)) return link;
  try { const u = new URL(link); if (!/(^|\.)meet\.google\.com$/i.test(u.hostname)) return link; u.searchParams.set("authuser", email); return u.toString(); }
  catch { return link; }
}

// ---------- 2. each class's Meet setting ----------
export type MeetAccessType = "OPEN" | "TRUSTED" | "RESTRICTED";
export type ClassAccess = { gid: string; cls: string; code: string; teacher: string | null; link: string; meet: string | null; access: MeetAccessType | null; problem: string | null };
type Stored = { at: string; items: Record<string, { meet: string; access: MeetAccessType | null; problem: string | null }> };
const API = () => (process.env.MEET_API_URL || "https://meet.googleapis.com/v2").replace(/\/$/, "");

/** Every class this year with a Meet link and its access setting. Google is asked again when `refresh`, or when the last check is 6+ hours old. */
export async function meetAccess(refresh = false): Promise<{ at: string | null; can: "ok" | "none" | "reconnect"; rows: ClassAccess[] }> {
  const [groups, stored, can] = await Promise.all([
    withSchool((q) => q<{ gid: string; cls: string; code: string; teacher: string | null; link: string }>(`select g.id as gid, l.name || ' ' || sj.name as cls, g.code, u.name as teacher, g.meet_url as link
      from course_groups g join academic_years y on y.id = g.academic_year_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
      left join teachers t on t.id = g.teacher_id left join users u on u.id = t.user_id
      where y.ends_on >= current_date and g.status <> 'closed' and g.meet_url is not null and g.meet_url <> '' order by l.sort_order, sj.name, g.code`).catch(() => [])),
    withSchool((q) => q<{ value: Stored }>(`select value from meet_kv where key = 'meet_access'`)).then((r) => r[0]?.value ?? null).catch(() => null),
    recCanLive().catch(() => "none" as const)]);
  const dup = new Map<string, number>(); for (const g of groups) dup.set(g.cls, (dup.get(g.cls) ?? 0) + 1);
  const named = groups.map((g) => ({ ...g, cls: (dup.get(g.cls) ?? 0) > 1 ? `${g.cls} (${g.code})` : g.cls }));
  let st = stored;
  const stale = !st || Date.now() - Date.parse(st.at) > 6 * 3600e3 || named.some((g) => !st!.items[g.gid] || st!.items[g.gid].meet !== meetingCode(g.link));
  if (can === "ok" && (refresh || stale)) {
    const items: Stored["items"] = {};
    let token: string | null = null;
    try { token = await googleAccess("rec"); } catch { token = null; }
    for (const g of named) {
      const code = meetingCode(g.link);
      if (!code) { items[g.gid] = { meet: "", access: null, problem: "not a Google Meet link" }; continue; }
      if (!token) { items[g.gid] = { meet: code, access: null, problem: "couldn’t reach Google" }; continue; }
      try {
        const r = await fetch(`${API()}/spaces/${encodeURIComponent(code)}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
        if (!r.ok) { items[g.gid] = { meet: code, access: null, problem: r.status === 403 ? "Google didn’t let the school account see this Meet (is it hosted by ose@?)" : r.status === 404 ? "Google doesn’t know this Meet code" : `Google Meet answered ${r.status}` }; continue; }
        const j = (await r.json()) as { config?: { accessType?: string } };
        const a = j.config?.accessType;
        items[g.gid] = { meet: code, access: a === "OPEN" || a === "TRUSTED" || a === "RESTRICTED" ? a : null, problem: a ? null : "Google didn’t say" };
      } catch { items[g.gid] = { meet: code, access: null, problem: "couldn’t reach Google" }; }
    }
    st = { at: new Date().toISOString(), items };
    await withSchool((q) => q(`insert into meet_kv (school_id, key, value) values (current_school(), 'meet_access', $1) on conflict (school_id, key) do update set value = excluded.value, updated_at = now()`, [JSON.stringify(st)])).catch(() => null);
  }
  return { at: st?.at ?? null, can, rows: named.map((g) => ({ ...g, meet: meetingCode(g.link), access: st?.items[g.gid]?.access ?? null, problem: st?.items[g.gid]?.problem ?? null })) };
}

// ---------- 3. people in lessons who aren't on that class's register ----------
export type Stranger = { ev: string; gid: string; date: string; cls: string; teacher: string | null; who: string; email: string | null; joined: string; left: string | null;
  kind: "unknown" | "not_student" | "other_class"; student: string | null; maybe: string | null };
// staff, the host's own Google domain and taster children are never strangers (the same rule as Check Meet joins)
const NOT_STAFF = `ms.participant_email is distinct from ms.organizer_email
  and not exists (select 1 from users u where lower(u.email::text) = lower(ms.participant_email::text))
  and split_part(lower(coalesce(ms.participant_email::text, '')), '@', 2) is distinct from split_part(lower(coalesce(ms.organizer_email::text, '-@-')), '@', 2)
  and not exists (select 1 from taster_requests tr where lower(tr.child_email::text) = lower(ms.participant_email::text))`;
const PKEY = `coalesce('e:' || lower(ms.participant_email::text), 'n:' || lower(ms.display_name), 's:' || ms.id::text)`;

export async function strangers(days = 14): Promise<Stranger[]> {
  return withSchool(async (q) => {
    const rows = await q<Omit<Stranger, "maybe"> & { cls_code: string }>(`with s as (
        select ms.lesson_event_id as ev, ${PKEY} as k, min(ms.joined_at) as joined, max(ms.left_at) as left_at,
          coalesce(max(ms.display_name), max(ms.participant_email::text), 'Someone signed out') as who, max(ms.participant_email::text) as email,
          bool_or(ms.ignored) as ignored, (array_agg(ms.student_id) filter (where ms.student_id is not null))[1] as sid
        from meet_sessions ms join lesson_events e on e.id = ms.lesson_event_id
        where ms.source <> 'checkin' and e.lesson_date >= current_date - $1::int and ${NOT_STAFF}
        group by 1, 2)
      select s.ev, e.group_id as gid, e.lesson_date::text as date, l.name || ' ' || sj.name as cls, g.code as cls_code, u.name as teacher, s.who, s.email, s.joined::text as joined, s.left_at::text as left,
        case when s.sid is null and s.ignored then 'not_student' when s.sid is null then 'unknown' else 'other_class' end as kind,
        st.first_name || ' ' || st.last_name as student
      from s join lesson_events e on e.id = s.ev join course_groups g on g.id = e.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
      left join teachers t on t.id = e.teacher_id left join users u on u.id = t.user_id left join students st on st.id = s.sid
      where s.sid is null or not exists (select 1 from enrolments x where x.group_id = e.group_id and x.student_id = s.sid)
      order by s.joined desc limit 200`, [days]);
    if (!rows.length) return [];
    // a clue for unknown accounts: a student of the class pressed Join shortly before, and isn't otherwise in that lesson's Meet log
    const evs = [...new Set(rows.filter((r) => r.kind === "unknown").map((r) => r.ev))];
    const [clicks, present] = evs.length ? await Promise.all([
      q<{ ev: string; sid: string; at: string; name: string }>(`select c.lesson_event_id as ev, c.student_id as sid, c.created_at::text as at, st.first_name || ' ' || st.last_name as name
        from lesson_join_clicks c join students st on st.id = c.student_id where c.lesson_event_id = any($1::uuid[]) and c.who in ('student', 'link') and c.let_in`, [evs]),
      q<{ ev: string; sid: string }>(`select distinct lesson_event_id as ev, student_id as sid from meet_sessions where lesson_event_id = any($1::uuid[]) and student_id is not null and source <> 'checkin'`, [evs])])
      : [[], []];
    const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
    return rows.map(({ cls_code: _c, ...r }) => {
      if (r.kind !== "unknown") return { ...r, maybe: null };
      const t = Date.parse(r.joined);
      const near = clicks.filter((c) => c.ev === r.ev && !present.some((p) => p.ev === r.ev && p.sid === c.sid) && Date.parse(c.at) <= t + 60e3 && t - Date.parse(c.at) < 10 * 60e3);
      const names = [...new Set(near.map((c) => c.name))];
      return { ...r, maybe: names.length === 1 ? `${names[0]} pressed Join at ${hm(near[0].at)} and isn’t otherwise in this lesson’s Meet log` : null };
    });
  });
}

/** For the dashboard: in the last `days` days, how many people who aren't on the register were in lessons, and classes left open. */
export async function accessAlerts(days = 7): Promise<{ strangers: number; open: number }> {
  const [s, a] = await Promise.all([strangers(days).catch(() => []), withSchool((q) => q<{ value: Stored }>(`select value from meet_kv where key = 'meet_access'`)).then((r) => r[0]?.value ?? null).catch(() => null)]);
  return { strangers: s.length, open: a ? Object.values(a.items).filter((x) => x.access === "OPEN").length : 0 };
}
