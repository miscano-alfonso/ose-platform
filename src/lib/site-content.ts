import "server-only";
import { withSchool } from "./db";
import { FAQS } from "@/content/faq";
import { cleanStyles, isEmptyStyles, type SiteStyles, type StyleKind } from "./styles";

// Text the office can change in Admin → Website. Anything not set uses these defaults.
export const DEFAULTS: Record<string, string> = {
  home_eyebrow: "Online school for home-educated students",
  home_title: "Outstanding\nTeaching Inspiring\nFuture Generations",
  home_lead: "OH-SO ED provides outstanding online education for home-educated students. We offer KS3, pre-GCSE and GCSE courses taught by experienced secondary subject specialists, supported by our 98% GCSE pass rate!",
  ticker: "Join us for taster lessons\nNew courses will start in September",
  teachers_intro: "Experienced secondary subject specialists, all with up-to-date DBS certificates.",
  head_title: "Meet the Headteacher",
  head_text: "I’m Leanne, Principal and English Teacher. OH-SO ED was born from the success of OH-SO ENGLISH, which I started in 2021 after leaving the mainstream classroom for good. We are now a fast-growing team, offering a number of secondary subjects to the home-educating community.\nOur OH-SO ED team are all outstanding ex-secondary practitioners who have worked for many years in secondary education within their specialisms. We’re all committed to delivering a curriculum that is more diverse, more inspirational and ultimately more fulfilling than the one delivered in the mainstream secondary classroom.",
  about_title: "About Us",
  about_text: "Hi everyone and welcome to OH-SO ED!\nI’m Leanne, Principal and English Teacher.\nOH-SO ED was born from the success of OH-SO ENGLISH, which I started in 2021 after leaving the mainstream classroom for good. We are now a fast-growing team, offering a number of secondary subjects to the home-educating community.\nOur OH-SO ED team are all outstanding ex-secondary practitioners who have worked for many years in secondary education within their specialisms. We’re all committed to delivering a curriculum that is more diverse, more inspirational and ultimately more fulfilling than the one delivered in the mainstream secondary classroom.\nWe offer Key Stage 3, pre-GCSE and GCSE courses in a range of secondary subjects, including the core subjects English, Science and Maths, and wider choices like History, Geography, Business, Media and more. Students who study with us all the way to GCSE are ready to progress to further education in line with college or workplace expectations.\nWe’d love you to join us for a free taster lesson. It’s a great way to sample our teaching, learn more about what we do and see if we’re the right fit for your child. Use the contact page to ask for a taster and we’ll get back to you with days and times. If you have any questions in the meantime, feel free to contact us.\nWe hope to meet you soon!",
  reviews_rating: "4.8",
  reviews_count: "17",
  reviews_url: "https://www.facebook.com/ohsoedonline/reviews",
  reviews_widget: "05669bd0-25f2-40a8-a78f-2dedcfc3dd82",
};

export async function siteText(): Promise<Record<string, string>> {
  try {
    const rows = await withSchool((q) => q<{ key: string; value: string }>(`select key, value from site_content`));
    return { ...DEFAULTS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) };
  } catch { return DEFAULTS; }
}

export type Faq = { id: string; question: string; answer: string; sort_order: number; published: boolean };
export async function getFaqs(all = false): Promise<Faq[]> {
  try {
    const rows = await withSchool((q) => q<Faq>(`select id, question, answer, sort_order, published from faqs where $1 or published order by sort_order, question`, [all]));
    return rows.length || all ? rows : FAQS.map((f, i) => ({ id: String(i), question: f.q, answer: f.a, sort_order: i, published: true }));
  } catch { return FAQS.map((f, i) => ({ id: String(i), question: f.q, answer: f.a, sort_order: i, published: true })); }
}

