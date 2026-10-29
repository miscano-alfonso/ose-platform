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

const G = "https://www.googleapis.com/auth/";
// The school connection (a Workspace super admin): the Meet log, plus Google Classroom read-only (classes, rosters, work and marks).
export const CLASSROOM_SCOPES = ["classroom.courses.readonly", "classroom.rosters.readonly", "classroom.coursework.students.readonly", "classroom.profile.emails"].map((x) => G + x);
const SCOPE = [G + "admin.reports.audit.readonly", ...CLASSROOM_SCOPES].join(" ");
// The school inbox (the mailbox families reply to): read-only, so replies from families show in Admin → Email → Inbox.
const GMAIL_SCOPE = G + "gmail.readonly " + G + "gmail.send " + G + "gmail.modify"; // read the inbox; send replies; keep read/unread in step with Gmail (and Mail apps)
// The recordings account (ose@, which owns the Meet recordings and teaches every Classroom): Drive, and posting recordings to Classroom.
const REC_SCOPE = ["drive", "classroom.courses.readonly", "classroom.coursework.students", "classroom.courseworkmaterials", "classroom.announcements.readonly",
  "classroom.rosters.readonly", "classroom.rosters", "classroom.profile.emails"].map((x) => G + x).join(" ");
export type GKind = "gmail" | "gmail2" | "rec"; // gmail2: another inbox to read (e.g. a person’s own address next to the school’s)
const AUTH_URL = () => process.env.GOOGLE_AUTH_URL || "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = () => process.env.GOOGLE_TOKEN_URL || "https://oauth2.googleapis.com/token";
const REPORTS_URL = () => process.env.GOOGLE_REPORTS_URL || "https://admin.googleapis.com/admin/reports/v1/activity/users/all/applications/meet";

type Conn = { clientId?: string; clientSecret?: string; refreshToken?: string; by?: string; at?: string; scopes?: string; pending?: { state: string; email: string; exp: number; kind?: GKind } };
export type Mailbox = { refreshToken?: string; mailbox?: string; by?: string; at?: string; scopes?: string };
export type SyncInfo = { at?: string; from?: string; to?: string; joins?: number; lessons?: number; unmatched?: number; people?: number; error?: string; by?: string; fetched?: number; placed?: number; lessonsInWindow?: number };
/** Meet calls Google reported that didn't line up with any timetabled lesson, grouped by meeting code (so the office can say which class it is). */
export type Unplaced = { code: string; organizer: string | null; joins: number; first: string; last: string; when: string[]; slots?: Record<string, number>; days?: Record<string, string[]> };
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

