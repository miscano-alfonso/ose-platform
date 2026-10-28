import "server-only";
import { isTestMode } from "./test-mode";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { withSchool } from "./db";
import { googleAccess, settleJoins, studentEmails } from "./meet";
import { toolOf } from "./video";

// Zoom, for schools that teach on it: attendance from Zoom's list of who joined each lesson (matched to students by
// email, then by name, like Google Meet joins), and cloud recordings posted to the class's Google Classroom as a link.
// The school connects the Zoom account that hosts its lessons (Admin → School settings → Live lessons → Zoom).

type Q = <T = Record<string, unknown>>(s: string, p?: unknown[]) => Promise<T[]>;
export class ZoomError extends Error {}
const fail = (m: string): never => { throw new ZoomError(m); };
const OAUTH = () => (process.env.ZOOM_OAUTH_URL || "https://zoom.us/oauth").replace(/\/$/, "");
const API = () => (process.env.ZOOM_API_URL || "https://api.zoom.us/v2").replace(/\/$/, "");
const CLASSROOM = () => process.env.CLASSROOM_API_URL || "https://classroom.googleapis.com/v1";

export type ZoomSync = { at?: string; by?: string; joins?: number; lessons?: number; posted?: number; error?: string; notes?: string[] };
type ZoomConn = { clientId?: string; clientSecret?: string; refreshToken?: string; account?: string; by?: string; at?: string; scopes?: string;
  pending?: { state: string; email: string; exp: number }; recordings?: boolean; sync?: ZoomSync; done?: string[]; posted?: string[] };

async function kv(q?: Q): Promise<ZoomConn> {
  const run = async (qq: Q) => (await qq<{ value: ZoomConn }>(`select value from meet_kv where key = 'zoom'`))[0]?.value ?? {};
  return q ? run(q) : withSchool(run);
}
async function kvPut(c: ZoomConn, q?: Q) {
  const run = (qq: Q) => qq(`insert into meet_kv (school_id, key, value) values (current_school(), 'zoom', $1) on conflict (school_id, key) do update set value = excluded.value, updated_at = now()`, [JSON.stringify(c)]);
  await (q ? run(q) : withSchool(run));
}
/** The platform's own Zoom app (env) when there is one, otherwise the app the school added. */
const app = (c: ZoomConn) => ({ id: process.env.ZOOM_CLIENT_ID || c.clientId || "", secret: process.env.ZOOM_CLIENT_SECRET || c.clientSecret || "", platform: !!process.env.ZOOM_CLIENT_ID });
export const zoomRedirect = (base: string) => `${base}/admin/zoom/callback`;

export type ZoomStatus = { platformApp: boolean; hasApp: boolean; clientId: string | null; connected: boolean; account: string | null; by: string | null; at: string | null; recordings: boolean; sync: ZoomSync };
export async function zoomStatus(): Promise<ZoomStatus> {
  const c = await kv(), a = app(c);
  return { platformApp: a.platform, hasApp: !!(a.id && a.secret), clientId: a.platform ? null : c.clientId ?? null, connected: !!c.refreshToken, account: c.account ?? null,
    by: c.by ?? null, at: c.at ?? null, recordings: !!c.recordings, sync: c.sync ?? {} };
}
export async function saveZoomApp(clientId: string, clientSecret: string) {
  clientId = clientId.trim(); clientSecret = clientSecret.trim();
  if (!/^[\w-]{10,64}$/.test(clientId)) fail("Paste the Client ID from your Zoom app’s App Credentials.");
  const c = await kv();
  if (!clientSecret && (c.clientId !== clientId || !c.clientSecret)) fail("Paste the Client Secret too.");
  if (clientSecret && !/^[\w-]{10,80}$/.test(clientSecret)) fail("That doesn’t look like a Zoom Client Secret.");
  if (c.clientId !== clientId) { delete c.refreshToken; delete c.account; delete c.by; delete c.at; }
  c.clientId = clientId; if (clientSecret) c.clientSecret = clientSecret;
  await kvPut(c);
}
export async function setZoomRecordings(on: boolean) { const c = await kv(); c.recordings = on; await kvPut(c); }
export async function disconnectZoom() { const c = await kv(); delete c.refreshToken; delete c.account; delete c.by; delete c.at; delete c.sync; await kvPut(c); }

