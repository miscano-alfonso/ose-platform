import "server-only";
import { withSchool } from "./db";
import { googleAccess, MeetError, unplacedCalls, usualTimes } from "./meet";

// 28 Nov (Alfonso: "one button, to connect to a classroom, so the classroom window pops up, for me to select the correct
// classroom. Then the meet link, classroom link and invitation link is all pulled in one go"). Admin → Classes →
// Connect Classroom lists the school's Google Classrooms (as the recordings account ose@, which teaches every class, sees
// them); choosing one saves:
//  - the Classroom itself (its id, so its link, roster and work follow),
//  - its class code, for the invitation link (classroom.google.com/c/…?cjc=<code>),
//  - the Meet link. Google's Classroom API doesn't give out a class's Meet link, so it's looked for where it shows up:
//    the class's description or a post in its Stream, then the Meet log (a Meet that's used at this class's lesson times).

const API = () => process.env.CLASSROOM_API_URL || "https://classroom.googleapis.com/v1";
export type GCourse = { id: string; name: string; section: string; link: string | null; code: string | null; owner: string | null; linkedTo: string | null };
type Raw = { id: string; name?: string; section?: string; alternateLink?: string; enrollmentCode?: string; ownerId?: string; courseState?: string; description?: string; descriptionHeading?: string; room?: string };
const MEET = /https?:\/\/meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})/i;

async function token(): Promise<string> {
  try { return await googleAccess("rec"); } catch { return googleAccess("google"); }
}
async function get<T>(tok: string, path: string): Promise<{ ok: boolean; status: number; j: T }> {
  const r = await fetch(API() + path, { headers: { authorization: `Bearer ${tok}` }, signal: AbortSignal.timeout(20000) });
  return { ok: r.ok, status: r.status, j: (await r.json().catch(() => ({}))) as T };
}

/** Every active Classroom the school can see, with the class already linked to each (if any). */
export async function listCourses(): Promise<{ courses: GCourse[] } | { error: string }> {
  try {
    const tok = await token(), out: Raw[] = [];
    let page = "";
    for (let i = 0; i < 10; i++) {
      const r = await get<{ courses?: Raw[]; nextPageToken?: string }>(tok, `/courses?courseStates=ACTIVE&pageSize=100${page ? `&pageToken=${encodeURIComponent(page)}` : ""}`);
      if (!r.ok) return { error: r.status === 403 ? "Google wouldn’t list the Classrooms. Connect the recordings account (ose@) again in Recordings → Settings." : `Google didn’t answer (${r.status}).` };
      out.push(...(r.j.courses ?? []));
      if (!r.j.nextPageToken) break; page = r.j.nextPageToken;
    }
    const linked = await withSchool((q) => q<{ course: string; code: string }>(`select google_course_id as course, code from course_groups where google_course_id is not null`));
    const by = new Map(linked.map((l) => [l.course, l.code]));
    return { courses: out.map((c) => ({ id: c.id, name: c.name ?? "Classroom", section: c.section ?? "", link: c.alternateLink ?? null, code: c.enrollmentCode ?? null, owner: c.ownerId ?? null, linkedTo: by.get(c.id) ?? null }))
      .sort((a, b) => a.name.localeCompare(b.name)) };
  } catch (e) { return { error: e instanceof MeetError ? e.message : "Couldn’t reach Google Classroom." }; }
}

