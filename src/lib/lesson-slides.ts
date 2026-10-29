import "server-only";
import { withSchool } from "./db";
import { googleAccess, DRIVE_URL } from "./meet";

// Finds each lesson's slides on its own, so teachers don't paste links. For lesson N of a term in a class:
//  1. the class's Google Classroom post (announcement, assignment or material) since the term started that mentions
//     "Lesson N": its attached Google Slides (or, failing that, its first Drive file);
//  2. otherwise a Google Slides file named "… Lesson N …" in the course's Classroom Drive folder.
// Read with the recordings account (ose@, which teaches every course). Each course is looked at once every 10 minutes
// (meet_kv slidesrc:<course id>). A link the teacher pastes still wins.
const CLASSROOM = () => process.env.CLASSROOM_API_URL || "https://classroom.googleapis.com/v1";
const FRESH = 10 * 60e3;
export type FoundSlides = { url: string; title: string; from: "classroom" | "drive" };
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

/** For each lesson (id, Classroom course, lesson number in its term, term start), the slides found, if any. */
export async function findSlides(lessons: { id: string; course: string | null; n: number | null; termStart: string | null }[]): Promise<Map<string, FoundSlides>> {
  const out = new Map<string, FoundSlides>();
  const todo = lessons.filter((l) => l.course && l.n && l.termStart);
  if (!todo.length) return out;
  const courses = [...new Set(todo.map((l) => l.course!))];
  const key = (c: string) => `slidesrc:${c.replace(/[^a-z0-9_-]/gi, "").toLowerCase()}`;
  const cached = new Map((await withSchool((q) => q<{ key: string; value: Src }>(`select key, value from meet_kv where key = any($1::text[])`, [courses.map(key)])).catch(() => [])).map((r) => [r.key, r.value]));
  let token: string | null | undefined;
  const src = new Map<string, Src>();
  for (const c of courses) {
    let s = cached.get(key(c));
    if (!s || Date.now() - s.at > FRESH) {
      if (token === undefined) token = await googleAccess("rec").catch(() => null);
      if (token) {
        s = await readCourse(token, c);
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
    const d = s.drive.find((f) => re.test(f.title));
    if (d) out.set(l.id, { url: d.url, title: d.title, from: "drive" });
  }
  return out;
}
