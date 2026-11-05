import "server-only";
import { withSchool } from "./db";
import { googleAccess, googleKv, googleKvSet, classroomGranted, MeetError } from "./meet";

// Google Classroom, read-only, through the school's Google connection (a Workspace super admin can read every class):
// who has accepted their class invitation, the work set in each class, and each student's hand-ins and marks.
// Parents see this under Assignments; report percentages come from the marks on returned work.
const API = () => process.env.CLASSROOM_API_URL || "https://classroom.googleapis.com/v1";
export type ClassroomInfo = { unmatched?: { userId: string; name: string; email: string | null; gid: string; code: string; handed?: string[]; set?: number }[]; at?: string; classes?: number; work?: number; submissions?: number; joined?: number; problems?: string[]; error?: string; by?: string };

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

type Student = { userId: string; profile?: { emailAddress?: string; name?: { fullName?: string; givenName?: string; familyName?: string } } };
type Work = { id: string; title?: string; dueDate?: { year: number; month: number; day: number }; dueTime?: { hours?: number; minutes?: number }; maxPoints?: number; alternateLink?: string; state?: string };
type Sub = { courseWorkId: string; userId: string; alternateLink?: string; state?: string; late?: boolean; assignedGrade?: number; updateTime?: string;
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
  const info: ClassroomInfo = { at: new Date().toISOString(), by, classes: 0, work: 0, submissions: 0, joined: 0, problems: [], unmatched: [] };
  const groups = await withSchool((q) => q<{ id: string; code: string; course: string }>(`select g.id, g.code, g.google_course_id as course from course_groups g join academic_years y on y.id = g.academic_year_id
    where y.ends_on >= current_date and g.google_course_id is not null and g.status <> 'closed' order by g.code`));
  const matchedSomewhere = new Set<string>();
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
      // accounts the office has matched by hand come first (Students → Classroom accounts to match)
      const linked = new Map((await q<{ u: string; sid: string }>(`select google_user_id as u, student_id as sid from classroom_user_links where google_user_id = any($1::text[])`, [roster.items.map((s) => s.userId)])).map((r) => [r.u, r.sid]));
      for (const s of roster.items) { const sid = linked.get(s.userId) ?? known.get((s.profile?.emailAddress ?? "").toLowerCase()); if (sid) uid.set(s.userId, sid); }
      // 5 Nov: a child signed in with their parent's Google account: the parent's email, when only one of their children is booked on this class
      const byParent = emails.length ? await q<{ id: string; email: string }>(`select s.id, lower(p.email::text) as email from enrolments e join students s on s.id = e.student_id join parents p on p.id = s.parent_id
        where e.group_id = $1 and e.status in ('active', 'pending') and lower(p.email::text) = any($2::text[])`, [g.id, emails]) : [];
      for (const s of roster.items) {
        if (uid.has(s.userId)) continue;
        const kids = byParent.filter((k) => k.email === (s.profile?.emailAddress ?? "").toLowerCase() && ![...uid.values()].includes(k.id));
        if (kids.length === 1) uid.set(s.userId, kids[0].id);
      }
      // 5 Nov: a student whose Classroom account isn't the email on their record (or whose email Google doesn't share) is matched by
      // name among the students booked on this class, only when exactly one has that name
      const left = roster.items.filter((s) => !uid.has(s.userId));
      if (left.length) {
        const norm = (x: string) => x.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
        const kids = await q<{ id: string; first: string; last: string; known: string | null }>(`select s.id, s.first_name as first, s.last_name as last, nullif(s.known_as, '') as known
          from enrolments e join students s on s.id = e.student_id where e.group_id = $1 and e.status in ('active', 'pending')`, [g.id]);
        const taken = new Set(uid.values());
        for (const s of left) {
          const full = norm(s.profile?.name?.fullName ?? `${s.profile?.name?.givenName ?? ""} ${s.profile?.name?.familyName ?? ""}`); if (!full) continue;
          const hits = kids.filter((k) => !taken.has(k.id) && [`${k.first} ${k.last}`, k.known ? `${k.known} ${k.last}` : ""].filter(Boolean).map(norm).includes(full));
          if (hits.length === 1) { uid.set(s.userId, hits[0].id); taken.add(hits[0].id); }
        }
        const still = roster.items.filter((s) => !uid.has(s.userId));
        // what each of them handed in, so the office can check it against the named student work in Classroom
        const title = new Map(work.items.map((w) => [w.id, (w.title ?? "Untitled").slice(0, 120)]));
        for (const s of still) {
          const handed = subs.items.filter((x) => x.userId === s.userId && (x.state === "TURNED_IN" || x.state === "RETURNED") && title.has(x.courseWorkId)).map((x) => title.get(x.courseWorkId)!);
          info.unmatched!.push({ userId: s.userId, name: s.profile?.name?.fullName ?? "(no name)", email: s.profile?.emailAddress ?? null, gid: g.id, code: g.code, handed: handed.slice(0, 30), set: work.items.length });
        }
      }
      for (const u of uid.keys()) matchedSomewhere.add(u);
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
        await q(`insert into classroom_submissions (school_id, coursework_id, student_id, state, late, turned_in_at, points, graded_at, link) values (current_school(), $1, $2, $3::submission_state, $4, $5, $6, $7, $8)
          on conflict (coursework_id, student_id) do update set state = excluded.state, late = excluded.late, turned_in_at = excluded.turned_in_at, points = excluded.points, link = excluded.link,
            graded_at = case when excluded.points is null then null else coalesce(classroom_submissions.graded_at, excluded.graded_at) end`,
          [cw, sid, st, !!s.late, turned, pts, pts == null ? null : s.updateTime ?? new Date().toISOString(), s.alternateLink ?? null]);
        info.submissions!++;
      }
    });
  }
  await syncOneCourses(token, info);
  info.problems = info.problems!.slice(0, 12);
  info.unmatched = info.unmatched!.filter((u) => !matchedSomewhere.has(u.userId)).slice(0, 200);   // matched in another of their classes: not a stranger
  await googleKvSet("classroom", info);
  return info;
}