export async function loginUrl(base: string, email: string, kind?: GKind): Promise<string> {
  const c = await conn();
  if (!c.clientId || !c.clientSecret) fail("Add the Google Client ID and secret first.");
  const state = randomBytes(16).toString("hex");
  const stored = (await kvGet<Conn>("google")) ?? {};
  stored.pending = { state, email, exp: Date.now() + 15 * 60000, ...(kind ? { kind } : {}) }; await kvSet("google", stored);
  const q = new URLSearchParams({ client_id: c.clientId!, redirect_uri: redirectUri(base), response_type: "code", scope: kind === "gmail" || kind === "gmail2" ? GMAIL_SCOPE : kind === "rec" ? REC_SCOPE : SCOPE, access_type: "offline",
    prompt: "consent select_account", include_granted_scopes: "true", state });
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
  if (pend.kind === "rec") {
    await kvSet("google", stored);
    const ab = await fetch(`${DRIVE_URL()}/about?fields=user`, { headers: { authorization: `Bearer ${t.access_token}` }, signal: AbortSignal.timeout(20000) });
    if (!ab.ok) return ab.status === 403 ? "Google wouldn’t let the site use Drive: turn on the Google Drive API (and the Google Classroom API) for the project, then try again." : `Drive answered ${ab.status}. Try again.`;
    const account = String(((await ab.json()) as { user?: { emailAddress?: string } }).user?.emailAddress ?? "").toLowerCase();
    const sc = String(t.scope ?? "");
    if (sc && !sc.includes("courseworkmaterials")) return "Google didn’t give permission to post to Classroom. Press Connect again and tick every box.";
    await kvSet("rec_google", { refreshToken: String(t.refresh_token), mailbox: account, by: pend.email, at: new Date().toISOString(), scopes: sc } satisfies Mailbox);
    return null;
  }
  if (pend.kind === "gmail" || pend.kind === "gmail2") {
    await kvSet("google", stored);
    const pr = await fetch(`${GMAIL_URL()}/users/me/profile`, { headers: { authorization: `Bearer ${t.access_token}` }, signal: AbortSignal.timeout(20000) });
    if (!pr.ok) return pr.status === 403 ? "Google wouldn’t let the site read that inbox. In Google Cloud Console turn on the Gmail API for the project, then try again." : `Gmail answered ${pr.status}. Try again.`;
    const mailbox = String(((await pr.json()) as { emailAddress?: string }).emailAddress ?? "").toLowerCase();
    const box = { refreshToken: String(t.refresh_token), mailbox, by: pend.email, at: new Date().toISOString(), scopes: String(t.scope ?? "") } satisfies Mailbox;
    const first = await kvGet<Mailbox>("gmail");
    if (pend.kind === "gmail" || !first?.refreshToken || first.mailbox === mailbox) { await kvSet("gmail", box); return null; }
    const more = ((await kvGet<Mailbox[]>("gmail_more")) ?? []).filter((m) => m.mailbox !== mailbox);
    await kvSet("gmail_more", [...more, box].slice(0, 4));
    return null;
  }
  const test = await fetch(`${REPORTS_URL()}?eventName=call_ended&maxResults=1`, { headers: { authorization: `Bearer ${t.access_token}` }, signal: AbortSignal.timeout(20000) });
  if (!test.ok) {
    await kvSet("google", stored);
    return test.status === 403 || test.status === 401 ? "That Google account can’t read the Meet log. Sign in with a Google Workspace super admin for the school’s domain." : `Google’s Meet log answered ${test.status}. Try again.`;
  }
  stored.refreshToken = String(t.refresh_token); stored.by = pend.email; stored.at = new Date().toISOString(); stored.scopes = String(t.scope ?? "");
  await kvSet("google", stored);
  return null;
}

