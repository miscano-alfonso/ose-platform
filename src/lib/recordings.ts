import "server-only";
import { isTestMode } from "./test-mode";
import { withSchool } from "./db";
import { googleAccess, googleKv, googleKvSet, DRIVE_URL, MeetError, type Mailbox } from "./meet";

// Admin → Recordings: the "Weekly Meet Recordings Tracker" Apps Script (Code.gs + TitleCards.gs), moved into the dashboard.
// Every rule is kept; the two changes are (1) every video still in a raw Meet folder is processed, oldest first, instead
// of only files created today, and (2) the Classroom post is retried for 14 days, with a "Post now" button that works in either mode.
type Q = <T = Record<string, unknown>>(s: string, p?: unknown[]) => Promise<T[]>;
export class RecError extends Error {}
const fail = (m: string): never => { throw new RecError(m); };
const CLASSROOM = () => process.env.CLASSROOM_API_URL || "https://classroom.googleapis.com/v1";
const TZ = "Europe/London";
const FOLDER = "application/vnd.google-apps.folder";

export type RecCfg = { meetFolder?: string; transcriptsFolder?: string; flaggedFolder?: string; oneToOneFolder?: string; minBytes?: number;
  cardUrl?: string; cardSecret?: string; cardSeconds?: number; cardParallel?: number; cardStuckMinutes?: number; autoCards?: boolean;
  roundels?: [string, string][]; defaultLogo?: string;
  /** watch = only read Drive and Classroom (the Apps Script still does the work); live = the dashboard does it. Watch until launch. */
  mode?: "watch" | "live" };
export type RunInfo = { at?: string; by?: string; filed?: number; flagged?: number; posted?: number; cards?: number; problems?: string[]; error?: string };
export type Lesson = { id: string; kind: "class" | "one"; meet_code: string; name: string; course_id: string | null; folder_id: string | null; per_week: number | null; year_suffix: string | null; group_id: string | null; active: boolean };
type Term = { number: number; starts: string; ends: string; year: string };
type DFile = { id: string; name: string; mimeType: string; size?: string; createdTime: string; parents?: string[]; appProperties?: Record<string, string> };

export const recCfg = async () => (await googleKv<RecCfg>("rec_cfg")) ?? {};
export async function saveRecCfg(patch: Partial<RecCfg>) { const c = await recCfg(); await googleKvSet("rec_cfg", { ...c, ...patch }); }

