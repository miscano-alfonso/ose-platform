import "server-only";
import { withSchool } from "./db";
import { googleAccess, googleKv, googleKvSet, classroomGranted, MeetError } from "./meet";

// Google Classroom, read-only, through the school's Google connection (a Workspace super admin can read every class):
// who has accepted their class invitation, the work set in each class, and each student's hand-ins and marks.
// Parents see this under Assignments; report percentages come from the marks on returned work.
const API = () => process.env.CLASSROOM_API_URL || "https://classroom.googleapis.com/v1";
export type ClassroomInfo = { at?: string; classes?: number; work?: number; submissions?: number; joined?: number; problems?: string[]; error?: string; by?: string };

type Page<T> = Record<string, T[] | string | undefined> & { nextPageToken?: string };
async function all<T>(token: string, path: string, key: string): Promise<{ ok: true; items: T[] } | { ok: false; status: number }> {
  const items: T[] = []; let pageToken = "";
  for (let i = 0; i < 50; i++) {
    const u = new URL(API() + path); u.searchParams.set("pageSize", "100"); if (pageToken) u.searchParams.set("pageToken", pageToken);
    const r = await fetch(u, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(25000) });
    if (!r.ok) return { ok: false, status: r.status };
    const j = (await r.json()) as Page<T>;
    items.push(...((j[key] as T[] | undefined) ?? []));
    if (!j.nextPageToken) break; pageToken = j.nextPageToken;
  }
  return { ok: true, items };
}

type Student = { userId: string; profile?: { emailAddress?: string; name?: { fullName?: string } } };
type Work = { id: string; title?: string; dueDate?: { year: number; month: number; day: number }; dueTime?: { hours?: number; minutes?: number }; maxPoints?: number; alternateLink?: string; state?: string };
type Sub = { courseWorkId: string; userId: string; state?: string; late?: boolean; assignedGrade?: number; updateTime?: string;
  submissionHistory?: { stateHistory?: { state?: string; stateTimestamp?: string } }[] };

const dueOf = (w: Work) => w.dueDate ? new Date(Date.UTC(w.dueDate.year, w.dueDate.month - 1, w.dueDate.day, w.dueTime ? w.dueTime.hours ?? 0 : 23, w.dueTime ? w.dueTime.minutes ?? 0 : 59)).toISOString() : null;
const STATE: Record<string, string> = { TURNED_IN: "turned_in", RETURNED: "returned" };

export async function classroomStatus(): Promise<{ granted: boolean | null; info: ClassroomInfo; linked: number }> {
  const [granted, info, linked] = await Promise.all([classroomGranted(), googleKv<ClassroomInfo>("classroom"),
    withSchool((q) => q<{ n: number }>(`select count(*)::int as n from course_groups g join academic_years y on y.id = g.academic_year_id where y.ends_on >= current_date and g.google_course_id is not null and g.status <> 'closed'`))]);
  return { granted, info: info ?? {}, linked: linked[0]?.n ?? 0 };
}