export const GMAIL_URL = () => process.env.GMAIL_API_URL || "https://gmail.googleapis.com/gmail/v1";
export const DRIVE_URL = () => process.env.DRIVE_API_URL || "https://www.googleapis.com/drive/v3";
/** An access token for one of the extra inboxes, from its own refresh token. */
export async function mailboxAccess(refreshToken: string): Promise<string> { return accessToken({ ...(await conn()), refreshToken }); }
/** An access token for the school connection ("google") or the school inbox ("gmail"). */
export async function googleAccess(kind: "google" | GKind): Promise<string> {
  const c = await conn();
  const rt = kind === "gmail" ? (await kvGet<Mailbox>("gmail"))?.refreshToken : kind === "rec" ? (await kvGet<Mailbox>("rec_google"))?.refreshToken : c.refreshToken;
  if (!rt) fail(kind === "gmail" ? "Connect the school inbox first." : kind === "rec" ? "Connect the recordings account (ose@) first." : "Connect Google first.");
  return accessToken({ ...c, refreshToken: rt });
}
/** Can the recordings account (ose@) send and withdraw Classroom invitations? "none": not connected; "reconnect": connected before that permission was asked for. */
export async function recCanInvite(): Promise<"ok" | "reconnect" | "none"> {
  const m = await kvGet<Mailbox>("rec_google"); if (!m?.refreshToken) return "none";
  return (m.scopes ?? "").split(/\s+/).includes(G + "classroom.rosters") ? "ok" : "reconnect";
}
export async function googleKv<T>(key: string): Promise<T | null> { return kvGet<T>(key); }
export async function googleKvSet(key: string, v: unknown) { await kvSet(key, v); }
export async function classroomGranted(): Promise<boolean | null> { const c = await conn(); if (!c.refreshToken) return null; return CLASSROOM_SCOPES.every((x) => (c.scopes ?? "").includes(x)); }
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
    const notLessons = new Set((await kvGet<string[]>("not_lessons", q)) ?? []);
    let saved = 0, placed = 0; const touched = new Set<string>();
    const unplaced = new Map<string, Unplaced>();
    const DOW: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
    // the lesson a join belongs to, as "weekday|HH:MM": the join time rounded to the nearest quarter hour (people join a few minutes early or late)
    const slotKey = (d: Date) => { const r = new Date(Math.round(+d / 900e3) * 900e3);
      const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/London" }).formatToParts(r).map((x) => [x.type, x.value]));
      return `${DOW[p.weekday] ?? 0}|${p.hour}:${p.minute}`; };
    const whenOf = (d: Date) => new Intl.DateTimeFormat("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }).format(d);
    for (const j of joins) {
      const js = +j.joined, je = +j.left;
      const near = (l: (typeof L)[number]) => js < l.e + 30 * 60e3 && je > l.s - 30 * 60e3;
      const ov = (l: (typeof L)[number]) => Math.min(je, l.e) - Math.max(js, l.s - 15 * 60e3);
      let cand = j.code ? L.filter((l) => l.code === j.code && near(l)) : [];
      if (!cand.length && j.organizer) cand = L.filter((l) => l.teacher_email === j.organizer && near(l));
      if (!cand.length) {
        if (j.code && notLessons.has(j.code)) continue;
        const key = j.code ?? `?${j.organizer ?? ""}`, u = unplaced.get(key) ?? { code: j.code ?? "", organizer: j.organizer, joins: 0, first: j.joined.toISOString(), last: j.joined.toISOString(), when: [] };
        u.joins++; if (j.joined.toISOString() < u.first) u.first = j.joined.toISOString(); if (j.joined.toISOString() > u.last) u.last = j.joined.toISOString();
        const w = whenOf(j.joined); if (u.when.length < 6 && !u.when.includes(w)) u.when.push(w);
        const sk = slotKey(j.joined); u.slots = u.slots ?? {}; u.slots[sk] = (u.slots[sk] ?? 0) + 1;
        const dk = j.joined.toLocaleDateString("en-CA", { timeZone: "Europe/London" }); u.days = u.days ?? {}; const dl = (u.days[sk] = u.days[sk] ?? []); if (!dl.includes(dk) && dl.length < 30) dl.push(dk);
        unplaced.set(key, u); continue;
      }
      placed++;
      const lesson = cand.sort((a, b) => ov(b) - ov(a))[0];
      const sid = (j.email && (students.get(j.email) ?? aliases[j.email])) || null;
      const r = await q(`insert into meet_sessions (school_id, lesson_event_id, participant_email, display_name, student_id, joined_at, left_at, source, external_id, meeting_code, organizer_email)
        values (current_school(), $1, $2, $3, $4, $5, $6, 'meet_api', $7, $8, $9) on conflict (source, external_id) do nothing returning id`,
        [lesson.id, j.email, j.name, sid, j.joined.toISOString(), j.left.toISOString(), j.ext, j.code, j.organizer]);
      if (r.length) { saved++; touched.add(lesson.id); }
    }
    // joins we couldn't tie to a student by email: try the name they joined with against the class list
    for (const id of await matchByParent(q)) touched.add(id);
    for (const id of await matchByName(q, aliases)) touched.add(id);
    await kvSet("aliases", aliases, q);
    for (const id of touched) await recompute(q, id);
    const [{ n }] = await q<{ n: number }>(`select count(*)::int as n from meet_sessions ms where ms.student_id is null and not ms.ignored and ms.participant_email is distinct from ms.organizer_email
      and not exists (select 1 from users u where lower(u.email::text) = lower(ms.participant_email::text))
      and split_part(lower(coalesce(ms.participant_email::text, '')), '@', 2) is distinct from split_part(lower(coalesce(ms.organizer_email::text, '-@-')), '@', 2)
      and not exists (select 1 from taster_requests tr where lower(tr.child_email::text) = lower(ms.participant_email::text))`);
    // remember calls that didn't fit a lesson (merged with earlier syncs) so the office can link them to a class
    const prevU = (await kvGet<Unplaced[]>("unplaced", q)) ?? [];
    const codes = new Set(L.map((l) => l.code).filter(Boolean));
    // a re-read from a chosen date starts the list again; a routine sync adds to it
    const merged = new Map(fromDate ? [] : prevU.filter((u) => !codes.has(u.code) && !notLessons.has(u.code)).map((u) => [u.code || `?${u.organizer ?? ""}`, u]));
    for (const [k, u] of unplaced) { const m = merged.get(k); merged.set(k, m ? { ...m, joins: m.joins + u.joins, first: m.first < u.first ? m.first : u.first, last: m.last > u.last ? m.last : u.last, when: [...new Set([...m.when, ...u.when])].slice(0, 6),
      slots: Object.fromEntries([...new Set([...Object.keys(m.slots ?? {}), ...Object.keys(u.slots ?? {})])].map((k) => [k, (m.slots?.[k] ?? 0) + (u.slots?.[k] ?? 0)])),
      days: Object.fromEntries([...new Set([...Object.keys(m.days ?? {}), ...Object.keys(u.days ?? {})])].map((k) => [k, [...new Set([...(m.days?.[k] ?? []), ...(u.days?.[k] ?? [])])]])) } : u); }
    await kvSet("unplaced", [...merged.values()].sort((a, b) => b.joins - a.joins).slice(0, 60), q);
    const people = (await q<{ p: number }>(`select count(distinct ${PKEY})::int as p from meet_sessions ms where ${UNMATCHED}`))[0].p;
    const info: SyncInfo = { at: new Date().toISOString(), from: new Date(from).toISOString(), to: until.toISOString(), joins: saved, lessons: touched.size, unmatched: n, people, by, fetched: joins.length, placed, lessonsInWindow: L.length };
    await kvSet("sync", info, q);
    return info;
  });
}