export async function zoomLoginUrl(base: string, email: string): Promise<string> {
  const c = await kv(), a = app(c);
  if (!a.id || !a.secret) fail("Add your Zoom app’s Client ID and Client Secret first.");
  const state = randomBytes(16).toString("hex");
  c.pending = { state, email, exp: Date.now() + 15 * 60000 }; await kvPut(c);
  return `${OAUTH()}/authorize?${new URLSearchParams({ response_type: "code", client_id: a.id, redirect_uri: zoomRedirect(base), state })}`;
}
async function token(c: ZoomConn, body: Record<string, string>): Promise<Record<string, unknown>> {
  const a = app(c);
  const r = await fetch(`${OAUTH()}/token`, { method: "POST", signal: AbortSignal.timeout(20000),
    headers: { "content-type": "application/x-www-form-urlencoded", authorization: "Basic " + Buffer.from(`${a.id}:${a.secret}`).toString("base64") }, body: new URLSearchParams(body) });
  const j = await r.json().catch(() => ({})) as Record<string, unknown>;
  return r.ok ? j : { __error: String(j.reason ?? j.error_description ?? j.error ?? r.status) };
}
/** Zoom sends the browser back here: keep the refresh token and note which Zoom account it is. */
export async function zoomCallback(base: string, sp: URLSearchParams): Promise<string | null> {
  const c = await kv(), pend = c.pending; delete c.pending;
  const given = sp.get("state") || "";
  if (!pend || given.length !== pend.state.length || !timingSafeEqual(Buffer.from(given), Buffer.from(pend.state)) || Date.now() > pend.exp) { await kvPut(c); return "That link has expired. Press Connect Zoom again."; }
  if (sp.get("error")) { await kvPut(c); return "Zoom said: " + (sp.get("error") || "").slice(0, 200) + ". Nothing was changed."; }
  const t = await token(c, { grant_type: "authorization_code", code: sp.get("code") || "", redirect_uri: zoomRedirect(base) });
  if (!t.refresh_token) { await kvPut(c); return "Zoom didn’t complete the sign-in" + (t.__error ? `: ${t.__error}` : "") + "."; }
  const me = await fetch(`${API()}/users/me`, { headers: { authorization: `Bearer ${t.access_token}` }, signal: AbortSignal.timeout(20000) });
  c.refreshToken = String(t.refresh_token); c.scopes = String(t.scope ?? ""); c.by = pend.email; c.at = new Date().toISOString();
  const acct = me.ok ? String(((await me.json()) as { email?: string }).email ?? "").toLowerCase() : "";
  if (acct) c.account = acct; else delete c.account;
  await kvPut(c);
  return null;
}
/** A fresh access token. Zoom replaces the refresh token every time, so the new one is saved straight away. */
async function access(q: Q, c: ZoomConn): Promise<string> {
  if (!c.refreshToken) fail("Connect Zoom first.");
  const t = await token(c, { grant_type: "refresh_token", refresh_token: c.refreshToken! });
  if (!t.access_token) {
    if (String(t.__error).includes("invalid")) { delete c.refreshToken; await kvPut(c, q); fail("Zoom’s connection has expired. Press Connect Zoom again."); }
    fail("Couldn’t reach Zoom: " + (t.__error ?? "no token"));
  }
  if (t.refresh_token) c.refreshToken = String(t.refresh_token);
  await kvPut(c, q);
  return String(t.access_token);
}
async function zget<T>(at: string, path: string): Promise<T | null> {
  const r = await fetch(`${API()}${path}`, { headers: { authorization: `Bearer ${at}` }, signal: AbortSignal.timeout(30000) });
  if (r.status === 404 || r.status === 400) return null;
  if (!r.ok) fail(r.status === 401 || r.status === 403 ? "Zoom refused (check the app’s scopes, and that the account is on a paid Zoom plan)." : `Zoom answered ${r.status}.`);
  return r.json() as Promise<T>;
}
/** Zoom meeting UUIDs that start with "/" or contain "//" must be encoded twice. */
const uuidPath = (u: string) => u.startsWith("/") || u.includes("//") ? encodeURIComponent(encodeURIComponent(u)) : encodeURIComponent(u);
/** The meeting number in a Zoom link (zoom.us/j/123…, /s/, /w/, or ?confno=). Personal links (/my/name) have none. */
export function zoomMeetingId(url: string | null | undefined): string | null {
  if (!url || toolOf(url).id !== "zoom") return null;
  const m = url.match(/\/(?:j|s|w|wc\/join)\/(\d{9,12})/) ?? url.match(/[?&]confno=(\d{9,12})/);
  return m ? m[1] : null;
}