/** Where a class's Meet link can be found: the Classroom's own text, its Stream posts, then the Meet log at its lesson times. */
async function findMeet(tok: string, c: Raw, groupId: string): Promise<{ url: string; source: string } | null> {
  const norm = (code: string) => `https://meet.google.com/${code.toLowerCase()}`;
  const own = MEET.exec([c.description, c.descriptionHeading, c.room].filter(Boolean).join(" "));
  if (own) return { url: norm(own[1]), source: "the Classroom’s description" };
  const posts = await get<{ announcements?: { text?: string; materials?: { link?: { url?: string } }[] }[] }>(tok, `/courses/${encodeURIComponent(c.id)}/announcements?pageSize=50`).catch(() => null);
  for (const a of posts?.ok ? posts.j.announcements ?? [] : []) {
    const m = MEET.exec([a.text ?? "", ...(a.materials ?? []).map((x) => x.link?.url ?? "")].join(" "));
    if (m) return { url: norm(m[1]), source: "a post in the Classroom’s Stream" };
  }
  // the Meet log: a meeting not matched to any class yet, used at this class's timetabled times
  const slots = await withSchool((q) => q<{ weekday: number; t: number }>(`select weekday, extract(hour from starts_at)::int * 60 + extract(minute from starts_at)::int as t from lesson_slots where group_id = $1 and one_off_on is null`, [groupId]));
  if (!slots.length) return null;
  const hits = (await unplacedCalls()).map((u) => ({ u, n: usualTimes(u).filter((x) => slots.some((s) => s.weekday === x.weekday && Math.abs(s.t - (+x.time.slice(0, 2) * 60 + +x.time.slice(3))) <= 30)).length }))
    .filter((h) => h.n > 0 && /^[a-z]{10}$/.test(h.u.code)).sort((a, b) => b.n - a.n || b.u.joins - a.u.joins);
  if (!hits.length) return null;
  const code = hits[0].u.code;
  return { url: `https://meet.google.com/${code.slice(0, 3)}-${code.slice(3, 7)}-${code.slice(7)}`, source: "the Meet log (calls at this class’s lesson times)" };
}

export type Connected = { ok: true; name: string; classroom: string | null; invite: string | null; meet: string | null; meetSource: string | null; meetKept: boolean } | { ok: false; error: string };
/** Links a class to a Classroom and pulls its links in one go. An existing Meet link is kept unless `replaceMeet`. */
export async function connectCourse(actorId: string, groupId: string, courseId: string, replaceMeet = false): Promise<Connected> {
  if (!/^[0-9]{5,20}$/.test(courseId)) return { ok: false, error: "Choose a Classroom." };
  try {
    const tok = await token();
    const r = await get<Raw>(tok, `/courses/${encodeURIComponent(courseId)}`);
    if (!r.ok) return { ok: false, error: r.status === 404 ? "That Classroom wasn’t found." : `Google wouldn’t share that Classroom (${r.status}).` };
    const c = r.j;
    const g = (await withSchool((q) => q<{ meet_url: string | null; code: string }>(`select meet_url, code from course_groups where id = $1`, [groupId])))[0];
    if (!g) return { ok: false, error: "That class wasn’t found." };
    const found = await findMeet(tok, c, groupId);
    const meet = g.meet_url && !replaceMeet ? g.meet_url : found?.url ?? g.meet_url;
    await withSchool(async (q) => {
      await q(`update course_groups set google_course_id = $2, classroom_code = $3, meet_url = $4 where id = $1`, [groupId, c.id, c.enrollmentCode ?? null, meet]);
      await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'classroom_connect', 'course_group', $2, $3)`,
        [actorId, groupId, JSON.stringify({ course: c.id, name: c.name, code: c.enrollmentCode ?? null, meet, meetSource: found?.source ?? null })]);
    });
    return { ok: true, name: [c.name, c.section].filter(Boolean).join(" · "), classroom: c.alternateLink ?? null, invite: inviteLink(c.id, c.enrollmentCode ?? null),
      meet, meetSource: meet === found?.url ? found?.source ?? null : null, meetKept: !!g.meet_url && !replaceMeet && meet !== found?.url };
  } catch (e) { return { ok: false, error: e instanceof MeetError ? e.message : "Couldn’t reach Google Classroom." }; }
}

/** The link that lets a student join with the class code: classroom.google.com/c/<id in base64>?cjc=<code>. */
export function inviteLink(courseId: string, code: string | null): string | null {
  return code ? `https://classroom.google.com/c/${Buffer.from(courseId).toString("base64").replace(/=+$/, "")}?cjc=${encodeURIComponent(code)}` : null;
}