/** Marks for one lesson from its Meet joins; approved absences stay approved; a lesson anyone joined counts as taught. */
export async function recompute(q: Q, eventId: string) {
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
      and split_part(lower(coalesce(ms.participant_email::text, '')), '@', 2) is distinct from split_part(lower(coalesce(ms.organizer_email::text, '-@-')), '@', 2)
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

export async function unplacedCalls(): Promise<Unplaced[]> { return (await kvGet<Unplaced[]>("unplaced")) ?? []; }
/** The office says which class a Meet code belongs to: it becomes the class's Meet link, and the next re-read places its joins. */
export async function assignCode(actorId: string, code: string, groupId: string): Promise<string | null> {
  if (!/^[a-z]{10}$/.test(code)) return "That meeting code isn’t valid.";
  const url = `https://meet.google.com/${code.slice(0, 3)}-${code.slice(3, 7)}-${code.slice(7)}`;
  return withSchool(async (q) => {
    const r = await q(`update course_groups set meet_url = $2 where id = $1 returning id`, [groupId, url]);
    if (!r.length) return "Choose a class.";
    const u = ((await kvGet<Unplaced[]>("unplaced", q)) ?? []).filter((x) => x.code !== code);
    await kvSet("unplaced", u, q);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'meet_link', 'course_group', $2, $3)`, [actorId, groupId, JSON.stringify({ url })]);
    return null;
  });
}

/** A Meet code that isn't a lesson (staff meeting, parents' call, one-off): hidden from the list and skipped from now on. */
export async function notALesson(actorId: string, code: string): Promise<void> {
  if (!/^[a-z]{10}$/.test(code)) return;
  await withSchool(async (q) => {
    const n = new Set((await kvGet<string[]>("not_lessons", q)) ?? []); n.add(code); await kvSet("not_lessons", [...n], q);
    await kvSet("unplaced", ((await kvGet<Unplaced[]>("unplaced", q)) ?? []).filter((x) => x.code !== code), q);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'meet_not_lesson', 'meet', null, $2)`, [actorId, JSON.stringify({ code })]);
  });
}

/** The weekly times a Meet code is really used: the quarter-hours that account for most joins (ignoring one-offs). */
export function usualTimes(u: Unplaced): { weekday: number; time: string }[] {
  const e = Object.entries(u.slots ?? {}).filter(([k]) => !k.startsWith("0|")).sort((a, b) => b[1] - a[1]);
  const top = e[0]?.[1] ?? 0, out: { weekday: number; time: string }[] = [];
  for (const [k, n] of e) {
    if (n < Math.max(3, top * 0.25)) continue;
    if (u.days && (u.days[k]?.length ?? 0) < 2) continue;
    const [wd, t] = k.split("|"), mins = +t.slice(0, 2) * 60 + +t.slice(3);
    if (out.some((o) => o.weekday === +wd && Math.abs(+o.time.slice(0, 2) * 60 + +o.time.slice(3) - mins) <= 30)) continue;   // same lesson, people joined either side of the quarter
    out.push({ weekday: +wd, time: t });
  }
  return out.sort((a, b) => a.weekday - b.weekday || a.time.localeCompare(b.time));
}
/** Set classes' weekly lesson times to the times their Meet codes are really used. All chosen classes are cleared first, so
 *  wrong example times can't clash with each other. Returns what changed and anything that couldn't be placed. */
