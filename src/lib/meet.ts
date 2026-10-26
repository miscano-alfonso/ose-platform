import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { withSchool } from "./db";
import { sendHtml } from "./email";
import { ensureLessonDates } from "./ops";

// Attendance from Google Meet's own records. Google keeps a "call ended" entry for everyone who leaves a Meet call:
// their email (or name if signed out), the meeting code, the organiser and how long they stayed. Those entries are in
// the Workspace audit log for 6 months, so a whole school year can be read back. A Workspace admin connects once
// (read-only: admin.reports.audit.readonly); the site then syncs every few hours and when asked.

type Q = <T = Record<string, unknown>>(s: string, p?: unknown[]) => Promise<T[]>;
export class MeetError extends Error {}
const fail = (m: string): never => { throw new MeetError(m); };

const SCOPE = "https://www.googleapis.com/auth/admin.reports.audit.readonly";
const AUTH_URL = () => process.env.GOOGLE_AUTH_URL || "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = () => process.env.GOOGLE_TOKEN_URL || "https://oauth2.googleapis.com/token";
const REPORTS_URL = () => process.env.GOOGLE_REPORTS_URL || "https://admin.googleapis.com/admin/reports/v1/activity/users/all/applications/meet";

type Conn = { clientId?: string; clientSecret?: string; refreshToken?: string; by?: string; at?: string; pending?: { state: string; email: string; exp: number } };
export type SyncInfo = { at?: string; from?: string; to?: string; joins?: number; lessons?: number; unmatched?: number; error?: string; by?: string };
export type AlertCfg = { on: boolean; pct: number; lastSent?: string };

async function kvGet<T>(key: string, q?: Q): Promise<T | null> {
  const run = async (qq: Q) => (await qq<{ value: T }>(`select value from meet_kv where key = $1`, [key]))[0]?.value ?? null;
  return q ? run(q) : withSchool(run);
}
async function kvSet(key: string, value: unknown, q?: Q) {
  const run = (qq: Q) => value == null ? qq(`delete from meet_kv where key = $1`, [key])
    : qq(`insert into meet_kv (school_id, key, value) values (current_school(), $1, $2) on conflict (school_id, key) do update set value = excluded.value, updated_at = now()`, [key, JSON.stringify(value)]);
  await (q ? run(q) : withSchool(run));
}
const conn = async (): Promise<Conn> => {
  const c = (await kvGet<Conn>("google")) ?? {};
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) { c.clientId = process.env.GOOGLE_CLIENT_ID; c.clientSecret = process.env.GOOGLE_CLIENT_SECRET; }
  return c;
};
export const redirectUri = (base: string) => `${base}/admin/meet-api?action=callback`;

export async function meetStatus(base: string) {
  const c = await conn();
  return { hasApp: !!(c.clientId && c.clientSecret), clientId: c.clientId ?? "", fromEnv: !!process.env.GOOGLE_CLIENT_ID, connected: !!c.refreshToken,
    by: c.by ?? "", at: c.at ?? "", redirectUri: redirectUri(base), sync: (await kvGet<SyncInfo>("sync")) ?? {}, alert: await alertCfg() };
}

export async function saveApp(clientId: string, clientSecret: string) {
  clientId = clientId.trim(); clientSecret = clientSecret.trim();
  if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(clientId)) fail("Paste the Client ID: it ends in .apps.googleusercontent.com.");
  const c = (await kvGet<Conn>("google")) ?? {};
  if (!clientSecret && (c.clientId !== clientId || !c.clientSecret)) fail("Paste the Client secret too.");
  if (clientSecret && !/^[\w-]{20,80}$/.test(clientSecret)) fail("That doesn’t look like a Client secret (it usually starts GOCSPX-).");
  if (c.clientId !== clientId) { delete c.refreshToken; delete c.by; delete c.at; }
  c.clientId = clientId; if (clientSecret) c.clientSecret = clientSecret;
  await kvSet("google", c);
}
export async function disconnect(forget: boolean) {
  const c = (await kvGet<Conn>("google")) ?? {};
  if (forget) { await kvSet("google", null); return; }
  delete c.refreshToken; delete c.by; delete c.at; await kvSet("google", c);
}