export async function saveSiteText(actorId: string, values: Record<string, string>) {
  await withSchool(async (q) => {
    for (const [k, v] of Object.entries(values)) {
      if (!(k in DEFAULTS)) continue;
      if (!v.trim() || v.trim() === DEFAULTS[k]) await q(`delete from site_content where key = $1`, [k]);
      else await q(`insert into site_content (school_id, key, value, updated_by) values (current_school(), $1, $2, $3) on conflict (school_id, key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`, [k, v.trim(), actorId]);
    }
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, detail) values (current_school(), $1, 'update', 'site_content', $2)`, [actorId, JSON.stringify(Object.keys(values))]);
  });
}

export async function saveFaq(actorId: string, id: string | null, d: { question: string; answer: string; sort: number; published: boolean }) {
  await withSchool(async (q) => {
    if (id) await q(`update faqs set question = $2, answer = $3, sort_order = $4::int, published = $5::boolean where id = $1`, [id, d.question, d.answer, d.sort, d.published]);
    else await q(`insert into faqs (school_id, question, answer, sort_order, published) values (current_school(), $1, $2, $3::int, $4::boolean)`, [d.question, d.answer, d.sort, d.published]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id) values (current_school(), $1, 'save', 'faq', $2)`, [actorId, id]);
  });
}
export async function deleteFaq(actorId: string, id: string) {
  await withSchool(async (q) => { await q(`delete from faqs where id = $1`, [id]); await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id) values (current_school(), $1, 'delete', 'faq', $2)`, [actorId, id]); });
}

// ---------- course detail pages ----------
export type CoursePageAdmin = { id: string; slug: string; level: string; subject: string; exam_board: string | null; intro: string | null; topics: { title: string; text: string }[]; published: boolean; video: string | null; video_title: string | null };
export async function listCoursePages() {
  return withSchool((q) => q<CoursePageAdmin>(`select cp.id, cp.slug, l.name as level, sj.name as subject, cp.exam_board, cp.intro, cp.topics, cp.published, cp.sample_video_url as video, cp.sample_title as video_title
    from course_pages cp join levels l on l.id = cp.level_id join subjects sj on sj.id = cp.subject_id order by l.sort_order, sj.name`));
}
export async function getCoursePageAdmin(id: string) {
  return withSchool(async (q) => (await q<CoursePageAdmin>(`select cp.id, cp.slug, l.name as level, sj.name as subject, cp.exam_board, cp.intro, cp.topics, cp.published, cp.sample_video_url as video, cp.sample_title as video_title
    from course_pages cp join levels l on l.id = cp.level_id join subjects sj on sj.id = cp.subject_id where cp.id = $1`, [id]))[0] ?? null);
}
export async function saveCoursePage(actorId: string, id: string, d: { board: string | null; intro: string | null; topics: { title: string; text: string }[]; published: boolean; video: string | null; videoTitle: string | null }) {
  await withSchool(async (q) => {
    await q(`update course_pages set exam_board = $2, intro = $3, topics = $4::jsonb, published = $5::boolean, sample_video_url = $6, sample_title = $7 where id = $1`, [id, d.board, d.intro, JSON.stringify(d.topics), d.published, d.video, d.videoTitle]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id) values (current_school(), $1, 'update', 'course_page', $2)`, [actorId, id]);
  });
}

// Page styles (Admin → Page styles), stored as JSON under the "styles" key.
const STYLE_KEY: Record<StyleKind, string> = { site: "styles", dash: "dash_styles" };
export async function getStyles(kind: StyleKind = "site"): Promise<SiteStyles> {
  try {
    const rows = await withSchool((q) => q<{ value: string }>(`select value from site_content where key = $1`, [STYLE_KEY[kind]]));
    return cleanStyles(rows[0] ? JSON.parse(rows[0].value) : null, kind);
  } catch { return { desktop: {}, phone: {} }; }
}
export async function saveStyles(actorId: string, s: SiteStyles, kind: StyleKind = "site") {
  await withSchool(async (q) => {
    if (isEmptyStyles(s)) await q(`delete from site_content where key = $1`, [STYLE_KEY[kind]]);
    else await q(`insert into site_content (school_id, key, value, updated_by) values (current_school(), $3, $1, $2) on conflict (school_id, key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`, [JSON.stringify(s), actorId, STYLE_KEY[kind]]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, detail) values (current_school(), $1, 'update', $3, $2)`, [actorId, JSON.stringify(s), kind === "site" ? "site_styles" : "dashboard_styles"]);
  });
}