export async function timesFromMeet(actorId: string, codes: string[]): Promise<{ done: string[]; problems: string[] }> {
  const all = await unplacedCalls(), done: string[] = [], problems: string[] = [];
  const { ensureLessonDates } = await import("./ops");
  await withSchool(async (q) => {
    const year = (await q<{ id: string }>(`select id from academic_years where ends_on >= current_date order by starts_on limit 1`))[0]?.id;
    const jobs: { gid: string; code: string; minutes: number; teacher: string | null; times: { weekday: number; time: string }[] }[] = [];
    for (const c of codes) {
      const u = all.find((x) => x.code === c); if (!u) continue;
      const url = `https://meet.google.com/${c.slice(0, 3)}-${c.slice(3, 7)}-${c.slice(7)}`;
      const g = (await q<{ id: string; code: string; minutes: number; teacher: string | null }>(`select id, code, lesson_minutes as minutes, teacher_id as teacher from course_groups where meet_url = $1 and academic_year_id = $2 limit 1`, [url, year]))[0];
      const times = usualTimes(u);
      if (!g) { problems.push(`${c}: no class has this Meet link`); continue; }
      if (!times.length) { problems.push(`${g.code}: not enough calls to tell the usual times`); continue; }
      jobs.push({ gid: g.id, code: g.code, minutes: g.minutes || 45, teacher: g.teacher, times });
    }
    // clear first (only lessons nobody has marked yet are lost), then add the real times
    for (const j of jobs) {
      await q(`delete from lesson_events e where e.group_id = $1 and not exists (select 1 from attendance_marks m where m.lesson_event_id = e.id)
        and not exists (select 1 from taster_bookings b where b.lesson_event_id = e.id) and not exists (select 1 from absence_notices n where n.lesson_event_id = e.id)`, [j.gid]);
      await q(`delete from lesson_slots s where s.group_id = $1 and not exists (select 1 from lesson_events e where e.slot_id = s.id)`, [j.gid]);
    }
    const D = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    for (const j of jobs) {
      const ok: string[] = [];
      for (const t of j.times) {
        try {
          await q(`savepoint s1`);
          await q(`insert into lesson_slots (school_id, academic_year_id, group_id, teacher_id, weekday, starts_at, ends_at) values (current_school(), $1, $2, $3, $4::int, $5::time, $5::time + make_interval(mins => $6::int))`,
            [year, j.gid, j.teacher, t.weekday, t.time, j.minutes]);
          await q(`release savepoint s1`); ok.push(`${D[t.weekday]} ${t.time}`);
        } catch { await q(`rollback to savepoint s1`); problems.push(`${j.code} ${D[t.weekday]} ${t.time}: the teacher is already teaching then`); }
      }
      await q(`update course_groups set status = 'open' where id = $1 and status = 'hidden'`, [j.gid]);
      await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'times_from_meet', 'course_group', $2, $3)`, [actorId, j.gid, JSON.stringify(ok)]);
      if (ok.length) done.push(`${j.code}: ${ok.join(", ")}`);
    }
  });
  await ensureLessonDates();
  return { done, problems };
}

const norm = (x: string) => x.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
/** Match joins with no student to a student in that lesson's class by the name shown in Meet (full name, or a first name only one child
 *  in the class has). Each matched email is remembered, so later joins from it match straight away. Returns the lessons changed. */
async function matchByName(q: Q, aliases: Record<string, string>): Promise<string[]> {
  const rows = await q<{ id: string; ev: string; email: string | null; name: string | null; roster: { id: string; first: string; last: string; known: string | null }[] }>(`
    select ms.id, ms.lesson_event_id as ev, lower(ms.participant_email::text) as email, ms.display_name as name,
      coalesce((select json_agg(json_build_object('id', s.id, 'first', s.first_name, 'last', s.last_name, 'known', s.known_as)) from enrolments x join students s on s.id = x.student_id
        where x.group_id = e.group_id and x.status in ('active','completed','cancelled','swapped') and not x.is_taster), '[]') as roster
    from meet_sessions ms join lesson_events e on e.id = ms.lesson_event_id
    where (ms.student_id is null or (ms.matched_by is null and not exists (select 1 from enrolments x where x.group_id = e.group_id and x.student_id = ms.student_id)))
      and not ms.ignored and ms.display_name is not null and ms.participant_email is distinct from ms.organizer_email
      and not exists (select 1 from users u where lower(u.email::text) = lower(ms.participant_email::text))
      and split_part(lower(coalesce(ms.participant_email::text, '')), '@', 2) is distinct from split_part(lower(coalesce(ms.organizer_email::text, '-@-')), '@', 2)
      and not exists (select 1 from taster_requests tr where lower(tr.child_email::text) = lower(ms.participant_email::text))`);
  const changed = new Set<string>();
  for (const r of rows) {
    const n = norm(r.name ?? ""); if (!n) continue;
    const parts = n.split(" ");
    let hit = r.roster.filter((s) => norm(`${s.first} ${s.last}`) === n || (s.known && norm(`${s.known} ${s.last}`) === n));
    if (!hit.length) hit = r.roster.filter((s) => norm(s.first) === parts[0] && (parts.length === 1 || norm(s.last).startsWith(parts[parts.length - 1].slice(0, 1))));
    if (!hit.length) hit = r.roster.filter((s) => norm(s.first) === parts[0] || (s.known && norm(s.known) === parts[0]));
    if (hit.length !== 1) continue;
    await q(`update meet_sessions set student_id = $2 where id = $1`, [r.id, hit[0].id]);
    if (r.email && !aliases[r.email]) aliases[r.email] = hit[0].id;   // a shared family email stays with the first child it matched; the name decides each time
    changed.add(r.ev);
  }
  return [...changed];
}

// ---------- unmatched joins grouped by person: match someone once and every lesson they joined is updated ----------
const UNMATCHED = `ms.student_id is null and not ms.ignored and ms.participant_email is distinct from ms.organizer_email
      and not exists (select 1 from users u where lower(u.email::text) = lower(ms.participant_email::text))
      and split_part(lower(coalesce(ms.participant_email::text, '')), '@', 2) is distinct from split_part(lower(coalesce(ms.organizer_email::text, '-@-')), '@', 2)
      and not exists (select 1 from taster_requests tr where lower(tr.child_email::text) = lower(ms.participant_email::text))`;
const PKEY = `coalesce('e:' || lower(ms.participant_email::text), 'n:' || lower(ms.display_name), 's:' || ms.id::text)`;
export type UnmatchedPerson = { key: string; who: string; email: string | null; joins: number; lessons: number; first: string; last: string; classes: string;
  roster: { id: string; name: string; cls: string; absent: number }[] };
export async function unmatchedPeople(): Promise<{ people: UnmatchedPerson[]; joins: number }> {
  return withSchool(async (q) => {
    const people = await q<UnmatchedPerson>(`with u as (select ms.*, ${PKEY} as k, e.group_id, e.lesson_date from meet_sessions ms join lesson_events e on e.id = ms.lesson_event_id where ${UNMATCHED})
      select k as key, coalesce(mode() within group (order by display_name), max(participant_email::text), 'Someone signed out') as who, max(participant_email::text) as email,
        count(*)::int as joins, count(distinct lesson_event_id)::int as lessons, min(lesson_date)::text as first, max(lesson_date)::text as last,
        (select string_agg(distinct g.code, ', ') from course_groups g where g.id in (select group_id from u u2 where u2.k = u.k)) as classes,
        coalesce((select json_agg(r order by r.absent desc, r.name) from (select st.id, st.first_name || ' ' || st.last_name as name, g.code as cls,
            (select count(*)::int from attendance_marks m where m.student_id = st.id and m.mark = 'absent' and m.lesson_event_id in (select lesson_event_id from u u3 where u3.k = u.k)) as absent
          from enrolments x join students st on st.id = x.student_id join course_groups g on g.id = x.group_id
          where x.group_id in (select group_id from u u2 where u2.k = u.k) and x.status = 'active' and not x.is_taster) r), '[]') as roster
      from u group by k order by count(distinct lesson_event_id) desc, k limit 300`);
    const [{ n }] = await q<{ n: number }>(`select count(*)::int as n from meet_sessions ms where ${UNMATCHED}`);
    return { people, joins: n };
  });
}
/** Say who a person was (or that they weren't a student) for all their unmatched joins. Only lessons of that student's classes are matched. */
export async function matchPerson(actorId: string, key: string, studentId: string | null): Promise<string | null> {
  if (!/^[ens]:/.test(key) || key.length > 300) return "That person wasn’t found.";
  return withSchool(async (q) => {
    const rows = await q<{ id: string; ev: string; email: string | null; ok: boolean }>(`select ms.id, ms.lesson_event_id as ev, lower(ms.participant_email::text) as email,
        exists (select 1 from enrolments x join lesson_events e on e.group_id = x.group_id where e.id = ms.lesson_event_id and x.student_id = $2) as ok
      from meet_sessions ms where ${UNMATCHED} and ${PKEY} = $1`, [key, studentId]);
    if (!rows.length) return "Nothing left to match for that person.";
    if (!studentId) {
      await q(`update meet_sessions set ignored = true, matched_by = $2 where id = any($1::uuid[])`, [rows.map((r) => r.id), actorId]);
    } else {
      const mine = rows.filter((r) => r.ok); if (!mine.length) return "That student isn’t in any of those classes.";
      await q(`update meet_sessions set student_id = $2, matched_by = $3 where id = any($1::uuid[])`, [mine.map((r) => r.id), studentId, actorId]);
      const em = rows.find((r) => r.email)?.email;
      if (em) { const al = (await kvGet<Record<string, string>>("aliases", q)) ?? {}; al[em] = studentId; await kvSet("aliases", al, q); }
      for (const ev of new Set(mine.map((r) => r.ev))) await recompute(q, ev);
    }
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'match_person', 'meet_session', null, $2)`,
      [actorId, JSON.stringify({ key: key.slice(0, 2) + "…", student: studentId, joins: rows.length })]);
    const [{ n, p }] = await q<{ n: number; p: number }>(`select count(*)::int as n, count(distinct ${PKEY})::int as p from meet_sessions ms where ${UNMATCHED}`);
    const sync = (await kvGet<SyncInfo>("sync", q)) ?? {}; await kvSet("sync", { ...sync, unmatched: n, people: p }, q);
    return null;
  });
}