export async function loginUrl(base: string, email: string): Promise<string> {
  const c = await conn();
  if (!c.clientId || !c.clientSecret) fail("Add the Google Client ID and secret first.");
  const state = randomBytes(16).toString("hex");
  const stored = (await kvGet<Conn>("google")) ?? {};
  stored.pending = { state, email, exp: Date.now() + 15 * 60000 }; await kvSet("google", stored);
  const q = new URLSearchParams({ client_id: c.clientId!, redirect_uri: redirectUri(base), response_type: "code", scope: SCOPE, access_type: "offline",
    prompt: "consent", include_granted_scopes: "true", state, login_hint: email });
  return `${AUTH_URL()}?${q}`;
}

async function token(body: Record<string, string>): Promise<Record<string, unknown>> {
  const r = await fetch(TOKEN_URL(), { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body), signal: AbortSignal.timeout(20000) });
  const j = await r.json().catch(() => ({})) as Record<string, unknown>;
  if (!r.ok) return { __error: String(j.error_description ?? j.error ?? r.status) };
  return j;
}

/** Google sends the browser back here: keep the refresh token, then check the account can read the Meet log. */
export async function callback(base: string, sp: URLSearchParams): Promise<string | null> {
  const stored = (await kvGet<Conn>("google")) ?? {}; const pend = stored.pending; delete stored.pending;
  const given = sp.get("state") || "";
  if (!pend || given.length !== pend.state.length || !timingSafeEqual(Buffer.from(given), Buffer.from(pend.state)) || Date.now() > pend.exp) { await kvSet("google", stored); return "That link has expired. Go back to Attendance and press Connect Google again."; }
  if (sp.get("error")) { await kvSet("google", stored); return "Google said: " + (sp.get("error") || "").slice(0, 200) + ". Nothing was changed."; }
  const c = await conn();
  const t = await token({ code: sp.get("code") || "", client_id: c.clientId!, client_secret: c.clientSecret!, redirect_uri: redirectUri(base), grant_type: "authorization_code" });
  if (!t.refresh_token) { await kvSet("google", stored); return "Google didn’t complete the sign-in" + (t.__error ? `: ${t.__error}` : "") + "."; }
  const test = await fetch(`${REPORTS_URL()}?eventName=call_ended&maxResults=1`, { headers: { authorization: `Bearer ${t.access_token}` }, signal: AbortSignal.timeout(20000) });
  if (!test.ok) {
    await kvSet("google", stored);
    return test.status === 403 || test.status === 401 ? "That Google account can’t read the Meet log. Sign in with a Google Workspace super admin for the school’s domain." : `Google’s Meet log answered ${test.status}. Try again.`;
  }
  stored.refreshToken = String(t.refresh_token); stored.by = pend.email; stored.at = new Date().toISOString();
  await kvSet("google", stored);
  return null;
}

async function accessToken(c: Conn): Promise<string> {
  const t = await token({ client_id: c.clientId!, client_secret: c.clientSecret!, refresh_token: c.refreshToken!, grant_type: "refresh_token" });
  if (!t.access_token) fail(String(t.__error ?? "").includes("invalid_grant") ? "Google’s connection has expired. Press Connect Google again." : "Couldn’t reach Google: " + (t.__error ?? "no token"));
  return String(t.access_token);
}

type Join = { ext: string; email: string | null; name: string | null; code: string | null; organizer: string | null; joined: Date; left: Date };
type Activity = { id?: { time?: string; uniqueQualifier?: string }; events?: { name?: string; parameters?: { name: string; value?: string; intValue?: string; boolValue?: boolean }[] }[] };
function toJoin(a: Activity): Join | null {
  const ev = a.events?.find((e) => e.name === "call_ended"); if (!ev || !a.id?.time) return null;
  const p = Object.fromEntries((ev.parameters ?? []).map((x) => [x.name, x.value ?? x.intValue ?? x.boolValue]));
  const left = new Date(a.id.time), secs = Number(p.duration_seconds ?? 0);
  if (!(secs > 0) || isNaN(+left)) return null;
  const id = String(p.identifier ?? ""), email = /@/.test(id) ? id.toLowerCase() : null;
  return { ext: `${p.conference_id ?? ""}:${p.endpoint_id ?? a.id.uniqueQualifier ?? ""}`, email, name: p.display_name ? String(p.display_name).slice(0, 120) : null,
    code: p.meeting_code ? String(p.meeting_code).toLowerCase().replace(/[^a-z]/g, "") : null, organizer: p.organizer_email ? String(p.organizer_email).toLowerCase() : null,
    joined: new Date(+left - secs * 1000), left };
}
const codeOf = (url: string | null) => { const m = /meet\.google\.com\/([a-z]{3}-?[a-z]{4}-?[a-z]{3})/i.exec(url ?? ""); return m ? m[1].toLowerCase().replace(/-/g, "") : null; };

