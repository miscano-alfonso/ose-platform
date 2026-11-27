import "server-only";
import { withSchool } from "./db";
import { googleAccess, googleKv, googleKvSet, classroomGranted, MeetError } from "./meet";

// Google Classroom, read-only, through the school's Google connection (a Workspace super admin can read every class):
// who has accepted their class invitation, the work set in each class, and each student's hand-ins and marks.
// Parents see this under Assignments; report percentages come from the marks on returned work.
const API = () => process.env.CLASSROOM_API_URL || "https://classroom.googleapis.com/v1";
export type ClassroomInfo = { unmatched?: { userId: string; name: string; email: string | null; gid: string; code: string; handed?: string[]; set?: number; link?: string | null; taster?: string | null }[]; tasters?: { userId: string; name: string; gid: string; code: string; when: string }[]; trialSkipped?: number; at?: string; classes?: number; work?: number; submissions?: number; joined?: number; problems?: string[]; error?: string; by?: string };

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
type Work = { id: string; title?: string; description?: string; creationTime?: string;
  materials?: { driveFile?: { driveFile?: { title?: string; alternateLink?: string }; shareMode?: string }; link?: { title?: string; url?: string }; youtubeVideo?: { title?: string; alternateLink?: string }; form?: { title?: string; formUrl?: string } }[]; dueDate?: { year: number; month: number; day: number }; dueTime?: { hours?: number; minutes?: number }; maxPoints?: number; alternateLink?: string; state?: string };
/** 27 Nov: what's attached to a piece of work, for the parents' Assignments page (names; web links and videos open). */
const materialsOf = (w: Work) => JSON.stringify((w.materials ?? []).slice(0, 20).map((m) =>
  m.link ? { kind: "link", title: (m.link.title || m.link.url || "Link").slice(0, 200), url: m.link.url ?? null }
  : m.youtubeVideo ? { kind: "video", title: (m.youtubeVideo.title || "Video").slice(0, 200), url: m.youtubeVideo.alternateLink ?? null }
  : m.form ? { kind: "form", title: (m.form.title || "Form").slice(0, 200), url: null }
  : m.driveFile ? { kind: "file", title: (m.driveFile.driveFile?.title || "File").slice(0, 200), url: null } : null).filter(Boolean));
type Sub = { courseWorkId: string; userId: string; alternateLink?: string; state?: string; late?: boolean; assignedGrade?: number; updateTime?: string;
  submissionHistory?: { stateHistory?: { state?: string; stateTimestamp?: string } }[];
  courseWorkType?: string; assignmentSubmission?: { attachments?: { driveFile?: { id?: string; title?: string } }[] }; shortAnswerSubmission?: { answer?: string }; multipleChoiceSubmission?: { answer?: string } };

/** 27 Nov (Alfonso: Najmi handed in with nothing attached): what came with a hand-in. Classroom gives every student a copy
 *  of a "make a copy for each student" file, so a hand-in with only that copy may or may not have been written in. */
/** 27 Nov: the Drive files attached to a hand-in (for the photo check), or null when it hasn't been handed in. */
const filesOf = (s: Sub): string | null => s.state !== "TURNED_IN" && s.state !== "RETURNED" ? null
  : JSON.stringify((s.assignmentSubmission?.attachments ?? []).filter((a) => a.driveFile?.id).slice(0, 10).map((a) => ({ id: a.driveFile!.id, title: (a.driveFile!.title ?? "").slice(0, 200) })));