/** 2 Nov: each linked 1:1 Classroom course (one_courses): its work and the 1:1 student's hand-ins and marks, kept like a class's. */
async function syncOneCourses(token: string, info: ClassroomInfo) {
  const ones = await withSchool((q) => q<{ id: string; course: string; student_id: string; email: string | null; label: string }>(`
    select oc.id, oc.google_course_id as course, oc.student_id, lower(s.email::text) as email, s.first_name || ' ' || s.last_name as label
    from one_courses oc join students s on s.id = oc.student_id`)).catch(() => []);
  for (const o of ones) {
    const cid = encodeURIComponent(o.course);
    const [roster, work, subs] = await Promise.all([all<Student>(token, `/courses/${cid}/students`, "students"),
      all<Work>(token, `/courses/${cid}/courseWork?courseWorkStates=PUBLISHED`, "courseWork"), all<Sub>(token, `/courses/${cid}/courseWork/-/studentSubmissions`, "studentSubmissions")]);
    if (!roster.ok || !work.ok || !subs.ok) { info.problems!.push(`1:1 ${o.label}: couldn’t read its Classroom (${!roster.ok ? roster.status : !work.ok ? work.status : (subs as { status: number }).status})`); continue; }
    // the 1:1 student in the course, by their Google account
    const uids = new Set(roster.items.filter((s) => o.email && (s.profile?.emailAddress ?? "").toLowerCase() === o.email).map((s) => s.userId));
    await withSchool(async (q) => {
      const wid = new Map<string, string>();
      for (const w of work.items) {
        const [row] = await q<{ id: string }>(`insert into classroom_coursework (school_id, group_id, one_course_id, coursework_id, title, due_at, max_points, link) values (current_school(), null, $1, $2, $3, $4, $5, $6)
          on conflict (coursework_id) do update set group_id = null, one_course_id = excluded.one_course_id, title = excluded.title, due_at = excluded.due_at, max_points = excluded.max_points, link = excluded.link returning id`,
          [o.id, w.id, (w.title ?? "Untitled").slice(0, 300), dueOf(w), w.maxPoints && w.maxPoints > 0 ? w.maxPoints : null, w.alternateLink ?? null]);
        wid.set(w.id, row.id); info.work!++;
      }
      await q(`delete from classroom_coursework where one_course_id = $1 and not (coursework_id = any($2::text[]))`, [o.id, work.items.map((w) => w.id)]);
      for (const s of subs.items) {
        const cw = wid.get(s.courseWorkId); if (!cw || !uids.has(s.userId)) continue;
        const st = STATE[s.state ?? ""] ?? "assigned";
        const turned = [...(s.submissionHistory ?? [])].reverse().find((h) => h.stateHistory?.state === "TURNED_IN")?.stateHistory?.stateTimestamp ?? null;
        const pts = st === "returned" && typeof s.assignedGrade === "number" ? s.assignedGrade : null;
        await q(`insert into classroom_submissions (school_id, coursework_id, student_id, state, late, turned_in_at, points, graded_at, link) values (current_school(), $1, $2, $3::submission_state, $4, $5, $6, $7, $8)
          on conflict (coursework_id, student_id) do update set state = excluded.state, late = excluded.late, turned_in_at = excluded.turned_in_at, points = excluded.points, link = excluded.link,
            graded_at = case when excluded.points is null then null else coalesce(classroom_submissions.graded_at, excluded.graded_at) end`,
          [cw, o.student_id, st, !!s.late, turned, pts, pts == null ? null : s.updateTime ?? new Date().toISOString(), s.alternateLink ?? null]);
        info.submissions!++;
      }
    });
  }
}