/** Read Google's Meet log since the last sync (or the start of the school year, up to 6 months back) and work out attendance. */
export async function syncMeet(by = "auto", fromDate?: string): Promise<SyncInfo> {
  const c = await conn();
  if (!c.refreshToken) fail("Connect Google first.");
  const prev = (await kvGet<SyncInfo>("sync")) ?? {};
  const at = await accessToken(c);
  await ensureLessonDates();
  return withSchool(async (q) => {
    const yearStart = (await q<{ d: string }>(`select min(t.starts_on)::text as d from terms t join academic_years y on y.id = t.academic_year_id where y.ends_on >= current_date`))[0]?.d;
    const floor = Date.now() - 179 * 864e5;
    let from = fromDate ? Date.parse(fromDate) : prev.to ? Date.parse(prev.to) - 6 * 3600e3 : yearStart ? Date.parse(yearStart) : floor;
    if (!(from > floor)) from = floor;
    const until = new Date();
    // fetch every "call ended" entry in the window
    const joins: Join[] = []; let page = "";
    for (let i = 0; i < 200; i++) {
      const u = new URLSearchParams({ eventName: "call_ended", startTime: new Date(from).toISOString(), endTime: until.toISOString(), maxResults: "1000" });
      if (page) u.set("pageToken", page);
      const r = await fetch(`${REPORTS_URL()}?${u}`, { headers: { authorization: `Bearer ${at}` }, signal: AbortSignal.timeout(30000) });
      if (!r.ok) { const info = { ...prev, error: `Google’s Meet log answered ${r.status}.`, at: new Date().toISOString(), by }; await kvSet("sync", info, q); return info; }
      const j = await r.json() as { items?: Activity[]; nextPageToken?: string };
      for (const a of j.items ?? []) { const x = toJoin(a); if (x) joins.push(x); }
      if (!j.nextPageToken) break; page = j.nextPageToken;
    }
    // what to match them against: lessons in the window with their real start and end times, classes' Meet codes, teachers, students
    const lessons = await q<{ id: string; group_id: string; teacher_email: string | null; starts: string; ends: string; code_url: string | null }>(`
      select e.id, e.group_id, lower(u.email::text) as teacher_email, g.meet_url as code_url,
        ((e.lesson_date + s.starts_at) at time zone sc.timezone)::text as starts, ((e.lesson_date + s.ends_at) at time zone sc.timezone)::text as ends
      from lesson_events e join lesson_slots s on s.id = e.slot_id join course_groups g on g.id = e.group_id join schools sc on sc.id = e.school_id
      left join teachers t on t.id = e.teacher_id left join users u on u.id = t.user_id
      where e.status <> 'cancelled' and e.lesson_date between $1::date - 1 and $2::date + 1`, [new Date(from).toISOString().slice(0, 10), until.toISOString().slice(0, 10)]);
    const L = lessons.map((l) => ({ ...l, s: Date.parse(l.starts), e: Date.parse(l.ends), code: codeOf(l.code_url) }));
    const students = new Map((await q<{ id: string; email: string }>(`select id, lower(email::text) as email from students where email is not null`)).map((s) => [s.email, s.id]));
    const aliases = (await kvGet<Record<string, string>>("aliases", q)) ?? {};
    let saved = 0; const touched = new Set<string>();
    for (const j of joins) {
      const js = +j.joined, je = +j.left;
      const near = (l: (typeof L)[number]) => js < l.e + 30 * 60e3 && je > l.s - 30 * 60e3;
      const ov = (l: (typeof L)[number]) => Math.min(je, l.e) - Math.max(js, l.s - 15 * 60e3);
      let cand = j.code ? L.filter((l) => l.code === j.code && near(l)) : [];
      if (!cand.length && j.organizer) cand = L.filter((l) => l.teacher_email === j.organizer && near(l));
      if (!cand.length) continue;
      const lesson = cand.sort((a, b) => ov(b) - ov(a))[0];
      const sid = (j.email && (students.get(j.email) ?? aliases[j.email])) || null;
      const r = await q(`insert into meet_sessions (school_id, lesson_event_id, participant_email, display_name, student_id, joined_at, left_at, source, external_id, meeting_code, organizer_email)
        values (current_school(), $1, $2, $3, $4, $5, $6, 'meet_api', $7, $8, $9) on conflict (source, external_id) do nothing returning id`,
        [lesson.id, j.email, j.name, sid, j.joined.toISOString(), j.left.toISOString(), j.ext, j.code, j.organizer]);
      if (r.length) { saved++; touched.add(lesson.id); }
    }
    for (const id of touched) await recompute(q, id);
    const [{ n }] = await q<{ n: number }>(`select count(*)::int as n from meet_sessions ms where ms.student_id is null and not ms.ignored and ms.participant_email is distinct from ms.organizer_email
      and not exists (select 1 from users u where lower(u.email::text) = lower(ms.participant_email::text))
      and not exists (select 1 from taster_requests tr where lower(tr.child_email::text) = lower(ms.participant_email::text))`);
    const info: SyncInfo = { at: new Date().toISOString(), from: new Date(from).toISOString(), to: until.toISOString(), joins: saved, lessons: touched.size, unmatched: n, by };
    await kvSet("sync", info, q);
    return info;
  });
}