type Participant = { id?: string; user_id?: string; name?: string; user_email?: string; join_time?: string; leave_time?: string };
/** Read who joined each Zoom lesson that ended in the last few days, then post new cloud recordings to Classroom. */
export async function syncZoom(by: string, days = 3): Promise<ZoomSync> {
  return withSchool(async (q) => {
    const c = await kv(q);
    const info: ZoomSync = { at: new Date().toISOString(), by, joins: 0, lessons: 0, posted: 0, notes: [] };
    try {
      const at = await access(q, c);
      const lessons = (await q<{ id: string; gid: string; link: string; course: string | null; name: string; host: string | null; starts: string; ends: string; day: string }>(`
        select e.id, g.id as gid, g.meet_url as link, g.google_course_id as course, l.name || ' ' || sj.name as name, lower(u.email::text) as host, e.lesson_date::text as day,
          ((e.lesson_date + s.starts_at) at time zone sc.timezone)::text as starts, ((e.lesson_date + s.ends_at) at time zone sc.timezone)::text as ends
        from lesson_events e join lesson_slots s on s.id = e.slot_id join course_groups g on g.id = e.group_id join schools sc on sc.id = e.school_id
        join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id left join teachers t on t.id = e.teacher_id left join users u on u.id = t.user_id
        where e.status <> 'cancelled' and g.meet_url ilike '%zoom.%' and e.lesson_date between current_date - $1::int and current_date
          and (e.lesson_date + s.ends_at) at time zone sc.timezone < now()`, [days]))
        .map((l) => ({ ...l, mid: zoomMeetingId(l.link), s: Date.parse(l.starts), e: Date.parse(l.ends) }));
      const noId = new Set(lessons.filter((l) => !l.mid).map((l) => l.name));
      if (noId.size) info.notes!.push(`No meeting number in the Zoom link for ${[...noId].slice(0, 4).join(", ")}: use a link like zoom.us/j/123…, not a personal room name.`);
      const done = new Set(c.done ?? []), emails = await studentEmails(q), touched = new Set<string>();
      const instances = new Map<string, { uuid: string; start_time: string }[]>();
      for (const l of lessons) {
        if (!l.mid || done.has(l.id)) continue;
        if (!instances.has(l.mid)) instances.set(l.mid, (await zget<{ meetings?: { uuid: string; start_time: string }[] }>(at, `/past_meetings/${l.mid}/instances`))?.meetings ?? []);
        const inst = instances.get(l.mid)!.filter((m) => { const t = Date.parse(m.start_time); return t >= l.s - 60 * 60e3 && t <= l.e; });
        for (const m of inst) {
          let next = "";
          do {
            const page = await zget<{ participants?: Participant[]; next_page_token?: string }>(at, `/past_meetings/${uuidPath(m.uuid)}/participants?page_size=300${next ? `&next_page_token=${encodeURIComponent(next)}` : ""}`);
            for (const p of page?.participants ?? []) {
              if (!p.join_time) continue;
              const email = (p.user_email || "").toLowerCase() || null, sid = email ? emails.get(email) ?? null : null;
              if (email && (email === c.account || email === l.host)) continue; // the teacher hosting the lesson
              const r = await q(`insert into meet_sessions (school_id, lesson_event_id, participant_email, display_name, student_id, joined_at, left_at, source, external_id, meeting_code, organizer_email)
                values (current_school(), $1, $2, $3, $4, $5, $6, 'zoom', $7, $8, $9) on conflict (source, external_id) do nothing returning id`,
                [l.id, email, p.name ?? null, sid, p.join_time, p.leave_time ?? null, `${m.uuid}:${p.id || p.user_id || p.name}:${p.join_time}`, l.mid, null]); // no organiser: Zoom families and teachers often share gmail.com
              if (r.length) { info.joins!++; touched.add(l.id); }
            }
            next = page?.next_page_token ?? "";
          } while (next);
        }
        if (inst.length) { done.add(l.id); info.lessons!++; }
      }
      await settleJoins(q, touched);
      c.done = [...done].slice(-800);
      if (c.recordings && !(await isTestMode())) info.posted = await postRecordings(q, c, at, lessons, info);   // test mode: no Classroom posts
    } catch (e) { info.error = e instanceof ZoomError ? e.message : "Couldn’t sync with Zoom. Try again."; if (!(e instanceof ZoomError)) console.error("zoom sync", e); }
    if (!info.notes!.length) delete info.notes;
    c.sync = info; await kvPut(c, q);
    return info;
  });
}