/** A Classroom course's numeric id from what an admin pastes: the id itself, or a classroom.google.com/c/<id> link (the id there is base64). */
export function courseIdFrom(input: string): string | null {
  const t = input.trim();
  if (/^[0-9]{5,20}$/.test(t)) return t;
  const m = /classroom\.google\.com\/(?:u\/\d+\/)?c\/([A-Za-z0-9_-]+)/.exec(t);
  if (!m) return null;
  if (/^[0-9]{5,20}$/.test(m[1])) return m[1];
  try { const d = Buffer.from(m[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"); return /^[0-9]{5,20}$/.test(d) ? d : null; } catch { return null; }
}

/** The course's name and link, to check it can be read before it's linked. */
export async function courseInfo(courseId: string): Promise<{ name: string; link: string | null } | { error: string }> {
  try {
    const token = await googleAccess("google");
    const r = await fetch(`${API()}/courses/${encodeURIComponent(courseId)}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
    if (r.status === 404) return { error: "There’s no Classroom with that link." };
    if (!r.ok) return { error: `Google wouldn’t share that Classroom (${r.status}).` };
    const j = (await r.json()) as { name?: string; section?: string; alternateLink?: string };
    return { name: [j.name, j.section].filter(Boolean).join(" · ").slice(0, 200) || "Classroom", link: j.alternateLink ?? null };
  } catch (e) { return { error: e instanceof MeetError ? e.message : "Couldn’t reach Google." }; }
}

/** Runs with the Meet sync: at most every 2 hours (was 6; 5 Nov, so the Students page's missing work stays current). */
export async function classroomBackground() {
  try {
    const { granted, info } = await classroomStatus();
    if (!granted) return;
    if (info.at && Date.now() - Date.parse(info.at) < 2 * 3600e3) return;
    await googleKvSet("classroom", { ...info, at: new Date().toISOString() });   // so two page loads don't both start a sync
    await syncClassroom("auto");
  } catch (e) { console.error("classroom background", e); }
}

/** Students → "Classroom accounts to match" (5 Nov): this Classroom account is this student. */
export async function linkClassroomUser(actorId: string, googleUserId: string, studentId: string, name: string | null, email: string | null): Promise<string | null> {
  if (!/^[\w-]{1,80}$/.test(googleUserId)) return "That Classroom account wasn’t found.";
  if (!/^[0-9a-f-]{36}$/.test(studentId)) return "Choose the student.";
  await withSchool(async (q) => {
    await q(`insert into classroom_user_links (school_id, google_user_id, student_id, name, email, created_by) values (current_school(), $1, $2, $3, $4, $5)
      on conflict (school_id, google_user_id) do update set student_id = excluded.student_id, name = excluded.name, email = excluded.email, created_by = excluded.created_by, created_at = now()`,
      [googleUserId, studentId, name?.slice(0, 200) ?? null, email?.slice(0, 200) ?? null, actorId]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'classroom_link', 'student', $2, $3)`, [actorId, studentId, JSON.stringify({ googleUserId, name, email })]);
  });
  return null;
}