// ---------- dates ----------
const londonDay = (iso: string | Date) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
const londonStamp = (iso: string) => { const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso)).map((x) => [x.type, x.value])); return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`; };
/** "Monday 5 October 2026", as the script sends it (no comma). */
export const longDate = (day: string) => { const d = new Date(day + "T12:00:00Z");
  return `${d.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" })} ${d.getUTCDate()} ${d.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" })} ${d.getUTCFullYear()}`; };
const termFor = (terms: Term[], day: string) => terms.find((t) => day >= t.starts && day <= t.ends) ?? null;
/** Mon–Fri weeks a term spans, as in getTermWeekCount_ (only used for the "exceeds expected weekly count" check). */
const termWeeks = (t: Term) => Math.ceil((Date.parse(t.ends) - Date.parse(t.starts)) / (7 * 864e5)) + 1;

// ---------- Google calls ----------
async function g<T>(token: string, url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, ...(init?.body ? { "content-type": "application/json" } : {}), ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) { const t = await r.text().catch(() => ""); throw new RecError(`Google answered ${r.status}${t ? ": " + t.slice(0, 160) : ""}`); }
  return (r.status === 204 ? {} : await r.json()) as T;
}
async function driveList(token: string, q: string, fields = "id,name,mimeType,size,createdTime,parents"): Promise<DFile[]> {
  const out: DFile[] = []; let page = "";
  for (let i = 0; i < 20; i++) {
    const u = new URL(DRIVE_URL() + "/files"); u.searchParams.set("q", q); u.searchParams.set("pageSize", "200"); u.searchParams.set("fields", `nextPageToken,files(${fields})`);
    u.searchParams.set("supportsAllDrives", "true"); u.searchParams.set("includeItemsFromAllDrives", "true"); if (page) u.searchParams.set("pageToken", page);
    const j = await g<{ files?: DFile[]; nextPageToken?: string }>(token, u.toString()); out.push(...(j.files ?? [])); if (!j.nextPageToken) break; page = j.nextPageToken;
  }
  return out;
}
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
/** Rename and/or move a file (moving keeps its id and link, so the sheet link and Classroom attachment still work). */
async function driveUpdate(token: string, id: string, o: { name?: string; from?: string; to?: string; trashed?: boolean }) {
  const u = new URL(`${DRIVE_URL()}/files/${encodeURIComponent(id)}`); u.searchParams.set("supportsAllDrives", "true");
  if (o.to) { u.searchParams.set("addParents", o.to); if (o.from) u.searchParams.set("removeParents", o.from); }
  const body: Record<string, unknown> = {}; if (o.name) body.name = o.name; if (o.trashed) body.trashed = true;
  await g(token, u.toString(), { method: "PATCH", body: JSON.stringify(body) });
}

// ---------- the settings (classes and 1:1s, from the script's constants) ----------
export async function recLessons(): Promise<(Lesson & { group: string | null })[]> {
  return withSchool((q) => q<Lesson & { group: string | null }>(`select r.id, r.kind, r.meet_code, r.name, r.course_id, r.folder_id, r.per_week, r.year_suffix, r.group_id, r.active,
      (select l.name || ' ' || sj.name || ' (' || g.code || ')' from course_groups g join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id where g.id = r.group_id) as "group"
    from rec_lessons r order by r.kind, r.name`));
}
export async function saveLesson(d: { id?: string; kind: string; meet_code: string; name: string; course_id: string; folder_id: string; per_week: string; year_suffix: string; active: boolean }): Promise<string | null> {
  const code = d.meet_code.trim().toLowerCase().replace(/^https?:\/\/meet\.google\.com\//, "");
  if (!/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(code)) return "The Meet code looks like abc-defg-hij.";
  if (!d.name.trim()) return d.kind === "one" ? "Give the 1:1 a label, e.g. “Luke Withers - GCSE Chemistry”." : "Enter the class name exactly as the recordings should be named, e.g. “GCSE Geography”.";
  const course = d.course_id.trim(); if (course && !/^\d{6,20}$/.test(course)) return "The Classroom course ID is the number (see the help under the table).";
  const folder = d.folder_id.trim().replace(/^.*\/folders\//, "").replace(/[?#].*$/, ""); if (folder && !/^[\w-]{10,80}$/.test(folder)) return "Paste the Drive folder’s link or ID.";
  const pw = d.per_week ? Number(d.per_week) : null; const ys = d.year_suffix === "Yr1" || d.year_suffix === "Yr2" ? d.year_suffix : null;
  try {
    await withSchool(async (q) => {
      if (d.id) await q(`update rec_lessons set meet_code = $2, name = $3, course_id = $4, folder_id = $5, per_week = $6, year_suffix = $7, active = $8 where id = $1`,
        [d.id, code, d.name.trim().slice(0, 120), course || null, folder || null, pw, ys, d.active]);
      else await q(`insert into rec_lessons (school_id, kind, meet_code, name, course_id, folder_id, per_week, year_suffix) values (current_school(), $1, $2, $3, $4, $5, $6, $7)`,
        [d.kind === "one" ? "one" : "class", code, d.name.trim().slice(0, 120), course || null, folder || null, pw, ys]);
      await q(`update rec_lessons r set group_id = g.id from course_groups g join academic_years y on y.id = g.academic_year_id
        where r.meet_code = $1 and r.kind = 'class' and y.ends_on >= current_date and replace(lower(g.meet_url), '-', '') like '%' || replace(r.meet_code, '-', '') || '%'`, [code]);
    });
  } catch (e) { return (e as { code?: string }).code === "23505" ? "That Meet code is already in the list." : "Couldn’t save that."; }
  return null;
}

// ---------- Classroom: the teacher's lesson post, and our recording post ----------
type Post = { id: string; title?: string; text?: string; description?: string; creationTime: string; topicId?: string; creatorUserId?: string;
  materials?: { driveFile?: { driveFile?: { title?: string } } }[] };
async function lessonPosts(token: string, courseId: string, lessonNumber: number, termStart: string): Promise<{ post: Post; kind: string }[]> {
  const pattern = new RegExp("lesson\\s*0*" + lessonNumber + "\\b", "i"), since = new Date(termStart + "T00:00:00Z").toISOString(), out: { post: Post; kind: string }[] = [];
  const c = encodeURIComponent(courseId);
  const lists: [string, string, string][] = [["ann", `/courses/${c}/announcements?orderBy=updateTime%20desc&pageSize=30&announcementStates=PUBLISHED`, "announcements"],
    ["cw", `/courses/${c}/courseWork?orderBy=updateTime%20desc&pageSize=30&courseWorkStates=PUBLISHED`, "courseWork"],
    ["cwm", `/courses/${c}/courseWorkMaterials?orderBy=updateTime%20desc&pageSize=30&courseWorkMaterialStates=PUBLISHED`, "courseWorkMaterial"]];
  for (const [kind, path, key] of lists) {
    try {
      const j = await g<Record<string, Post[]>>(token, CLASSROOM() + path);
      for (const p of j[key] ?? []) {
        if ((p.title ?? "").startsWith("🎥")) continue;   // our own recording posts
        const text = kind === "ann" ? p.text ?? "" : `${p.title ?? ""} ${p.description ?? ""}`;
        if (p.creationTime >= since && pattern.test(text)) out.push({ post: p, kind });
      }
    } catch { /* one list failing doesn't stop the others, as in the script */ }
  }
  return out.sort((a, b) => (a.post.creationTime < b.post.creationTime ? 1 : -1));
}
/** attachRecordingToClassroom_: needs a teacher post mentioning "Lesson n" this term (unless forced); posts "🎥 T<n> Lesson <n>" once, under the same topic. */
async function postToClassroom(token: string, courseId: string | null, lessonNumber: number, term: Term, fileId: string, force: boolean): Promise<{ state: string; note?: string }> {
  if (!courseId) return { state: "no_course", note: "No Classroom course set for this class." };
  const found = await lessonPosts(token, courseId, lessonNumber, term.starts);
  if (!found.length && !force) return { state: "waiting", note: `No Classroom post mentions “Lesson ${lessonNumber}” yet.` };
  const topicId = found.find((x) => x.kind !== "ann")?.post.topicId ?? (found[0]?.kind !== "ann" ? found[0]?.post.topicId : undefined);
  const title = `🎥 T${term.number} Lesson ${lessonNumber}`, since = new Date(term.starts + "T00:00:00Z").toISOString(), c = encodeURIComponent(courseId);
  try {
    const ex = await g<{ courseWorkMaterial?: Post[] }>(token, `${CLASSROOM()}/courses/${c}/courseWorkMaterials?orderBy=updateTime%20desc&pageSize=30&courseWorkMaterialStates=PUBLISHED`);
    if ((ex.courseWorkMaterial ?? []).some((m) => m.title === title && m.creationTime >= since)) return { state: "already", note: `“${title}” was already in Classroom.` };
  } catch { /* fall through and try to create it, as the script does */ }
  try {
    await g(token, `${CLASSROOM()}/courses/${c}/courseWorkMaterials`, { method: "POST", body: JSON.stringify({ title, state: "PUBLISHED", ...(topicId ? { topicId } : {}),
      materials: [{ driveFile: { driveFile: { id: fileId }, shareMode: "VIEW" } }] }) });
    return { state: "posted", note: title };
  } catch (e) { return { state: "error", note: e instanceof Error ? e.message : String(e) }; }
}

// ---------- title cards ----------
const COURSE_WORDS = /^(pre|gcse|igcse|ks3|y\d|yr\d|year|h|f|higher|foundation|double|award|english|lang|language|literature|lit|maths?|science|biology|chemistry|physics|history|geography|business|[\d.]+)$/i;
/** tcCleanTitle_ */
export function cleanTitle(s: string): string {
  let t = String(s).replace(/\.(pptx?|docx?|pdf|key)$/i, "").replace(/_/g, " ").replace(/\(\d+\)\s*$/, "").replace(/\bworksheet\b/gi, "")
    .replace(/\b(term|t)\s*\d+\b/gi, "").replace(/\b(lesson|week|wk|l)\s*\d+\b/gi, "").replace(/\b(assignment|homework)\b/gi, "");
  if (!/\s/.test(t.trim()) && (t.match(/-/g) || []).length >= 3) {
    t = t.replace(/-/g, " ").replace(/\bgcse\s+9\s+1\b.*$/i, "").replace(/\s+\d+\s*$/, "").trim(); t = t.charAt(0).toUpperCase() + t.slice(1);
  }
  for (;;) {
    const m = t.match(/^\s*([^:\-–|·]*?)\s*[:\-–|·]+\s*/); if (!m || m[0].length >= t.length) break;
    const words = m[1].split(/[\s-]+/).filter(Boolean); if (!words.every((w) => COURSE_WORDS.test(w))) break;
    t = t.slice(m[0].length);
  }
  t = t.replace(/[\s:\-–·|,]+$/g, "").replace(/^[\s:\-–·|,]+/g, "").replace(/\s{2,}/g, " ").trim();
  if (t.split(/[\s-]+/).filter(Boolean).every((w) => COURSE_WORDS.test(w))) return "";
  return t;
}
/** tcLessonInfo_: lesson title from the teacher's post (its first attached file, else its title), and who taught it. */
async function lessonInfo(token: string, courseId: string | null, lessonNumber: number, term: Term): Promise<{ title: string; teacher: string }> {
  const info = { title: "", teacher: "" }; if (!courseId) return info;
  const posts = await lessonPosts(token, courseId, lessonNumber, term.starts); if (!posts.length) return info;
  const p = posts[0].post;
  const file = (p.materials ?? []).map((m) => m.driveFile?.driveFile?.title).find(Boolean);
  info.title = cleanTitle(file || p.title || "");
  const ose = /oh-?so ed|unknown user/i;
  try { if (p.creatorUserId) info.teacher = (await g<{ name?: { fullName?: string } }>(token, `${CLASSROOM()}/userProfiles/${encodeURIComponent(p.creatorUserId)}`)).name?.fullName ?? ""; } catch { /* */ }
  if (!info.teacher || ose.test(info.teacher)) {
    try { const ts = (await g<{ teachers?: { profile?: { name?: { fullName?: string } } }[] }>(token, `${CLASSROOM()}/courses/${encodeURIComponent(courseId)}/teachers`)).teachers ?? [];
      info.teacher = ts.map((t) => t.profile?.name?.fullName ?? "").find((n) => n && !ose.test(n)) ?? ""; } catch { info.teacher = ""; }
  }
  return info;
}
const logoFor = (cfg: RecCfg, name: string) => (cfg.roundels ?? []).find(([kw]) => name.includes(kw))?.[1] ?? cfg.defaultLogo ?? "";
type CardRow = { id: string; file_id: string; card_title: string | null; card_teacher: string | null; card_logo: string | null; card_label: string | null; card_term_lesson: string | null; card_date: string | null };
export const cardKey = (r: Pick<CardRow, "card_title" | "card_teacher" | "card_logo" | "card_label" | "card_term_lesson" | "card_date">) =>
  ["v2", r.card_title ?? "", r.card_teacher ?? "", r.card_logo ?? "", r.card_label ?? "", r.card_term_lesson ?? "", r.card_date ?? ""].join("|");
const job = (r: CardRow) => ({ logoId: r.card_logo, course: r.card_label, termLesson: r.card_term_lesson, lessonTitle: r.card_title ?? "", teacher: r.card_teacher ?? "", date: r.card_date ?? "" });
async function cardCall(cfg: RecCfg, path: string, payload: unknown, token: string): Promise<Response> {
  if (!cfg.cardUrl || !cfg.cardSecret) fail("Add the title-card service URL and secret under Settings first.");
  return fetch(cfg.cardUrl!.replace(/\/$/, "") + path, { method: "POST", signal: AbortSignal.timeout(60000),
    headers: { "content-type": "application/json", "X-Title-Card-Secret": cfg.cardSecret!, authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
}
/** A fresh preview from the title-card service (/card, 960 wide). */
export async function renderPreview(id: string): Promise<string | null> {
  const cfg = await recCfg(); const token = await googleAccess("rec");
  const [r] = await withSchool((q) => q<CardRow>(`select id, file_id, card_title, card_teacher, card_logo, card_label, card_term_lesson, card_date from recordings where id = $1`, [id]));
  if (!r) return "That recording wasn’t found.";
  const res = await cardCall(cfg, "/card", { ...job(r), width: 960 }, token);
  if (!res.ok) { const t = await res.text().catch(() => ""); await withSchool((q) => q(`update recordings set card_note = $2 where id = $1`, [id, `Preview failed: ${res.status} ${t.slice(0, 60)}`])); return `The title-card service said ${res.status}.`; }
  const png = Buffer.from(await res.arrayBuffer());
  await withSchool((q) => q(`update recordings set card_preview = $2, card_key = $3, card_note = null where id = $1`, [id, png, cardKey(r)]));
  return null;
}

// ---------- the main run (dailyUpdate) ----------
let running = false;
export async function runRecordings(by: string): Promise<RunInfo> {
  if (running) return { error: "A run is already going." };
  running = true;
  const info: RunInfo = { at: new Date().toISOString(), by, filed: 0, flagged: 0, posted: 0, cards: 0, problems: [] };
  try {
    const cfg = await recCfg();
    let token: string;
    try { token = await googleAccess("rec"); } catch (e) { info.error = e instanceof MeetError ? e.message : "Couldn’t reach Google."; return info; }
    if (!cfg.meetFolder) { info.error = "Set the Google Meet folder under Settings."; return info; }
    const [lessons, terms] = await withSchool(async (q) => [
      await q<Lesson>(`select id, kind, meet_code, name, course_id, folder_id, per_week, year_suffix, group_id, active from rec_lessons where active`),
      await q<Term>(`select t.number, t.starts_on::text as starts, t.ends_on::text as ends, extract(year from y.starts_on)::text as year from terms t join academic_years y on y.id = t.academic_year_id where y.ends_on >= current_date - 400 order by t.starts_on`),
    ] as const);
    const byCode = new Map(lessons.map((l) => [l.meet_code, l]));
    // the first time: bring in what the Apps Script already filed, so earlier weeks and the lesson numbers show here
    const [{ n: had }] = await withSchool((q) => q<{ n: number }>(`select count(*)::int as n from recordings`));
    if (cfg.mode !== "live" || await isTestMode()) {   // test mode: watch only, whatever the setting
      // WATCH ONLY: read what the Apps Script has filed and posted; never rename, move, post or add cards
      try { info.filed = await importFiled(token, cfg, lessons, terms); } catch (e) { info.problems!.push(`Reading the folders: ${e instanceof Error ? e.message : e}`); }
      try { await checkClassroom(token, terms); } catch (e) { info.problems!.push(`Reading Classroom: ${e instanceof Error ? e.message : e}`); }
      return info;
    }
    if (!had) { try { await importFiled(token, cfg, lessons, terms); } catch (e) { info.problems!.push(`Importing earlier recordings: ${e instanceof Error ? e.message : e}`); } }
    // 1) new recordings in the raw Meet folders
    const folders = await driveList(token, `'${esc(cfg.meetFolder)}' in parents and mimeType = '${FOLDER}' and trashed = false`, "id,name,createdTime");
    for (const folder of folders) {
      const code = [...byCode.keys()].find((c) => folder.name.indexOf(c) === 0); if (!code) continue;   // unknown codes are never touched
      const lesson = byCode.get(code)!;
      try { await processFolder(token, cfg, lesson, folder, terms, info); }
      catch (e) { info.problems!.push(`${lesson.name}: ${e instanceof Error ? e.message : e}`); }
    }
    // 2) Classroom posts still waiting for the teacher's post (tried again for 14 days), and forced ones
    const waiting = await withSchool((q) => q<{ id: string; file_id: string; lesson_number: number; term_number: number; recorded_at: string; course_id: string | null; force_post: boolean; tries: number }>(`
      select r.id, r.file_id, r.lesson_number, r.term_number, r.recorded_at::text, l.course_id, r.force_post, r.classroom_tries as tries from recordings r join rec_lessons l on l.id = r.lesson_id
      where r.status = 'filed' and (r.classroom in ('waiting', 'error') or r.force_post) and r.classroom <> 'posted' and r.recorded_at > now() - interval '14 days' order by r.recorded_at limit 40`));
    for (const w of waiting) {
      const term = termFor(terms, londonDay(w.recorded_at)); if (!term) continue;
      const res = await postToClassroom(token, w.course_id, w.lesson_number, term, w.file_id, w.force_post);
      if (res.state === "posted") info.posted!++;
      await withSchool((q) => q(`update recordings set classroom = $2, classroom_note = $3, classroom_tries = classroom_tries + 1, force_post = false where id = $1`, [w.id, res.state === "waiting" && w.tries > 40 ? "gave_up" : res.state, res.note ?? null]));
    }
    await withSchool((q) => q(`update recordings set classroom = 'gave_up' where classroom = 'waiting' and recorded_at <= now() - interval '14 days'`));
    // 3) title cards
    info.cards = await cardWork(token, cfg, info);
  } finally {
    running = false;
    info.problems = info.problems!.slice(0, 20);
    await googleKvSet("rec_run", info).catch(() => {});
  }
  return info;
}

/** Recordings already filed by the Apps Script (or by hand), read from the subject folders and 1:1 folders by their names
 *  ("2026 GCSE Geography Yr1 - T1 Lesson 12", "2026 Luke Withers - GCSE Chemistry T1 Lesson 3"). Nothing is renamed or moved. */
export async function importFiled(token: string, cfg: RecCfg, lessons: Lesson[], terms: Term[]): Promise<number> {
  const years = [...new Set(terms.map((t) => t.year))];
  const byFolder = new Map<string, Lesson[]>();
  for (const l of lessons) {
    let folder = l.folder_id;
    if (!folder && l.kind === "one" && cfg.oneToOneFolder) folder = (await driveList(token, `'${esc(cfg.oneToOneFolder)}' in parents and mimeType = '${FOLDER}' and trashed = false and name = '${esc("_" + l.name)}'`, "id,name"))[0]?.id ?? null;
    if (folder) byFolder.set(folder, [...(byFolder.get(folder) ?? []), l]);
  }
  let added = 0;
  for (const [folder, ls] of byFolder) {
    const files = await driveList(token, `'${esc(folder)}' in parents and mimeType = 'video/mp4' and trashed = false`, "id,name,size,createdTime,appProperties");
    for (const f of files) {
      for (const l of ls) {
        let m: RegExpMatchArray | null = null;
        for (const y of years) {
          const pre = l.kind === "class" ? `${y} ${l.name}${l.year_suffix ? " " + l.year_suffix : ""} - T` : `${y} ${l.name} T`;
          if (f.name.indexOf(pre) === 0) { m = f.name.slice(pre.length).match(/^(\d+) Lesson (\d+)/); if (m) break; }
        }
        if (!m) continue;
        const day = londonDay(f.createdTime), term = termFor(terms, day);
        const done = f.appProperties?.titleCard === "done";
        const r = await withSchool((q) => q(`insert into recordings (school_id, lesson_id, file_id, raw_name, name, recorded_at, size_bytes, term_number, lesson_number, status, over_expected, classroom, classroom_note,
            card_label, card_term_lesson, card_date, card_status)
          values (current_school(), $1, $2, $2, $3, $4, $5, $6, $7, 'filed', $8, 'not_needed', 'Filed by the Apps Script', $9, $10, $11, $12)
          on conflict (school_id, file_id) do update set name = excluded.name, card_status = case when excluded.card_status = 'done' then 'done' else recordings.card_status end
          returning (xmax = 0) as added`,
          [l.id, f.id, f.name, f.createdTime, Number(f.size ?? 0), Number(m[1]), Number(m[2]), /exceeds expected/.test(f.name),
           l.kind === "one" ? `1:1 · ${l.name}` : l.name, `Term ${m[1]} · Lesson ${m[2]}`, longDate(day), done ? "done" : null]));
        if ((r[0] as { added?: boolean } | undefined)?.added) added++;
        void term; break;
      }
    }
  }
  return added;
}

/** Watch only: is each recent recording's "🎥 T<n> Lesson <n>" post in Classroom yet? (read-only) */
async function checkClassroom(token: string, terms: Term[]) {
  const rows = await withSchool((q) => q<{ id: string; course_id: string | null; term_number: number; lesson_number: number; recorded_at: string }>(`select r.id, l.course_id, r.term_number, r.lesson_number, r.recorded_at::text
    from recordings r join rec_lessons l on l.id = r.lesson_id where r.status = 'filed' and r.classroom in ('not_needed', 'waiting') and r.recorded_at > now() - interval '21 days'`));
  const byCourse = new Map<string, Post[]>();
  for (const r of rows) {
    if (!r.course_id) continue;
    if (!byCourse.has(r.course_id)) byCourse.set(r.course_id, ((await g<{ courseWorkMaterial?: Post[] }>(token, `${CLASSROOM()}/courses/${encodeURIComponent(r.course_id)}/courseWorkMaterials?orderBy=updateTime%20desc&pageSize=60&courseWorkMaterialStates=PUBLISHED`).catch(() => ({}))) as { courseWorkMaterial?: Post[] }).courseWorkMaterial ?? []);
    const term = terms.find((t) => t.number === r.term_number && londonDay(r.recorded_at) >= t.starts && londonDay(r.recorded_at) <= t.ends);
    const title = `🎥 T${r.term_number} Lesson ${r.lesson_number}`, since = term ? new Date(term.starts + "T00:00:00Z").toISOString() : "";
    const there = byCourse.get(r.course_id)!.some((m) => m.title === title && m.creationTime >= since);
    await withSchool((q) => q(`update recordings set classroom = $2, classroom_note = $3 where id = $1`, [r.id, there ? "already" : "waiting", there ? title : "Not in Classroom. The Apps Script checks only once, when it files the recording, so if the teacher posted the lesson later it was skipped: press Post now."]));
  }
}

/** One lesson's raw Meet folder: populateTodayRecordings_ / processOneToOneRecordings_. */
async function processFolder(token: string, cfg: RecCfg, lesson: Lesson, folder: DFile, terms: Term[], info: RunInfo) {
  const files = await driveList(token, `'${esc(folder.id)}' in parents and trashed = false`);
  const known = new Set((await withSchool((q) => q<{ f: string }>(`select file_id as f from recordings where file_id = any($1::text[])`, [files.map((f) => f.id)]))).map((x) => x.f));
  const videos = files.filter((f) => f.mimeType === "video/mp4" && !known.has(f.id)).sort((a, b) => a.createdTime.localeCompare(b.createdTime));
  if (!videos.length) { await trashIfEmpty(token, folder.id, files.length); return; }
  // sessions: videos within an hour of each other are one session (a disconnect/reconnect); further apart is another lesson
  const sessions: DFile[][] = [];
  for (const v of videos) { const last = sessions[sessions.length - 1]; if (last && Date.parse(v.createdTime) - Date.parse(last[last.length - 1].createdTime) < 3600e3 && londonDay(v.createdTime) === londonDay(last[0].createdTime)) last.push(v); else sessions.push([v]); }
  const minBytes = cfg.minBytes ?? 5 * 1024 * 1024;
  for (const session of sessions) {
    const day = londonDay(session[0].createdTime), term = termFor(terms, day);
    if (!term) {   // outside term dates: left where it is, listed for the office (as the script skipped these days)
      for (const v of session) await insertRec({ lesson, v, status: "outside_term", name: v.name, term: null, n: null });
      continue;
    }
    // short recordings (splitOutShortRecordings_): flagged, never numbered
    const real: DFile[] = [];
    for (const v of session) {
      if (Number(v.size ?? 0) >= minBytes) { real.push(v); continue; }
      const name = `${term.year} ${lesson.name} - possible accidental join (${Math.round(Number(v.size ?? 0) / 1024)}KB, ${londonStamp(v.createdTime)})`;
      if (cfg.flaggedFolder) await driveUpdate(token, v.id, { name, to: cfg.flaggedFolder, from: folder.id }); else await driveUpdate(token, v.id, { name });
      await insertRec({ lesson, v, status: "short", name, term, n: null }); info.flagged!++;
    }
    if (!real.length) continue;
    real.sort((a, b) => Number(b.size ?? 0) - Number(a.size ?? 0));
    const main = real[0];
    let n: number, baseName: string, dest: string | null, over = false;
    if (lesson.kind === "class") {
      // the next lesson number this term: one more than the highest already filed (the database and the subject folder's names)
      n = (await highestThisTerm(token, lesson, term)) + 1;
      const expected = lesson.per_week ? lesson.per_week * termWeeks(term) : null; over = !!expected && n > expected;
      baseName = `${term.year} ${lesson.name}${lesson.year_suffix ? " " + lesson.year_suffix : ""} - T${term.number} Lesson ${n}`;
      dest = lesson.folder_id;
    } else {
      dest = await oneToOneFolder(token, cfg, lesson);
      const prefix = `${term.year} ${lesson.name} T${term.number} Lesson `;
      const existing = dest ? await driveList(token, `'${esc(dest)}' in parents and mimeType = 'video/mp4' and trashed = false and name contains '${esc(prefix)}'`, "id,name") : [];
      n = existing.filter((f) => f.name.indexOf(prefix) === 0).length + 1; baseName = prefix + n;
    }
    const name = over ? baseName + " (check - exceeds expected weekly count)" : baseName;
    // rename and file FIRST, before anything that could fail (so a later failure can't make it be found and numbered again)
    await driveUpdate(token, main.id, { name, ...(dest ? { to: dest, from: folder.id } : {}) });
    for (const x of real.slice(1)) { const xn = x.name.includes("(check duplicate)") ? x.name : x.name + " (check duplicate)"; await driveUpdate(token, x.id, { name: xn, ...(dest ? { to: dest, from: folder.id } : {}) }); }
    const recId = await insertRec({ lesson, v: main, status: dest ? "filed" : "unfiled", name, term, n, over });
    for (const x of real.slice(1)) await insertRec({ lesson, v: x, status: "duplicate", name: x.name.includes("(check duplicate)") ? x.name : x.name + " (check duplicate)", term, n: null });
    if (!dest) info.problems!.push(`${lesson.name}: no subject folder set, so the recording was renamed but left in the Meet folder.`);
    info.filed!++;
    // transcripts made the same day in this folder (archiveTodaysTranscripts_)
    try {
      const ts = files.filter((f) => f.mimeType === "text/plain" && /chat transcript/i.test(f.name) && londonDay(f.createdTime) === day);
      const tName = over ? baseName + " - Transcript (check - exceeds expected weekly count)" : baseName + " - Transcript";
      const to = lesson.kind === "class" ? cfg.transcriptsFolder : dest;
      let k = 0;
      for (const t of ts) { k++; await driveUpdate(token, t.id, { name: k > 1 ? `${tName} (${k})` : tName, ...(to ? { to, from: folder.id } : {}) }); }
      if (k) await withSchool((q) => q(`update recordings set transcripts = $2 where id = $1`, [recId, k]));
    } catch (e) { info.problems!.push(`${lesson.name} transcript: ${e instanceof Error ? e.message : e}`); }
    // Classroom
    try {
      const res = await postToClassroom(token, lesson.course_id, n, term, main.id, false);
      if (res.state === "posted") info.posted!++;
      await withSchool((q) => q(`update recordings set classroom = $2, classroom_note = $3, classroom_tries = 1 where id = $1`, [recId, res.state, res.note ?? null]));
    } catch (e) { await withSchool((q) => q(`update recordings set classroom = 'error', classroom_note = $2 where id = $1`, [recId, String(e).slice(0, 200)])); }
    // title card row (prepareTitleCards): title and teacher from the teacher's post
    try {
      const li = await lessonInfo(token, lesson.course_id, n, term);
      await withSchool((q) => q(`update recordings set card_title = $2, card_teacher = $3, card_logo = $4, card_label = $5, card_term_lesson = $6, card_date = $7, card_status = $8 where id = $1`,
        [recId, li.title, li.teacher, logoFor(cfg, lesson.name), lesson.kind === "one" ? `1:1 · ${lesson.name}` : lesson.name, `Term ${term.number} · Lesson ${n}`, longDate(day), cfg.autoCards ? "queued" : "awaiting"]));
    } catch (e) { info.problems!.push(`${lesson.name} title card: ${e instanceof Error ? e.message : e}`); }
  }
  // the raw folder: trashed (recoverable) once it's empty
  const left = await driveList(token, `'${esc(folder.id)}' in parents and trashed = false`, "id");
  await trashIfEmpty(token, folder.id, left.length);

  async function insertRec(o: { lesson: Lesson; v: DFile; status: string; name: string; term: Term | null; n: number | null; over?: boolean }): Promise<string> {
    const r = await withSchool((q) => q<{ id: string }>(`insert into recordings (school_id, lesson_id, file_id, raw_name, name, recorded_at, size_bytes, term_number, lesson_number, status, over_expected, classroom)
      values (current_school(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) on conflict (school_id, file_id) do update set name = excluded.name returning id`,
      [o.lesson.id, o.v.id, o.v.name, o.name, o.v.createdTime, Number(o.v.size ?? 0), o.term?.number ?? null, o.n, o.status, !!o.over, o.status === "filed" ? "waiting" : "not_needed"]));
    return r[0].id;
  }
}
async function trashIfEmpty(token: string, id: string, count: number) { if (count === 0) await driveUpdate(token, id, { trashed: true }).catch(() => {}); }
/** The highest lesson number already filed for this class this term: from the dashboard's records and the subject folder's file names. */
async function highestThisTerm(token: string, lesson: Lesson, term: Term): Promise<number> {
  const [db] = await withSchool((q) => q<{ n: number | null }>(`select max(lesson_number)::int as n from recordings where lesson_id = $1 and term_number = $2 and status = 'filed'
    and recorded_at >= $3::date - 1`, [lesson.id, term.number, term.starts]));
  let n = db?.n ?? 0;
  if (lesson.folder_id) {
    const base = `${term.year} ${lesson.name}${lesson.year_suffix ? " " + lesson.year_suffix : ""} - T${term.number} Lesson `;
    const files = await driveList(token, `'${esc(lesson.folder_id)}' in parents and trashed = false and name contains '${esc(base)}'`, "id,name,createdTime");
    for (const f of files) { if (f.createdTime.slice(0, 10) < term.starts) continue; const m = f.name.slice(base.length).match(/^(\d+)/); if (f.name.indexOf(base) === 0 && m) n = Math.max(n, Number(m[1])); }
  }
  return n;
}
/** getOrCreateOneToOneFolder_: "_<label>" inside the 1to1s folder, made the first time. */
async function oneToOneFolder(token: string, cfg: RecCfg, lesson: Lesson): Promise<string | null> {
  if (lesson.folder_id) return lesson.folder_id;
  if (!cfg.oneToOneFolder) return null;
  const name = "_" + lesson.name;
  const found = await driveList(token, `'${esc(cfg.oneToOneFolder)}' in parents and mimeType = '${FOLDER}' and trashed = false and name = '${esc(name)}'`, "id,name");
  const id = found[0]?.id ?? (await g<{ id: string }>(token, `${DRIVE_URL()}/files?supportsAllDrives=true`, { method: "POST", body: JSON.stringify({ name, mimeType: FOLDER, parents: [cfg.oneToOneFolder] }) })).id;
  await withSchool((q) => q(`update rec_lessons set folder_id = $2 where id = $1`, [lesson.id, id]));
  return id;
}

// ---------- title-card work (applyApprovedTitleCards) ----------
async function cardWork(token: string, cfg: RecCfg, info: RunInfo): Promise<number> {
  if (!cfg.cardUrl || !cfg.cardSecret) return 0;
  const stuckMs = (cfg.cardStuckMinutes ?? 60) * 60e3, max = cfg.cardParallel ?? 4;
  const rows = await withSchool((q) => q<CardRow & { card_status: string; card_key: string | null; card_started_at: string | null; card_redo: boolean; recorded_at: string; has_preview: boolean }>(`
    select id, file_id, card_title, card_teacher, card_logo, card_label, card_term_lesson, card_date, card_status, card_key, card_started_at::text, card_redo, recorded_at::text, card_preview is not null as has_preview
    from recordings where status = 'filed' and card_status is not null and card_status <> 'done' order by recorded_at desc limit 200`));
  // previews for rows that don't have an up-to-date one yet (a few per run)
  let previews = 0;
  for (const r of rows) { if (previews >= 6) break; if (r.card_status === "processing") continue; if (r.has_preview && r.card_key === cardKey(r)) continue;
    if (r.card_status === "queued" && r.has_preview) continue;   // approved rows keep the preview they were approved on
    try { await renderPreview(r.id); previews++; } catch (e) { info.problems!.push(`Preview: ${e instanceof Error ? e.message : e}`); break; } }
  // 1) statuses of jobs in progress, from the video's Drive appProperties
  let processing = 0;
  for (const r of rows.filter((x) => x.card_status === "processing")) {
    const p = await g<{ appProperties?: Record<string, string> }>(token, `${DRIVE_URL()}/files/${encodeURIComponent(r.file_id)}?fields=appProperties&supportsAllDrives=true`).catch(() => ({ appProperties: {} as Record<string, string> }));
    const st = p.appProperties?.titleCard;
    if (st === "done") await withSchool((q) => q(`update recordings set card_status = 'done', card_redo = false, card_note = null where id = $1`, [r.id]));
    else if (st === "error") await withSchool((q) => q(`update recordings set card_status = 'error', card_note = $2 where id = $1`, [r.id, `Error: ${p.appProperties?.titleCardError || "unknown"} (approve again to retry)`]));
    else if (r.card_started_at && Date.now() - Date.parse(r.card_started_at) > stuckMs) await withSchool((q) => q(`update recordings set card_status = 'queued', card_started_at = null where id = $1`, [r.id]));
    else processing++;
  }
  // 2) send queued cards while there's capacity: the last 2 days first, then redos, then newest first
  const recent = Date.now() - 2 * 864e5;
  const rank = (r: (typeof rows)[number]) => (Date.parse(r.recorded_at) >= recent ? 0 : r.card_redo ? 1 : 2);
  const queue = rows.filter((r) => r.card_status === "queued").sort((a, b) => rank(a) - rank(b) || b.recorded_at.localeCompare(a.recorded_at));
  let sent = 0, busy = 0;
  for (const r of queue) {
    if (processing >= max || busy >= 3) break;
    const fresh = (await withSchool((q) => q<{ card_key: string | null } & CardRow>(`select id, file_id, card_title, card_teacher, card_logo, card_label, card_term_lesson, card_date, card_key from recordings where id = $1`, [r.id])))[0];
    if (!fresh || !fresh.card_key) continue;   // no preview yet: made on a later run
    if (fresh.card_key !== cardKey(fresh)) { await withSchool((q) => q(`update recordings set card_status = 'edited', card_note = 'Edited since the preview: check the new preview, then approve' where id = $1`, [r.id])); continue; }
    const res = await cardCall(cfg, "/apply", { ...job(fresh), fileId: fresh.file_id, seconds: cfg.cardSeconds ?? 4, redo: r.card_redo }, token);
    if (res.status === 202) { await withSchool((q) => q(`update recordings set card_status = 'processing', card_started_at = now(), card_note = null where id = $1`, [r.id])); processing++; sent++; }
    else if (res.status === 200 && r.card_redo) await withSchool((q) => q(`update recordings set card_status = 'error', card_note = 'Not redone: the title-card service needs redeploying (see its README)' where id = $1`, [r.id]));
    else if (res.status === 200) await withSchool((q) => q(`update recordings set card_status = 'done', card_redo = false where id = $1`, [r.id]));
    else if (res.status === 429) busy++;
    else await withSchool(async (q) => q(`update recordings set card_status = 'error', card_note = $2 where id = $1`, [r.id, `Error ${res.status}: ${(await res.text().catch(() => "")).slice(0, 80)}`]));
  }
  return sent;
}

// ---------- the office's actions ----------
export async function editCard(id: string, title: string, teacher: string): Promise<void> {
  await withSchool(async (q) => {
    const [r] = await q<{ card_status: string }>(`select card_status from recordings where id = $1`, [id]); if (!r) return;
    // a finished card whose words change is redone from the original recording; anything else gets a fresh preview first
    const status = r.card_status === "done" ? "queued" : r.card_status === "processing" ? "processing" : r.card_status === "queued" ? "queued" : "awaiting";
    await q(`update recordings set card_title = $2, card_teacher = $3, card_status = $4, card_redo = card_redo or $5 where id = $1`, [id, cleanTitle(title) || title.trim().slice(0, 140), teacher.trim().slice(0, 80), status, r.card_status === "done"]);
  });
  await renderPreview(id).catch(() => {});
}
export async function approveCards(ids: string[]) {
  await withSchool((q) => q(`update recordings set card_status = 'queued', card_note = null where id = any($1::uuid[]) and card_status in ('awaiting', 'edited', 'error') and card_key is not null`, [ids]));
}
export async function postAnyway(id: string) { await withSchool((q) => q(`update recordings set force_post = true, classroom = 'waiting' where id = $1 and status = 'filed'`, [id])); }
/** "Post now": puts this one recording in Classroom straight away, in either mode. Uses the teacher's topic when there is a
 *  "Lesson n" post, and never posts twice (it checks for an existing "🎥 T<n> Lesson <n>" first, whoever posted it). */
export async function postNow(id: string): Promise<{ ok: boolean; note: string }> {
  if (await isTestMode()) return { ok: false, note: "Test mode is on, so nothing is posted to Classroom. Switch it off in Settings → Test mode." };
  const [r] = await withSchool((q) => q<{ file_id: string; lesson_number: number | null; term_number: number | null; recorded_at: string; course_id: string | null; status: string }>(
    `select r.file_id, r.lesson_number, r.term_number, r.recorded_at::text, l.course_id, r.status from recordings r join rec_lessons l on l.id = r.lesson_id where r.id = $1`, [id]));
  if (!r || r.status !== "filed" || !r.lesson_number) return { ok: false, note: "That recording isn’t a filed lesson." };
  let token: string;
  try { token = await googleAccess("rec"); } catch (e) { return { ok: false, note: e instanceof MeetError ? e.message : "Couldn’t reach Google." }; }
  const terms = await withSchool((q) => q<Term>(`select t.number, t.starts_on::text as starts, t.ends_on::text as ends, extract(year from y.starts_on)::text as year from terms t join academic_years y on y.id = t.academic_year_id where y.ends_on >= current_date - 400 order by t.starts_on`));
  const term = termFor(terms, londonDay(r.recorded_at));
  if (!term) return { ok: false, note: "Couldn’t work out which term this recording is in." };
  const res = await postToClassroom(token, r.course_id, r.lesson_number, term, r.file_id, true);
  await withSchool((q) => q(`update recordings set classroom = $2, classroom_note = $3, force_post = false where id = $1`, [id, res.state, res.note ?? null]));
  if (res.state === "posted") return { ok: true, note: `Posted “${res.note}” in Classroom.` };
  if (res.state === "already") return { ok: true, note: res.note ?? "It was already in Classroom." };
  return { ok: false, note: res.note ?? "Classroom didn’t accept it." };
}
export async function getPreview(id: string): Promise<Buffer | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  return (await withSchool((q) => q<{ p: Buffer | null }>(`select card_preview as p from recordings where id = $1`, [id])))[0]?.p ?? null;
}

// ---------- what the page shows ----------
export type RecRow = { id: string; lesson_id: string | null; lesson: string | null; kind: string | null; file_id: string; name: string | null; recorded_at: string; day: string; size_bytes: number;
  term_number: number | null; lesson_number: number | null; status: string; over_expected: boolean; transcripts: number; classroom: string; classroom_note: string | null;
  card_title: string | null; card_teacher: string | null; card_label: string | null; card_term_lesson: string | null; card_date: string | null; card_status: string | null; card_note: string | null; has_preview: boolean; fresh: boolean };
export async function recordingsView(from: string, to: string) {
  return withSchool(async (q) => {
    const rows = await q<RecRow>(`select r.id, r.lesson_id, l.name as lesson, l.kind, r.file_id, r.name, r.recorded_at::text, (r.recorded_at at time zone 'Europe/London')::date::text as day, r.size_bytes::float as size_bytes,
        r.term_number, r.lesson_number, r.status, r.over_expected, r.transcripts, r.classroom, r.classroom_note, r.card_title, r.card_teacher, r.card_label, r.card_term_lesson, r.card_date,
        r.card_status, r.card_note, r.card_preview is not null as has_preview,
        r.card_key is not distinct from ('v2|' || coalesce(r.card_title,'') || '|' || coalesce(r.card_teacher,'') || '|' || coalesce(r.card_logo,'') || '|' || coalesce(r.card_label,'') || '|' || coalesce(r.card_term_lesson,'') || '|' || coalesce(r.card_date,'')) as fresh
      from recordings r left join rec_lessons l on l.id = r.lesson_id
      where (r.recorded_at at time zone 'Europe/London')::date between $1::date and $2::date
         or r.status in ('short', 'duplicate', 'outside_term', 'unfiled') and r.recorded_at > now() - interval '30 days'
         or r.classroom in ('waiting', 'error') or r.card_status in ('awaiting', 'edited', 'error', 'queued', 'processing') or r.over_expected and r.recorded_at > now() - interval '30 days'
      order by r.recorded_at desc limit 600`, [from, to]);
    const lessons = await q<Lesson>(`select id, kind, meet_code, name, course_id, folder_id, per_week, year_suffix, group_id, active from rec_lessons where active order by kind, name`);
    return { rows, lessons };
  });
}
export async function recStatus() {
  const [acct, run, cfg] = await Promise.all([googleKv<Mailbox>("rec_google"), googleKv<RunInfo>("rec_run"), recCfg()]);
  return { connected: !!acct?.refreshToken, canInvite: (acct?.scopes ?? "").split(/\s+/).includes("https://www.googleapis.com/auth/classroom.rosters"), account: acct?.mailbox ?? "", by: acct?.by ?? "", run: run ?? {}, cfg: { ...cfg, cardSecret: cfg.cardSecret ? "saved" : "" } };
}
export async function disconnectRec() { await googleKvSet("rec_google", null); }
/** The Settings button: read the subject folders again (adds anything not already listed). */
export async function importNow(): Promise<{ added?: number; error?: string }> {
  try {
    const token = await googleAccess("rec"); const cfg = await recCfg();
    const [lessons, terms] = await withSchool(async (q) => [
      await q<Lesson>(`select id, kind, meet_code, name, course_id, folder_id, per_week, year_suffix, group_id, active from rec_lessons where active`),
      await q<Term>(`select t.number, t.starts_on::text as starts, t.ends_on::text as ends, extract(year from y.starts_on)::text as year from terms t join academic_years y on y.id = t.academic_year_id where y.ends_on >= current_date - 400 order by t.starts_on`),
    ] as const);
    return { added: await importFiled(token, cfg, lessons, terms) };
  } catch (e) { return { error: e instanceof Error ? e.message : "Couldn’t read the folders." }; }
}

/** With the other background jobs: every 15 minutes while the admin is open, and from the daily cron. */
export async function recordingsBackground() {
  try {
    const s = await recStatus(); if (!s.connected) return;
    const last = s.run.at ? Date.parse(s.run.at) : 0; if (Date.now() - last < 15 * 60e3) return;
    await googleKvSet("rec_run", { ...s.run, at: new Date().toISOString() });
    await runRecordings("auto");
  } catch (e) { console.error("recordings background", e); }
}

/** A recording's thumbnail from Drive (it shows the title card once that's been added), for the hover preview. Only for recordings listed here. */
const thumbCache = new Map<string, { at: number; mime: string; data: Buffer }>();
export async function getThumb(fileId: string): Promise<{ mime: string; data: Buffer } | null> {
  if (!/^[\w-]{10,80}$/.test(fileId)) return null;
  const hit = thumbCache.get(fileId); if (hit && Date.now() - hit.at < 6 * 3600e3) return hit;
  const [known] = await withSchool((q) => q<{ id: string }>(`select id from recordings where file_id = $1`, [fileId]));
  if (!known) return null;
  const token = await googleAccess("rec");
  const meta = await g<{ thumbnailLink?: string }>(token, `${DRIVE_URL()}/files/${encodeURIComponent(fileId)}?fields=thumbnailLink&supportsAllDrives=true`).catch(() => ({} as { thumbnailLink?: string }));
  if (!meta.thumbnailLink) return null;
  const r = await fetch(meta.thumbnailLink.replace(/=s\d+$/, "=s480"), { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) }).catch(() => null);
  if (!r?.ok) return null;
  const out = { at: Date.now(), mime: r.headers.get("content-type") || "image/jpeg", data: Buffer.from(await r.arrayBuffer()) };
  if (thumbCache.size > 300) thumbCache.clear();
  thumbCache.set(fileId, out); return out;
}

/** What one student wrote in the Meet chat of a class's recent lessons (31 Oct, for drafting report comments): the archived
 *  "Chat transcript" files in the transcripts folder, newest first, the lines whose speaker is this student. Best effort:
 *  returns [] when Google, the folder or the class's recording settings aren't there. */
export async function studentChatLines(groupId: string, names: string[], since: string, max = 30): Promise<{ day: string; text: string }[]> {
  try {
    const cfg = await recCfg();
    if (!cfg.transcriptsFolder) return [];
    const lessons = (await withSchool((q) => q<{ name: string }>(`select name from rec_lessons where group_id = $1 and kind = 'class'`, [groupId]))).map((l) => l.name);
    if (!lessons.length) return [];
    const token = await googleAccess("rec");
    const files = (await driveList(token, `'${esc(cfg.transcriptsFolder)}' in parents and mimeType = 'text/plain' and trashed = false and createdTime > '${since}T00:00:00Z' and (${lessons.map((n) => `name contains '${esc(n)}'`).join(" or ")})`, "id,name,createdTime"))
      .sort((a, b) => (a.createdTime! < b.createdTime! ? 1 : -1)).slice(0, 10);
    const who = names.map((n) => n.trim().toLowerCase()).filter(Boolean);
    const out: { day: string; text: string }[] = [];
    for (const f of files) {
      const r = await fetch(`${DRIVE_URL()}/files/${encodeURIComponent(f.id)}?alt=media&supportsAllDrives=true`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) }).catch(() => null);
      if (!r?.ok) continue;
      const text = (await r.text()).slice(0, 200_000);
      for (const line of text.split(/\r?\n/)) {
        const m = /^(.{2,80}?)\s:\s(.+)$/.exec(line.trim());           // "Ada Ashdown : I think it's osmosis"
        if (!m || !who.includes(m[1].trim().toLowerCase())) continue;
        out.push({ day: londonDay(f.createdTime!), text: m[2].slice(0, 240) });
        if (out.length >= max) return out;
      }
    }
    return out;
  } catch { return []; }
}