/** Marks for one lesson from its Meet joins; approved absences stay approved; a lesson anyone joined counts as taught. */
async function recompute(q: Q, eventId: string) {
  const ev = (await q<{ past: boolean }>(`select (e.lesson_date + s.ends_at) at time zone sc.timezone < now() as past from lesson_events e
    join lesson_slots s on s.id = e.slot_id join schools sc on sc.id = e.school_id where e.id = $1`, [eventId]))[0];
  if (!ev?.past) return;
  await q(`select compute_attendance($1)`, [eventId]);
  await q(`update attendance_marks m set mark = 'approved_absence' from absence_notices n
    where m.lesson_event_id = $1 and n.lesson_event_id = m.lesson_event_id and n.student_id = m.student_id and n.cancelled_at is null and m.mark = 'absent' and m.source = 'meet'`, [eventId]);
  await q(`update lesson_events set status = 'taught' where id = $1 and status = 'scheduled'`, [eventId]);
  // a taster child who joined the Meet with the Google account given when booking came
  await q(`update taster_bookings b set status = 'attended' from taster_requests r where r.id = b.request_id and b.lesson_event_id = $1 and b.status = 'booked'
    and exists (select 1 from meet_sessions ms where ms.lesson_event_id = $1 and lower(ms.participant_email::text) = lower(r.child_email::text))`, [eventId]);
}

// ---------- the office checks joins that couldn't be matched (signed out, or a personal Google account) ----------
export type UnmatchedJoin = { id: string; lesson_event_id: string; who: string; email: string | null; lesson: string; date: string; at: string; minutes: number;
  roster: { id: string; name: string; mark: string | null }[] };
