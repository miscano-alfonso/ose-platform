import "server-only";
import { withSchool } from "./db";
import { googleAccess, DRIVE_URL } from "./meet";

// Finds each lesson's slides on its own, so teachers don't paste links. For lesson N of a term in a class:
//  1. the class's slides folder in Google Drive (set by the teacher on their Google Drive page): a file named
//     "… Lesson N …" (in the folder or one folder down; one naming the term, "T2" / "Term 2", wins);
//  2. the class's Google Classroom post (announcement, assignment or material) that mentions "Lesson N": its
//     attached Google Slides (or, failing that, its first Drive file) — what students see once it's posted;
//  3. otherwise a Google Slides file named "… Lesson N …" in the course's Classroom Drive folder.
// Read with the recordings account (ose@, which teaches every course). Each course is looked at once every 10 minutes
// (meet_kv slidesrc:<course id>). A link the teacher pastes still wins.
const CLASSROOM = () => process.env.CLASSROOM_API_URL || "https://classroom.googleapis.com/v1";
const FRESH = 10 * 60e3;
export type FoundSlides = { url: string; title: string; from: "folder" | "classroom" | "drive" };
type File = { title: string; url: string; slides: boolean };
type Src = { at: number; posts: { text: string; at: string; files: File[] }[]; drive: File[] };
type Mat = { driveFile?: { driveFile?: { id?: string; title?: string; alternateLink?: string } }; link?: { url?: string; title?: string } };
type Raw = { text?: string; title?: string; description?: string; creationTime?: string; updateTime?: string; materials?: Mat[] };

const isSlides = (url: string, title: string) => /docs\.google\.com\/presentation\//.test(url) || /\.(pptx?|key)$/i.test(title) || /canva\.com\/design/.test(url);