export async function syncClassroom(by: string): Promise<ClassroomInfo> {
  let token: string;
  try { token = await googleAccess("google"); }
  catch (e) { const info = { at: new Date().toISOString(), by, error: e instanceof MeetError ? e.message : "Couldn’t reach Google." }; await googleKvSet("classroom", info); return info; }
  const info: ClassroomInfo = { at: new Date().toISOString(), by, classes: 0, work: 0, submissions: 0, joined: 0, problems: [] };
  const groups = await withSchool((q) => q<{ id: string; code: string; course: string }>(`select g.id, g.code, g.google_course_id as course from course_groups g join academic_years y on y.id = g.academic_year_id
    where y.ends_on >= current_date and g.google_course_id is not null and g.status <> 'closed' order by g.code`));
  for (const g of groups) {
    const cid = encodeURIComponent(g.course);
    const roster = await all<Student>(token, `/courses/${cid}/students`, "students");
    if (!roster.ok) {
      info.problems!.push(`${g.code}: ${roster.status === 403 ? "Google wouldn’t share this class (turn on the Google Classroom API, and reconnect Google)" : roster.status === 404 ? "no Classroom with that ID" : `Classroom answered ${roster.status}`}`);
      if (roster.status === 403 && info.problems!.length >= 3 && info.classes === 0) break;   // no access at all: stop early
      continue;
    }
    const [work, subs] = await Promise.all([all<Work>(token, `/courses/${cid}/courseWork?courseWorkStates=PUBLISHED`, "courseWork"), all<Sub>(token, `/courses/${cid}/courseWork/-/studentSubmissions`, "studentSubmissions")]);
    if (!work.ok || !subs.ok) { info.problems!.push(`${g.code}: couldn’t read the class work (${!work.ok ? work.status : (subs as { status: number }).status})`); continue; }
    info.classes!++;
    await withSchool(async (q) => {
      // who is in the class: Classroom user → our student, by their Google account
      const emails = roster.items.map((s) => (s.profile?.emailAddress ?? "").toLowerCase()).filter(Boolean);
      const known = new Map((await q<{ id: string; email: string }>(`select id, lower(email::text) as email from students where lower(email::text) = any($1::text[])`, [emails])).map((s) => [s.email, s.id]));
      const uid = new Map<string, string>();
      for (const s of roster.items) { const sid = known.get((s.profile?.emailAddress ?? "").toLowerCase()); if (sid) uid.set(s.userId, sid); }
      // accepted invitations: members of the class
      const sids = [...new Set(uid.values())];
      if (sids.length) {
        const j = await q(`insert into classroom_memberships (school_id, group_id, student_id, state, joined_at)
            select current_school(), $1, s, 'joined', now() from unnest($2::uuid[]) s
            where exists (select 1 from enrolments e where e.group_id = $1 and e.student_id = s and e.status = 'active')
          on conflict (group_id, student_id) do update set state = 'joined', joined_at = coalesce(classroom_memberships.joined_at, now()) where classroom_memberships.state <> 'joined' returning id`, [g.id, sids]);
        info.joined! += j.length;
      }
      // the work set
      const wid = new Map<string, string>();
      for (const w of work.items) {
        const [row] = await q<{ id: string }>(`insert into classroom_coursework (school_id, group_id, coursework_id, title, due_at, max_points, link) values (current_school(), $1, $2, $3, $4, $5, $6)
          on conflict (coursework_id) do update set group_id = excluded.group_id, title = excluded.title, due_at = excluded.due_at, max_points = excluded.max_points, link = excluded.link returning id`,
          [g.id, w.id, (w.title ?? "Untitled").slice(0, 300), dueOf(w), w.maxPoints && w.maxPoints > 0 ? w.maxPoints : null, w.alternateLink ?? null]);
        wid.set(w.id, row.id); info.work!++;
      }
      // work Classroom no longer has (deleted or unpublished) goes too
      await q(`delete from classroom_coursework where group_id = $1 and not (coursework_id = any($2::text[]))`, [g.id, work.items.map((w) => w.id)]);
      // each student's hand-in and mark
      for (const s of subs.items) {
        const sid = uid.get(s.userId), cw = wid.get(s.courseWorkId); if (!sid || !cw) continue;
        const st = STATE[s.state ?? ""] ?? "assigned";
        const turned = [...(s.submissionHistory ?? [])].reverse().find((h) => h.stateHistory?.state === "TURNED_IN")?.stateHistory?.stateTimestamp ?? null;
        const pts = st === "returned" && typeof s.assignedGrade === "number" ? s.assignedGrade : null;
        await q(`insert into classroom_submissions (school_id, coursework_id, student_id, state, late, turned_in_at, points, graded_at) values (current_school(), $1, $2, $3::submission_state, $4, $5, $6, $7)
          on conflict (coursework_id, student_id) do update set state = excluded.state, late = excluded.late, turned_in_at = excluded.turned_in_at, points = excluded.points,
            graded_at = case when excluded.points is null then null else coalesce(classroom_submissions.graded_at, excluded.graded_at) end`,
          [cw, sid, st, !!s.late, turned, pts, pts == null ? null : s.updateTime ?? new Date().toISOString()]);
        info.submissions!++;
      }
    });
  }
  info.problems = info.problems!.slice(0, 12);
  await googleKvSet("classroom", info);
  return info;
}

/** Runs with the Meet sync: at most every 6 hours. */
export async function classroomBackground() {
  try {
    const { granted, info } = await classroomStatus();
    if (!granted) return;
    if (info.at && Date.now() - Date.parse(info.at) < 6 * 3600e3) return;
    await googleKvSet("classroom", { ...info, at: new Date().toISOString() });   // so two page loads don't both start a sync
    await syncClassroom("auto");
  } catch (e) { console.error("classroom background", e); }
}