const contentOf = (s: Sub, w: Work | undefined): string | null => {
  if (s.state !== "TURNED_IN" && s.state !== "RETURNED") return null;
  if (s.courseWorkType === "SHORT_ANSWER_QUESTION") return (s.shortAnswerSubmission?.answer ?? "").trim() ? "answer" : "none";
  if (s.courseWorkType === "MULTIPLE_CHOICE_QUESTION") return (s.multipleChoiceSubmission?.answer ?? "").trim() ? "answer" : "none";
  const n = s.assignmentSubmission?.attachments?.length ?? 0;
  if (!n) return "none";
  const copies = (w?.materials ?? []).filter((m) => m.driveFile?.shareMode === "STUDENT_COPY").length;
  return n <= copies ? "template_only" : "files";
};

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
  const info: ClassroomInfo = { at: new Date().toISOString(), by, classes: 0, work: 0, submissions: 0, joined: 0, problems: [], unmatched: [], tasters: [], trialSkipped: 0 };
  const groups = await withSchool((q) => q<{ id: string; code: string; course: string; trial: boolean }>(`select g.id, g.code, g.google_course_id as course, g.trial from course_groups g join academic_years y on y.id = g.academic_year_id
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
        // 26 Nov: a trial class: everyone in it is trying it, so nobody is "to match"
        if (g.trial) { info.trialSkipped! += still.length; still.length = 0; }
        // 26 Nov: children with a taster booking on this class (a month either side): an account with their Google email or name is a
        // taster, not a stranger; an account Google says nothing about is shown with the taster it might be
        const tasterRows = still.length ? await q<{ name: string; email: string | null; on: string }>(`select r.child_name as name, lower(r.child_email::text) as email, ev.lesson_date::text as on
            from taster_bookings tb join taster_requests r on r.id = tb.request_id join lesson_events ev on ev.id = tb.lesson_event_id
            where ev.group_id = $1 and tb.status <> 'cancelled' and ev.lesson_date between current_date - 30 and current_date + 30 order by ev.lesson_date`, [g.id]) : [];
        const day = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
        for (const s of [...still]) {
          const em = (s.profile?.emailAddress ?? "").toLowerCase(), nm = norm(s.profile?.name?.fullName ?? "");
          const t = tasterRows.find((r) => (em && r.email === em) || (nm && norm(r.name) === nm));
          if (t) { info.tasters!.push({ userId: s.userId, name: t.name, gid: g.id, code: g.code, when: day(t.on) }); still.splice(still.indexOf(s), 1); }
        }
        const unknownTaster = still.length && tasterRows.length ? `${tasterRows.map((r) => `${r.name} (${day(r.on)})`).slice(0, 3).join(", ")}` : null;
        // what each of them handed in, so the office can check it against the named student work in Classroom
        const title = new Map(work.items.map((w) => [w.id, (w.title ?? "Untitled").slice(0, 120)]));
        for (const s of still) {
          const handed = subs.items.filter((x) => x.userId === s.userId && (x.state === "TURNED_IN" || x.state === "RETURNED") && title.has(x.courseWorkId)).map((x) => title.get(x.courseWorkId)!);
          // 26 Nov: a link to one of their submissions in Classroom: Classroom shows the student's name there, even when Google
          // hides it from us
          const link = subs.items.find((x) => x.userId === s.userId && x.alternateLink)?.alternateLink ?? null;
          info.unmatched!.push({ userId: s.userId, name: s.profile?.name?.fullName ?? "(no name)", email: s.profile?.emailAddress ?? null, gid: g.id, code: g.code, handed: handed.slice(0, 30), set: work.items.length, link,
            taster: !handed.length && unknownTaster ? unknownTaster : null });
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
        const [row] = await q<{ id: string }>(`insert into classroom_coursework (school_id, group_id, coursework_id, title, due_at, max_points, link, description, materials, posted_at) values (current_school(), $1, $2, $3, $4, $5, $6, $7, $8, $9)
          on conflict (coursework_id) do update set group_id = excluded.group_id, title = excluded.title, due_at = excluded.due_at, max_points = excluded.max_points, link = excluded.link,
            description = excluded.description, materials = excluded.materials, posted_at = excluded.posted_at returning id`,
          [g.id, w.id, (w.title ?? "Untitled").slice(0, 300), dueOf(w), w.maxPoints && w.maxPoints > 0 ? w.maxPoints : null, w.alternateLink ?? null, w.description?.slice(0, 8000) ?? null, materialsOf(w), w.creationTime ?? null]);
        wid.set(w.id, row.id); info.work!++;
      }
      // work Classroom no longer has (deleted or unpublished) goes too
      await q(`delete from classroom_coursework where group_id = $1 and not (coursework_id = any($2::text[]))`, [g.id, work.items.map((w) => w.id)]);
      // each student's hand-in and mark
      // 26 Nov: a student can have two Classroom accounts (e.g. a parent's at first, then their own): per piece of work keep
      // the most complete hand-in (marked > returned > handed in > not handed in), so an empty one doesn't hide the real one
      const rank = (x: Sub) => (x.state === "RETURNED" && typeof x.assignedGrade === "number" ? 4 : x.state === "RETURNED" ? 3 : x.state === "TURNED_IN" ? 2 : 1);
      const workById = new Map(work.items.map((w) => [w.id, w]));
      const best = new Map<string, Sub>();
      for (const x of subs.items) {
        const sid = uid.get(x.userId), cw = wid.get(x.courseWorkId); if (!sid || !cw) continue;
        const k = `${sid}|${cw}`, cur = best.get(k);
        if (!cur || rank(x) > rank(cur)) best.set(k, x);
      }
      for (const s of best.values()) {
        const sid = uid.get(s.userId)!, cw = wid.get(s.courseWorkId)!;
        // 27 Nov (Alfonso): handed in with nothing attached counts as not handed in (missing), not as work to mark
        const content = contentOf(s, workById.get(s.courseWorkId)), st0 = STATE[s.state ?? ""] ?? "assigned", st = st0 === "turned_in" && content === "none" ? "assigned" : st0;
        const turned = [...(s.submissionHistory ?? [])].reverse().find((h) => h.stateHistory?.state === "TURNED_IN")?.stateHistory?.stateTimestamp ?? null;
        const pts = st === "returned" && typeof s.assignedGrade === "number" ? s.assignedGrade : null;
        await q(`insert into classroom_submissions (school_id, coursework_id, student_id, state, late, turned_in_at, points, graded_at, link, content, files) values (current_school(), $1, $2, $3::submission_state, $4, $5, $6, $7, $8, $9, $10::jsonb)
          on conflict (coursework_id, student_id) do update set state = excluded.state, late = excluded.late, turned_in_at = excluded.turned_in_at, points = excluded.points, link = excluded.link, content = excluded.content,
            photo_check = case when classroom_submissions.files is distinct from excluded.files then null else classroom_submissions.photo_check end, files = excluded.files,
            graded_at = case when excluded.points is null then null else coalesce(classroom_submissions.graded_at, excluded.graded_at) end`,
          [cw, sid, st, !!s.late, turned, pts, pts == null ? null : s.updateTime ?? new Date().toISOString(), s.alternateLink ?? null, content, filesOf(s)]);
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
        const [row] = await q<{ id: string }>(`insert into classroom_coursework (school_id, group_id, one_course_id, coursework_id, title, due_at, max_points, link, description, materials, posted_at) values (current_school(), null, $1, $2, $3, $4, $5, $6, $7, $8, $9)
          on conflict (coursework_id) do update set group_id = null, one_course_id = excluded.one_course_id, title = excluded.title, due_at = excluded.due_at, max_points = excluded.max_points, link = excluded.link,
            description = excluded.description, materials = excluded.materials, posted_at = excluded.posted_at returning id`,
          [o.id, w.id, (w.title ?? "Untitled").slice(0, 300), dueOf(w), w.maxPoints && w.maxPoints > 0 ? w.maxPoints : null, w.alternateLink ?? null, w.description?.slice(0, 8000) ?? null, materialsOf(w), w.creationTime ?? null]);
        wid.set(w.id, row.id); info.work!++;
      }
      await q(`delete from classroom_coursework where one_course_id = $1 and not (coursework_id = any($2::text[]))`, [o.id, work.items.map((w) => w.id)]);
      for (const s of subs.items) {
        const cw = wid.get(s.courseWorkId); if (!cw || !uids.has(s.userId)) continue;
        const content = contentOf(s, work.items.find((w) => w.id === s.courseWorkId)), st0 = STATE[s.state ?? ""] ?? "assigned", st = st0 === "turned_in" && content === "none" ? "assigned" : st0;
        const turned = [...(s.submissionHistory ?? [])].reverse().find((h) => h.stateHistory?.state === "TURNED_IN")?.stateHistory?.stateTimestamp ?? null;
        const pts = st === "returned" && typeof s.assignedGrade === "number" ? s.assignedGrade : null;
        await q(`insert into classroom_submissions (school_id, coursework_id, student_id, state, late, turned_in_at, points, graded_at, link, content, files) values (current_school(), $1, $2, $3::submission_state, $4, $5, $6, $7, $8, $9, $10::jsonb)
          on conflict (coursework_id, student_id) do update set state = excluded.state, late = excluded.late, turned_in_at = excluded.turned_in_at, points = excluded.points, link = excluded.link, content = excluded.content,
            photo_check = case when classroom_submissions.files is distinct from excluded.files then null else classroom_submissions.photo_check end, files = excluded.files,
            graded_at = case when excluded.points is null then null else coalesce(classroom_submissions.graded_at, excluded.graded_at) end`,
          [cw, o.student_id, st, !!s.late, turned, pts, pts == null ? null : s.updateTime ?? new Date().toISOString(), s.alternateLink ?? null, content, filesOf(s)]);
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
    await import("./handin-checks").then((m) => m.checkHandInPhotos(25)).catch((e) => console.error("hand-in photos", e));   // 27 Nov
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
