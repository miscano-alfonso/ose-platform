import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { withSchool } from "./db";
import { recompute } from "./meet";
import { DEFAULT_VIDEO, type VideoSettings, VIDEO_TOOLS } from "./video";

// Check-in attendance, for any video tool. Every Join button goes through /join/<class> on this site: a signed-in
// student (or one following the signed link in their reminder email) is recorded as joining at that moment, then sent
// on to the lesson link. Check-ins are saved as join records next to Google Meet's, so the same rules turn them into
// marks once the lesson ends: on time → present, after the grace minutes → late, no join → absent.

type Q = <T = Record<string, unknown>>(s: string, p?: unknown[]) => Promise<T[]>;

export async function videoSettings(q?: Q): Promise<VideoSettings> {
  const run = async (qq: Q) => (await qq<{ value: Partial<VideoSettings> }>(`select value from meet_kv where key = 'video'`))[0]?.value ?? null;
  const v = q ? await run(q) : await withSchool(run);
  return { tool: VIDEO_TOOLS.some((t) => t.id === v?.tool) ? v!.tool! : DEFAULT_VIDEO.tool, checkins: typeof v?.checkins === "boolean" ? v.checkins : DEFAULT_VIDEO.checkins };
}
export async function saveVideoSettings(v: VideoSettings) {
  await withSchool((q) => q(`insert into meet_kv (school_id, key, value) values (current_school(), 'video', $1) on conflict (school_id, key) do update set value = excluded.value, updated_at = now()`, [JSON.stringify(v)]));
}

// ---------- signed join links for emails (the child may not be signed in) ----------
const secret = () => process.env.JOIN_SECRET || process.env.DATABASE_URL || "ose-join";
const sign = (groupId: string, studentId: string) => createHmac("sha256", secret()).update(`join:${groupId}:${studentId}`).digest("base64url").slice(0, 22);
/** The path for a student's Join button in an email: /join/<class>?s=<student>&t=<signature>. */
export const joinPath = (groupId: string, studentId: string) => `/join/${groupId}?s=${studentId}&t=${sign(groupId, studentId)}`;
export function verifyJoin(groupId: string, studentId: string, t: string): boolean {
  const want = Buffer.from(sign(groupId, studentId)), got = Buffer.from(t);
  return want.length === got.length && timingSafeEqual(want, got);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Where /join/<class> sends people: the class's lesson link (or null if none is set). Records a check-in when
 *  the school has check-ins on, a student is given, and one of the class's lessons is about to start or under way. */
export async function joinClass(groupId: string, studentId: string | null): Promise<{ link: string | null; checkedIn: boolean }> {
  if (!UUID.test(groupId) || (studentId && !UUID.test(studentId))) return { link: null, checkedIn: false };
  return withSchool(async (q) => {
    const g = (await q<{ link: string | null }>(`select meet_url as link from course_groups where id = $1`, [groupId]))[0];
    if (!g) return { link: null, checkedIn: false };
    if (!studentId || !(await videoSettings(q)).checkins) return { link: g.link, checkedIn: false };
    // the lesson open for joining: from 30 minutes before it starts to the moment it ends
    const ev = (await q<{ id: string; email: string | null; name: string }>(`
      select e.id, st.email::text as email, st.first_name || ' ' || st.last_name as name
      from lesson_events e join lesson_slots s on s.id = e.slot_id join schools sc on sc.id = e.school_id
      join enrolments x on x.group_id = e.group_id and x.student_id = $2 and x.status = 'active' and not x.is_taster join students st on st.id = x.student_id
      where e.group_id = $1 and e.status <> 'cancelled' and e.lesson_date between current_date - 1 and current_date + 1
        and now() >= ((e.lesson_date + s.starts_at) at time zone sc.timezone) - interval '30 minutes' and now() <= ((e.lesson_date + s.ends_at) at time zone sc.timezone)
      order by abs(extract(epoch from (((e.lesson_date + s.starts_at) at time zone sc.timezone) - now()))) limit 1`, [groupId, studentId]))[0];
    if (!ev) return { link: g.link, checkedIn: false };
    await q(`insert into meet_sessions (school_id, lesson_event_id, participant_email, display_name, student_id, joined_at, source, external_id)
      values (current_school(), $1, $2, $3, $4, now(), 'checkin', $5) on conflict (source, external_id) do nothing`, [ev.id, ev.email, ev.name, studentId, `${ev.id}:${studentId}`]);
    return { link: g.link, checkedIn: true };
  });
}

/** After a lesson ends, turn its check-ins into marks (once). Runs with the admin's background jobs and the daily cron. */
export async function checkinsBackground() {
  try {
    await withSchool(async (q) => {
      const due = await q<{ id: string }>(`select distinct e.id from meet_sessions ms join lesson_events e on e.id = ms.lesson_event_id
        join lesson_slots s on s.id = e.slot_id join schools sc on sc.id = e.school_id
        where ms.source = 'checkin' and e.status = 'scheduled' and (e.lesson_date + s.ends_at) at time zone sc.timezone < now() limit 200`);
      for (const r of due) await recompute(q, r.id);
    });
  } catch (e) { console.error("check-ins background", e); }
}
