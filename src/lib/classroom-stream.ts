import "server-only";
import { withSchool } from "./db";
import { googleAccess } from "./meet";

// The teacher's "Classroom stream" module: the latest posts (announcements, assignments, materials) in the Google Classroom
// courses of the classes they teach, read with the recordings account (ose@, which teaches every course; read-only here).
// Each course's posts are kept for 10 minutes in meet_kv (stream2:<course id>) so My day stays quick.
const CLASSROOM = () => process.env.CLASSROOM_API_URL || "https://classroom.googleapis.com/v1";
const FRESH = 10 * 60e3;
export type StreamItem = { id: string; kind: "post" | "work" | "material"; title: string; text: string; at: string; link: string | null; course: string; colour: string | null;
  /** 2 Nov: a lesson recording (or other video): `link` opens the video itself, not the Classroom post */ video?: boolean };
type Mat = { driveFile?: { driveFile?: { id?: string; title?: string; alternateLink?: string } }; youtubeVideo?: { alternateLink?: string; title?: string }; link?: { url?: string } };
type Raw = { id: string; text?: string; title?: string; description?: string; creationTime?: string; updateTime?: string; alternateLink?: string; materials?: Mat[] };

/** The video a post carries, if it is one: a YouTube video, or a Drive video (a lesson recording is posted as "🎥 T1 Lesson 12"
 *  with the recording from Drive; other Drive files count when their name ends .mp4/.mov/.webm/.m4v). */
function videoLink(p: Raw, title: string): string | null {
  const m = p.materials ?? [];
  const yt = m.find((x) => x.youtubeVideo?.alternateLink)?.youtubeVideo?.alternateLink;
  if (yt) return yt;
  const drive = m.map((x) => x.driveFile?.driveFile).filter((f): f is { id?: string; title?: string; alternateLink?: string } => !!f);
  const vid = drive.find((f) => /\.(mp4|mov|webm|m4v)$/i.test(f.title ?? "")) ?? (/^\s*🎥/u.test(title) && drive.length === 1 ? drive[0] : undefined);
  return vid?.alternateLink ?? (vid?.id ? `https://drive.google.com/file/d/${encodeURIComponent(vid.id)}/view` : null);
}

async function fetchCourse(token: string, courseId: string): Promise<Omit<StreamItem, "course" | "colour">[]> {
  const c = encodeURIComponent(courseId);
  const lists: [StreamItem["kind"], string, string][] = [["post", `/courses/${c}/announcements?orderBy=updateTime%20desc&pageSize=8&announcementStates=PUBLISHED`, "announcements"],
    ["work", `/courses/${c}/courseWork?orderBy=updateTime%20desc&pageSize=8&courseWorkStates=PUBLISHED`, "courseWork"],
    ["material", `/courses/${c}/courseWorkMaterials?orderBy=updateTime%20desc&pageSize=8&courseWorkMaterialStates=PUBLISHED`, "courseWorkMaterial"]];
  const out: Omit<StreamItem, "course" | "colour">[] = [];
  await Promise.all(lists.map(async ([kind, path, key]) => {
    try {
      const r = await fetch(CLASSROOM() + path, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(6000) });
      if (!r.ok) return;
      const j = (await r.json()) as Record<string, Raw[]>;
      for (const p of j[key] ?? []) {
        const text = (kind === "post" ? p.text : p.description) ?? "";
        out.push({ id: `${kind}:${p.id}`, kind, title: kind === "post" ? text.split("\n")[0].slice(0, 120) : (p.title ?? "").slice(0, 120), text: (kind === "post" ? text.split("\n").slice(1).join(" ") : text).slice(0, 240),
          at: p.updateTime ?? p.creationTime ?? "", link: p.alternateLink ?? null });
        const title = out[out.length - 1].title, video = videoLink(p, title);
        if (video) Object.assign(out[out.length - 1], { link: video, video: true });
      }
    } catch { /* one list failing doesn't stop the others */ }
  }));
  return out;
}

export async function teacherStream(userId: string): Promise<{ connected: boolean; linked: number; items: StreamItem[] }> {
  const courses = await withSchool((q) => q<{ course: string; name: string; colour: string | null }>(`
    select distinct on (g.google_course_id) g.google_course_id as course, l.name || ' ' || sj.name as name, sj.colour
    from course_groups g join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
    where g.teacher_id = (select id from teachers where user_id = $1) and g.google_course_id is not null and g.status <> 'hidden'
      and g.academic_year_id = (select id from academic_years where ends_on >= current_date order by starts_on limit 1)`, [userId])).catch(() => []);
  if (!courses.length) return { connected: true, linked: 0, items: [] };
  const keys = courses.map((c) => `stream2:${c.course.replace(/[^a-z0-9_-]/gi, "").toLowerCase()}`);
  const cached = new Map((await withSchool((q) => q<{ key: string; value: { at: number; items: Omit<StreamItem, "course" | "colour">[] } }>(`select key, value from meet_kv where key = any($1::text[])`, [keys])).catch(() => [])).map((r) => [r.key, r.value]));
  let token: string | null = null, connected = true;
  const items: StreamItem[] = [];
  for (const [i, c] of courses.entries()) {
    let got = cached.get(keys[i]);
    if (!got || Date.now() - got.at > FRESH) {
      if (token === null && connected) { try { token = await googleAccess("rec"); } catch { connected = false; } }
      if (token) {
        const fresh = await fetchCourse(token, c.course);
        got = { at: Date.now(), items: fresh };
        await withSchool((q) => q(`insert into meet_kv (school_id, key, value) values (current_school(), $1, $2)
          on conflict (school_id, key) do update set value = excluded.value, updated_at = now()`, [keys[i], JSON.stringify(got)])).catch(() => null);
      }
    }
    for (const it of got?.items ?? []) items.push({ ...it, course: c.name, colour: c.colour });
  }
  items.sort((a, b) => (a.at < b.at ? 1 : -1));
  return { connected: connected || items.length > 0, linked: courses.length, items: items.slice(0, 20) };
}