/** A parent joined with their own Google account: when exactly one of their children is in that lesson's class, it was that child. */
async function matchByParent(q: Q): Promise<string[]> {
  const rows = await q<{ id: string; ev: string; sid: string }>(`select ms.id, ms.lesson_event_id as ev, min(st.id::text) as sid
    from meet_sessions ms join lesson_events e on e.id = ms.lesson_event_id join parents p on lower(p.email::text) = lower(ms.participant_email::text)
    join students st on st.parent_id = p.id join enrolments x on x.student_id = st.id and x.group_id = e.group_id and not x.is_taster
    where ms.student_id is null and not ms.ignored group by ms.id, ms.lesson_event_id having count(distinct st.id) = 1`);
  for (const r of rows) await q(`update meet_sessions set student_id = $2 where id = $1`, [r.id, r.sid]);
  return [...new Set(rows.map((r) => r.ev))];
}

/** After join records arrive from somewhere other than Google Meet (Zoom's reports): match them to students by family
 *  email and by name, exactly as Meet joins are, then turn the touched lessons into marks. */
export async function settleJoins(q: Q, touched: Set<string>) {
  const aliases = (await kvGet<Record<string, string>>("aliases", q)) ?? {};
  for (const id of await matchByParent(q)) touched.add(id);
  for (const id of await matchByName(q, aliases)) touched.add(id);
  await kvSet("aliases", aliases, q);
  for (const id of touched) await recompute(q, id);
}
/** Student ids by email, including emails the office has matched before (a parent's account, a personal address). */
export async function studentEmails(q: Q): Promise<Map<string, string>> {
  const m = new Map((await q<{ id: string; email: string }>(`select id, lower(email::text) as email from students where email is not null`)).map((s) => [s.email, s.id]));
  for (const [e, id] of Object.entries((await kvGet<Record<string, string>>("aliases", q)) ?? {})) if (!m.has(e)) m.set(e, id);
  return m;
}