async function get<T>(token: string, url: string): Promise<T | null> {
  try { const r = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(6000) }); return r.ok ? (await r.json()) as T : null; } catch { return null; }
}
async function readCourse(token: string, course: string): Promise<Src> {
  const c = encodeURIComponent(course), posts: Src["posts"] = [];
  const lists: [string, string][] = [[`/courses/${c}/announcements?orderBy=updateTime%20desc&pageSize=40&announcementStates=PUBLISHED`, "announcements"],
    [`/courses/${c}/courseWork?orderBy=updateTime%20desc&pageSize=40&courseWorkStates=PUBLISHED`, "courseWork"],
    [`/courses/${c}/courseWorkMaterials?orderBy=updateTime%20desc&pageSize=40&courseWorkMaterialStates=PUBLISHED`, "courseWorkMaterial"]];
  const [info, ...js] = await Promise.all([get<{ teacherFolder?: { id?: string } }>(token, `${CLASSROOM()}/courses/${c}`), ...lists.map(([p]) => get<Record<string, Raw[]>>(token, CLASSROOM() + p))]);
  js.forEach((j, i) => { for (const p of j?.[lists[i][1]] ?? []) {
    if ((p.title ?? "").startsWith("🎥")) continue;   // our own recording posts
    const files: File[] = [];
    for (const m of p.materials ?? []) {
      const d = m.driveFile?.driveFile;
      if (d?.alternateLink || d?.id) { const url = d.alternateLink ?? `https://drive.google.com/open?id=${d.id}`, title = d.title ?? "Slides"; files.push({ title, url, slides: isSlides(url, title) }); }
      else if (m.link?.url && /^https:\/\//.test(m.link.url)) files.push({ title: m.link.title ?? m.link.url, url: m.link.url, slides: isSlides(m.link.url, m.link.title ?? "") });
    }
    posts.push({ text: `${p.title ?? ""} ${p.text ?? ""} ${p.description ?? ""}`.slice(0, 2000), at: p.creationTime ?? p.updateTime ?? "", files });
  } });
  let drive: File[] = [];
  const folder = info?.teacherFolder?.id;
  if (folder && /^[\w-]+$/.test(folder)) {
    const u = new URL(DRIVE_URL() + "/files");
    u.searchParams.set("q", `'${folder}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.presentation'`);
    u.searchParams.set("fields", "files(id,name,webViewLink)"); u.searchParams.set("pageSize", "200");
    u.searchParams.set("supportsAllDrives", "true"); u.searchParams.set("includeItemsFromAllDrives", "true");
    const j = await get<{ files?: { id: string; name: string; webViewLink?: string }[] }>(token, u.toString());
    drive = (j?.files ?? []).map((f) => ({ title: f.name, url: f.webViewLink ?? `https://docs.google.com/presentation/d/${f.id}/edit`, slides: true }));
  }
  return { at: Date.now(), posts, drive };
}

const FOLDER = "application/vnd.google-apps.folder";
const SLIDE_TYPES = ["application/vnd.google-apps.presentation", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/vnd.ms-powerpoint", "application/pdf"];
type DFile = { id: string; name: string; mimeType: string; webViewLink?: string };
async function children(token: string, folder: string): Promise<DFile[]> {
  const out: DFile[] = []; let page = "";
  for (let i = 0; i < 5; i++) {
    const u = new URL(DRIVE_URL() + "/files");
    u.searchParams.set("q", `'${folder}' in parents and trashed = false`); u.searchParams.set("fields", "nextPageToken,files(id,name,mimeType,webViewLink)");
    u.searchParams.set("pageSize", "200"); u.searchParams.set("supportsAllDrives", "true"); u.searchParams.set("includeItemsFromAllDrives", "true"); if (page) u.searchParams.set("pageToken", page);
    const j = await get<{ files?: DFile[]; nextPageToken?: string }>(token, u.toString()); if (!j) break;
    out.push(...(j.files ?? [])); if (!j.nextPageToken) break; page = j.nextPageToken;
  }
  return out;
}
/** The slide files in a folder and the folders one level down (each file with the subfolder's name, for term matching). */
export async function folderSlides(token: string, folder: string): Promise<{ title: string; url: string; path: string }[]> {
  const top = await children(token, folder);
  const subs = top.filter((f) => f.mimeType === FOLDER).slice(0, 25);
  const deeper = await Promise.all(subs.map(async (d) => (await children(token, d.id)).map((f) => ({ ...f, path: d.name }))));
  return [...top.map((f) => ({ ...f, path: "" })), ...deeper.flat()].filter((f) => SLIDE_TYPES.includes(f.mimeType))
    .map((f) => ({ title: f.name, url: f.webViewLink ?? `https://drive.google.com/open?id=${f.id}`, path: f.path }));
}
type Dir = { at: number; files: { title: string; url: string; path: string }[] };
async function folderCached(token: () => Promise<string | null>, folder: string): Promise<Dir["files"]> {
  const key = `slidesdir:${folder.toLowerCase().replace(/[^a-z0-9_-]/g, "")}`.slice(0, 80);
  const c = (await withSchool((q) => q<{ value: Dir }>(`select value from meet_kv where key = $1`, [key])).catch(() => []))[0]?.value;
  if (c && Date.now() - c.at < FRESH) return c.files;
  const t = await token(); if (!t) return c?.files ?? [];
  const files = await folderSlides(t, folder);
  await withSchool((q) => q(`insert into meet_kv (school_id, key, value) values (current_school(), $1, $2)
    on conflict (school_id, key) do update set value = excluded.value, updated_at = now()`, [key, JSON.stringify({ at: Date.now(), files } satisfies Dir)])).catch(() => null);
  return files;
}

/** For each lesson (id, Classroom course, lesson number in its term, term start), the slides found, if any. */
export async function findSlides(lessons: { id: string; course: string | null; n: number | null; termStart: string | null; folder?: string | null; term?: number | null }[],
  opts: { classroomOnly?: boolean } = {}): Promise<Map<string, FoundSlides>> {
  const out = new Map<string, FoundSlides>();
  let tok: string | null | undefined;
  const token = async () => (tok === undefined ? (tok = await googleAccess("rec").catch(() => null)) : tok);
  // 1. the class's own slides folder
  if (!opts.classroomOnly) for (const l of lessons) {
    if (!l.folder || !l.n) continue;
    const files = await folderCached(token, l.folder).catch(() => []);
    const re = new RegExp(`lesson\\s*0*${l.n}\\b`, "i"), tre = l.term ? new RegExp(`\\b(t|term)\\s*0*${l.term}\\b`, "i") : null;
    const hits = files.filter((f) => re.test(f.title));
    const pick = (tre && hits.find((f) => tre.test(f.title) || tre.test(f.path))) || hits[0];
    if (pick) out.set(l.id, { url: pick.url, title: pick.title, from: "folder" });
  }
  const todo = lessons.filter((l) => l.course && l.n && l.termStart && !out.has(l.id));
  if (!todo.length) return out;
  const courses = [...new Set(todo.map((l) => l.course!))];
  const key = (c: string) => `slidesrc:${c.replace(/[^a-z0-9_-]/gi, "").toLowerCase()}`;
  const cached = new Map((await withSchool((q) => q<{ key: string; value: Src }>(`select key, value from meet_kv where key = any($1::text[])`, [courses.map(key)])).catch(() => [])).map((r) => [r.key, r.value]));
  const src = new Map<string, Src>();
  for (const c of courses) {
    let s = cached.get(key(c));
    if (!s || Date.now() - s.at > FRESH) {
      const t = await token();
      if (t) {
        s = await readCourse(t, c);
        const v = s;
        await withSchool((q) => q(`insert into meet_kv (school_id, key, value) values (current_school(), $1, $2)
          on conflict (school_id, key) do update set value = excluded.value, updated_at = now()`, [key(c), JSON.stringify(v)])).catch(() => null);
      }
    }
    if (s) src.set(c, s);
  }
  for (const l of todo) {
    const s = src.get(l.course!); if (!s) continue;
    const re = new RegExp(`lesson\\s*0*${l.n}\\b`, "i"), since = new Date(Date.parse(l.termStart + "T00:00:00Z") - 14 * 864e5).toISOString();   // posts made in the holiday before count
    const posts = s.posts.filter((p) => p.at >= since && re.test(p.text)).sort((a, b) => (a.at < b.at ? 1 : -1));
    const files = posts.flatMap((p) => p.files);
    const pick = files.find((f) => f.slides) ?? files[0];
    if (pick) { out.set(l.id, { url: pick.url, title: pick.title, from: "classroom" }); continue; }
    if (opts.classroomOnly) continue;
    const d = s.drive.find((f) => re.test(f.title));
    if (d) out.set(l.id, { url: d.url, title: d.title, from: "drive" });
  }
  return out;
}

/** For the teacher's Google Drive page: can the school's account see this folder, and which slide files are in it. */
export async function folderInfo(folder: string): Promise<{ ok: true; name: string; files: { title: string; url: string; path: string }[] } | { ok: false; error: string }> {
  const t = await googleAccess("rec").catch(() => null);
  if (!t) return { ok: false, error: "The school’s Google account isn’t connected yet, so folders can’t be read. The office connects it under Recordings." };
  const f = await get<{ name: string; mimeType: string }>(t, `${DRIVE_URL()}/files/${encodeURIComponent(folder)}?fields=name,mimeType&supportsAllDrives=true`);
  if (!f) return { ok: false, error: "share" };
  if (f.mimeType !== FOLDER) return { ok: false, error: "That link is a file, not a folder." };
  const files = await folderSlides(t, folder);
  const key = `slidesdir:${folder.toLowerCase().replace(/[^a-z0-9_-]/g, "")}`.slice(0, 80);
  await withSchool((q) => q(`insert into meet_kv (school_id, key, value) values (current_school(), $1, $2)
    on conflict (school_id, key) do update set value = excluded.value, updated_at = now()`, [key, JSON.stringify({ at: Date.now(), files })])).catch(() => null);
  return { ok: true, name: f.name, files };
}
export async function schoolDriveAccount(): Promise<string | null> {
  const { googleKv } = await import("./meet");
  return (await googleKv<{ mailbox?: string }>("rec_google").catch(() => null))?.mailbox ?? null;
}

/** For a student's My day: the slides of the last lesson of each class, once the teacher's Classroom post has gone
 *  out (never from the teacher's folder). Keyed by class (group) id. */
export async function studentLastSlides(studentId: string): Promise<Map<string, FoundSlides & { date: string }>> {
  const rows = await withSchool((q) => q<{ id: string; group_id: string; course: string | null; d: string; n: number; term_start: string }>(`
    select distinct on (e.group_id) e.id, e.group_id, g.google_course_id as course, e.lesson_date::text as d, t.starts_on::text as term_start,
      (select count(*)::int from lesson_events e2 join lesson_slots s2 on s2.id = e2.slot_id where e2.group_id = e.group_id and e2.term_id = e.term_id
        and e2.status <> 'cancelled' and (e2.lesson_date, s2.starts_at) <= (e.lesson_date, s.starts_at)) as n
    from enrolments x join course_groups g on g.id = x.group_id join lesson_events e on e.group_id = g.id join lesson_slots s on s.id = e.slot_id
      join terms t on t.id = e.term_id join schools sc on sc.id = e.school_id
    where x.student_id = $1 and x.status in ('pending','active') and e.status <> 'cancelled' and (e.lesson_date + s.ends_at) at time zone sc.timezone < now()
      and e.lesson_date > current_date - 21
    order by e.group_id, e.lesson_date desc, s.starts_at desc`, [studentId])).catch(() => []);
  const found = await findSlides(rows.map((r) => ({ id: r.id, course: r.course, n: r.n, termStart: r.term_start })), { classroomOnly: true }).catch(() => new Map<string, FoundSlides>());
  const out = new Map<string, FoundSlides & { date: string }>();
  for (const r of rows) { const f = found.get(r.id); if (f) out.set(r.group_id, { ...f, date: r.d }); }
  return out;
}