type Rec = { uuid: string; id: number | string; start_time: string; share_url?: string; password?: string; recording_play_passcode?: string; recording_files?: { file_type?: string; status?: string }[] };
/** New cloud recordings of class lessons → a "Lesson recording" post in that class's Google Classroom with the Zoom link. */
async function postRecordings(q: Q, c: ZoomConn, at: string, lessons: { id: string; mid: string | null; course: string | null; name: string; day: string; s: number; e: number }[], info: ZoomSync): Promise<number> {
  const from = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10), to = new Date().toISOString().slice(0, 10);
  const recs = (await zget<{ meetings?: Rec[] }>(at, `/users/me/recordings?from=${from}&to=${to}&page_size=100`))?.meetings ?? [];
  const posted = new Set(c.posted ?? []);
  let gtok: string | null = null, n = 0;
  for (const r of recs) {
    if (posted.has(r.uuid) || !r.share_url || !(r.recording_files ?? []).some((f) => f.file_type === "MP4" && (f.status ?? "completed") === "completed")) continue;
    const t = Date.parse(r.start_time), l = lessons.find((x) => x.mid === String(r.id) && t >= x.s - 60 * 60e3 && t <= x.e);
    if (!l) continue;
    if (!l.course) { info.notes!.push(`${l.name} has no Google Classroom linked, so its recording wasn’t posted.`); posted.add(r.uuid); continue; }
    if (!gtok) { try { gtok = await googleAccess("rec"); } catch { info.notes!.push("Connect the recordings account (Recordings → Settings) so Zoom recordings can be posted to Classroom."); return n; } }
    const date = new Date(l.day + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
    const pass = r.recording_play_passcode || r.password;
    const res = await fetch(`${CLASSROOM()}/courses/${l.course}/courseWorkMaterials`, { method: "POST", signal: AbortSignal.timeout(20000),
      headers: { authorization: `Bearer ${gtok}`, "content-type": "application/json" },
      body: JSON.stringify({ title: `Lesson recording · ${date}`, description: `The recording of ${l.name} on ${date}.${pass ? ` Passcode: ${pass}` : ""}`, materials: [{ link: { url: r.share_url } }], state: "PUBLISHED" }) });
    if (!res.ok) { info.notes!.push(`Google Classroom refused the recording post for ${l.name} (${res.status}).`); continue; }
    posted.add(r.uuid); n++;
  }
  c.posted = [...posted].slice(-800);
  return n;
}

/** Every few hours, while someone uses the admin (and from the daily cron). */
export async function zoomBackground() {
  try {
    const c = await kv(); if (!c.refreshToken) return;
    if (!c.sync?.at || Date.now() - Date.parse(c.sync.at) > 3 * 3600e3) await syncZoom("auto");
  } catch (e) { console.error("zoom background", e); }
}