export async function unmatchedJoins(): Promise<UnmatchedJoin[]> {
  return withSchool((q) => q<UnmatchedJoin>(`select ms.id, ms.lesson_event_id, coalesce(ms.display_name, ms.participant_email::text, 'Someone signed out') as who, ms.participant_email::text as email,
      l.name || ' ' || sj.name as lesson, e.lesson_date::text as date, to_char(ms.joined_at at time zone sc.timezone, 'HH24:MI') as at,
      greatest(1, round(extract(epoch from (coalesce(ms.left_at, ms.joined_at) - ms.joined_at)) / 60))::int as minutes,
      coalesce((select json_agg(json_build_object('id', st.id, 'name', st.first_name || ' ' || st.last_name, 'mark', m.mark) order by st.first_name)
        from enrolments x join students st on st.id = x.student_id left join attendance_marks m on m.lesson_event_id = e.id and m.student_id = st.id
        where x.group_id = e.group_id and x.status = 'active' and not x.is_taster), '[]') as roster
    from meet_sessions ms join lesson_events e on e.id = ms.lesson_event_id join course_groups g on g.id = e.group_id join levels l on l.id = g.level_id
    join subjects sj on sj.id = g.subject_id join schools sc on sc.id = ms.school_id
    where ms.student_id is null and not ms.ignored and ms.participant_email is distinct from ms.organizer_email
      and not exists (select 1 from users u where lower(u.email::text) = lower(ms.participant_email::text))
      and not exists (select 1 from taster_requests tr where lower(tr.child_email::text) = lower(ms.participant_email::text))
    order by e.lesson_date desc, ms.joined_at limit 100`));
}
/** The office says who a join was. With an email, later joins from that email are matched to the same student automatically. */
export async function matchJoin(actorId: string, sessionId: string, studentId: string | null): Promise<string | null> {
  return withSchool(async (q) => {
    const s = (await q<{ lesson_event_id: string; participant_email: string | null; display_name: string | null }>(`select lesson_event_id, participant_email::text, display_name from meet_sessions where id = $1`, [sessionId]))[0];
    if (!s) return "That join wasn’t found.";
    if (!studentId) {
      await q(`update meet_sessions set ignored = true, matched_by = $2 where id = $1`, [sessionId, actorId]);
    } else {
      const ok = await q(`select 1 from enrolments x join lesson_events e on e.group_id = x.group_id where e.id = $1 and x.student_id = $2`, [s.lesson_event_id, studentId]);
      if (!ok.length) return "Choose a student in that class.";
      if (s.participant_email) {
        await q(`update meet_sessions set student_id = $2, matched_by = $3 where participant_email = $1 and student_id is null`, [s.participant_email, studentId, actorId]);
        const al = (await kvGet<Record<string, string>>("aliases", q)) ?? {}; al[s.participant_email.toLowerCase()] = studentId; await kvSet("aliases", al, q);
      } else await q(`update meet_sessions set student_id = $2, matched_by = $3 where id = $1`, [sessionId, studentId, actorId]);
      const evs = await q<{ id: string }>(`select distinct lesson_event_id as id from meet_sessions where student_id = $1 and matched_by = $2`, [studentId, actorId]);
      for (const e of evs) await recompute(q, e.id);
    }
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'match', 'meet_session', $2, $3)`,
      [actorId, sessionId, JSON.stringify({ student: studentId })]);
    return null;
  });
}

// ---------- weekly alert ----------
export async function alertCfg(): Promise<AlertCfg> { return { on: true, pct: 50, ...((await kvGet<AlertCfg>("alert")) ?? {}) }; }
export async function saveAlert(on: boolean, pct: number) {
  const a = await alertCfg(); await kvSet("alert", { ...a, on, pct: Math.min(95, Math.max(10, Math.round(pct / 5) * 5 || 50)) });
}
async function sendAlert(a: AlertCfg) {
  const rows = await withSchool((q) => q<{ name: string; level: string; pct: number; lessons: number }>(`select st.first_name || ' ' || st.last_name as name,
      (select string_agg(distinct l.name, ', ') from enrolments x join course_groups g on g.id = x.group_id join levels l on l.id = g.level_id where x.student_id = st.id and x.status = 'active') as level,
      a.attendance_pct as pct, a.lessons from student_term_attendance a join students st on st.id = a.student_id
    where a.term_id = (select id from terms where current_date between starts_on and ends_on limit 1) and a.attendance_pct < $1 order by a.attendance_pct, st.first_name`, [a.pct]));
  const admins = await withSchool((q) => q<{ email: string }>(`select email::text from users where role = 'school_admin' and disabled_at is null`));
  if (!rows.length || !admins.length) return;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  const html = `<p>${rows.length} student${rows.length === 1 ? " is" : "s are"} below ${a.pct}% attendance this term (from Google Meet).</p><table cellpadding="6" style="border-collapse:collapse">
    <tr><th align="left">Student</th><th align="left">Level</th><th align="right">Attendance</th></tr>${rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.level ?? "")}</td><td align="right">${r.pct}% of ${r.lessons}</td></tr>`).join("")}</table>
    <p>See Admin → Attendance for each lesson.</p>`;
  await sendHtml(`Attendance below ${a.pct}%: ${rows.length} student${rows.length === 1 ? "" : "s"}`, html, admins.map((x) => x.email), "attendance-alert");
}

/** Runs after admin pages load and from the daily job: syncs if the last sync is over 3 hours old, and sends the Friday alert once. */
export async function meetBackground() {
  try {
    const c = await conn(); if (!c.refreshToken) return;
    const s = (await kvGet<SyncInfo>("sync")) ?? {};
    if (!s.at || Date.now() - Date.parse(s.at) > 3 * 3600e3) await syncMeet("auto");
    const a = await alertCfg();
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map((p) => [p.type, p.value]));
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
    if (a.on && parts.weekday === "Fri" && Number(parts.hour) >= 16 && a.lastSent !== today) {
      await kvSet("alert", { ...a, lastSent: today }); await sendAlert(a);
    }
  } catch (e) { console.error("meet background", e); }
}
