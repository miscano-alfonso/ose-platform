import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { withSchool } from "./db";
import { emailReady, sendHtml } from "./email";
import { getCourses, type Course } from "./data";

// Admin → Social: drafts for every platform, pictures, the content calendar, posting to the Facebook Page and Instagram,
// and "Upcoming moments" found on the web by Claude. A port of the Giles CMS social section to this site:
// Giles "books" are our courses and workshops; the cover is the teacher's photo (or the workshop picture);
// the museum partner is the teacher.

type Q = <R = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<R[]>;
export class SocialError extends Error { constructor(msg: string, public status = 400) { super(msg); } }
const fail = (msg: string, status = 400): never => { throw new SocialError(msg, status); };

// ---------- the items to post about ----------
export type SocialItem = {
  id: string; kind: "course" | "workshop"; title: string; subtitle: string; summary: string; partner: string; cover: string; tileColor: string;
  status: "space" | "next" | "full" | "workshop"; pubDate: string; category: string; subject: string; specs: string; topics: string[]; link: string; places: number | null;
};
const plain = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/[*_#>`]/g, "").replace(/\s+/g, " ").trim();
const list = (a: string[]) => a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1];

export async function socialItems(): Promise<SocialItem[]> {
  const [courses, pages, workshops] = await Promise.all([
    getCourses().catch((): Course[] => []),
    withSchool((q) => q<{ slug: string; intro: string | null; topics: { title: string; text: string }[]; exam_board: string | null }>(`select slug, intro, topics, exam_board from course_pages where published`)).catch(() => []),
    withSchool((q) => q<{ slug: string; title: string; summary: string | null; starts_at: string; minutes: number; price_pence: number; level: string | null; subject: string | null; colour: string | null;
      teacher: string | null; photo: string | null; image_url: string | null; places_left: number | null }>(`
      select w.slug, w.title, w.summary, to_char(w.starts_at at time zone 'Europe/London', 'YYYY-MM-DD"T"HH24:MI') as starts_at, w.minutes, w.price_pence,
             l.name as level, sj.name as subject, sj.colour, u.name as teacher,
             case when t.photo is not null then '/teacher-photo/' || t.slug else t.photo_asset end as photo, w.image_url,
             case when w.capacity is null then null else greatest(w.capacity - (select count(*) from workshop_bookings b where b.workshop_id = w.id and b.status <> 'cancelled'), 0)::int end as places_left
      from workshops w left join levels l on l.id = w.level_id left join subjects sj on sj.id = w.subject_id
      left join teachers t on t.id = w.teacher_id left join users u on u.id = t.user_id
      where w.status = 'published' and w.starts_at > now() order by w.starts_at`)).catch(() => []),
  ]);
  const page = new Map(pages.map((p) => [p.slug, p]));
  const bySlug = new Map<string, Course[]>();
  for (const c of courses) { if (!bySlug.has(c.page_slug)) bySlug.set(c.page_slug, []); bySlug.get(c.page_slug)!.push(c); }
  const out: SocialItem[] = [];
  for (const [slug, gs] of bySlug) {
    const now = gs.filter((g) => !g.is_next), next = gs.filter((g) => g.is_next);
    const space = now.filter((g) => g.bookable && !g.is_full);
    const status: SocialItem["status"] = space.length ? "space" : next.length ? "next" : "full";
    const lead = (status === "space" ? space : status === "next" ? next : gs).find((g) => g.teacher) ?? gs[0];
    const p = page.get(slug);
    const topics = (p?.topics ?? []).map((t) => plain(t.title)).filter(Boolean).slice(0, 4);
    const intro = plain(p?.intro ?? "");
    const summary = (intro ? intro.split(/(?<=[.!?])\s+/).slice(0, 3).join(" ") : `Live online ${lead.level} ${lead.subject} lessons for home-educated students, in small classes with a qualified subject specialist.`)
      + (topics.length ? ` Topics include ${list(topics)}.` : "");
    const lessons = lead.lessons_per_week === 1 ? "1 lesson a week" : `${lead.lessons_per_week} lessons a week`;
    const places = space.length ? Math.min(...space.map((g) => g.places_left ?? 99)) : null;
    out.push({
      id: slug.replace("/", "."), kind: "course", title: `${lead.level} ${lead.subject}`, subtitle: p?.exam_board ? `${p.exam_board}` : "", summary: summary.slice(0, 700),
      partner: lead.teacher ?? "", cover: lead.teacher_photo ?? "", tileColor: lead.colour || "#8494c2", status,
      pubDate: status === "next" ? next[0].year_start : "", category: lead.level, subject: lead.subject,
      specs: [lessons, `${lead.course_years}-year course`, p?.exam_board ?? ""].filter(Boolean).join(" · "), topics, link: `/courses/${slug}`, places: places === 99 ? null : places,
    });
  }
  for (const w of workshops) {
    out.push({
      id: "w." + w.slug, kind: "workshop", title: w.title, subtitle: [w.level, w.subject].filter(Boolean).join(" "), summary: plain(w.summary ?? "").slice(0, 700),
      partner: w.teacher ?? "", cover: w.image_url || w.photo || "", tileColor: w.colour || "#0f1747", status: "workshop", pubDate: w.starts_at.slice(0, 10),
      category: "Workshop", subject: w.subject ?? "", specs: [`${w.minutes} minutes`, w.price_pence ? `£${(w.price_pence / 100).toFixed(2).replace(/\.00$/, "")}` : "Free"].join(" · "),
      topics: [], link: "/other-services#workshops", places: w.places_left,
    });
  }
  return out;
}
export const validItemId = (s: unknown): s is string => typeof s === "string" && /^[a-z0-9][a-z0-9._-]{0,118}$/.test(s);

// ---------- small settings (social_kv) ----------
async function kvGet<T>(key: string, q?: Q): Promise<T | null> {
  const run = async (qq: Q) => (await qq<{ value: T }>(`select value from social_kv where key = $1`, [key]))[0]?.value ?? null;
  return q ? run(q) : withSchool(run);
}
async function kvSet(key: string, value: unknown, q?: Q) {
  const run = (qq: Q) => value === null ? qq(`delete from social_kv where key = $1`, [key])
    : qq(`insert into social_kv (school_id, key, value) values (current_school(), $1, $2::jsonb) on conflict (school_id, key) do update set value = excluded.value, updated_at = now()`, [key, JSON.stringify(value)]);
  if (q) await run(q); else await withSchool(run);
}

/** The site's own address, for links in posts and emails (remembered from the last admin visit, for the weekly job). */
export async function siteBase(origin?: string): Promise<string> {
  const env = (process.env.SITE_URL || "").replace(/\/$/, "");
  if (env) return env;
  if (origin) { const prev = await kvGet<string>("base").catch(() => null); if (prev !== origin) await kvSet("base", origin).catch(() => {}); return origin; }
  return (await kvGet<string>("base").catch(() => null)) || "";
}
export const siteGated = () => !!process.env.SITE_PASSWORD;

// ---------- Meta (Facebook Page and Instagram) ----------
const GRAPH_VER = "v25.0";
const GRAPH = () => (process.env.SOCIAL_GRAPH_URL || `https://graph.facebook.com/${GRAPH_VER}/`).replace(/\/?$/, "/");
const META_SCOPES = "pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish,business_management";
type MetaPage = { id: string; name: string; token: string; picture: string; ig: { id: string; username: string; picture: string } | null };
type MetaCfg = { appId?: string; appSecret?: string; configId?: string; pages?: MetaPage[]; pageId?: string; userToken?: string; by?: string; at?: string; pending?: { state: string; email: string; exp: number } };
export const metaCfg = async () => (await kvGet<MetaCfg>("meta")) ?? {};
const saveMeta = (c: MetaCfg) => kvSet("meta", c);
const metaPage = (c: MetaCfg) => (c.pages ?? []).find((p) => p.id === c.pageId && p.token) ?? null;
export const metaRedirect = (base: string) => `${base}/admin/social-api?action=metacallback`;

type GraphRes = Record<string, unknown> & { __error?: string; __code?: number };
async function graph(method: string, path: string, params: Record<string, unknown> = {}, token?: string, secret?: string): Promise<GraphRes> {
  const p: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) p[k] = Array.isArray(v) ? JSON.stringify(v) : String(v);
  if (token) { p.access_token = token; if (secret) p.appsecret_proof = createHmac("sha256", secret).update(token).digest("hex"); }
  let url = GRAPH() + path.replace(/^\//, "");
  const body = new URLSearchParams();
  if (method === "GET" || method === "DELETE") url += (url.includes("?") ? "&" : "?") + new URLSearchParams(p).toString();
  else for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach((x, i) => body.append(`${k}[${i}]`, String(x))); else if (v !== undefined && v !== null) body.append(k, String(v));
  }
  if (method !== "GET" && method !== "DELETE") { if (p.access_token) body.set("access_token", p.access_token); if (p.appsecret_proof) body.set("appsecret_proof", p.appsecret_proof); }
  let res: Response;
  try { res = await fetch(url, { method, body: method === "GET" || method === "DELETE" ? undefined : body, signal: AbortSignal.timeout(60000) }); }
  catch (e) { return { __error: "Couldn’t reach Facebook: " + String((e as Error).message || e) }; }
  const j = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (res.status >= 400 || j.error) {
    const e = (j.error ?? {}) as { error_user_msg?: string; message?: string; code?: number };
    let msg = e.error_user_msg || e.message || `unexpected reply (${res.status})`;
    if (e.code === 190) msg = "The Facebook connection has expired or was removed. Reconnect under Connect to Social. (" + msg + ")";
    return { __error: msg, __code: e.code ?? res.status };
  }
  return j;
}

export async function metaStatus(base: string) {
  const c = await metaCfg(); const pg = metaPage(c);
  return {
    hasApp: !!(c.appId && c.appSecret), appId: c.appId ?? "", configId: c.configId ?? "", connected: !!pg,
    page: pg ? { id: pg.id, name: pg.name, picture: pg.picture } : null,
    ig: pg?.ig ? { username: pg.ig.username, picture: pg.ig.picture } : null,
    pages: (c.pages ?? []).map((p) => ({ id: p.id, name: p.name, ig: p.ig?.username ?? "" })),
    by: c.by ?? "", at: c.at ?? "", redirectUri: metaRedirect(base), canEdit: true, gated: siteGated(),
  };
}
export async function metaConfigSave(b: Record<string, unknown>) {
  const c = await metaCfg();
  if (b.forget) { await kvSet("meta", null); return; }
  if (b.disconnect) { delete c.pages; delete c.pageId; delete c.userToken; delete c.by; delete c.at; await saveMeta(c); return; }
  if (b.pageId !== undefined) {
    if (!(c.pages ?? []).some((p) => p.id === String(b.pageId))) fail("Choose one of your Pages.");
    c.pageId = String(b.pageId); await saveMeta(c); return;
  }
  const id = String(b.appId ?? "").replace(/\D/g, ""), sec = String(b.appSecret ?? "").trim();
  if (id.length < 8) fail("Paste the App ID from your Meta app (numbers only).");
  if (!sec && (c.appId !== id || !c.appSecret)) fail("Paste the App Secret too.");
  if (sec && !/^[a-f0-9]{32}$/i.test(sec)) fail("That doesn’t look like an App Secret. It’s 32 letters and numbers, under App settings › Basic.");
  if (sec) {
    const t = await graph("GET", "oauth/access_token", { client_id: id, client_secret: sec, grant_type: "client_credentials" });
    if (t.__error) fail("Meta didn’t accept that App ID and Secret: " + t.__error);
  }
  const n: MetaCfg = c.appId === id ? c : {};
  n.appId = id; if (sec) n.appSecret = sec;
  n.configId = String(b.configId ?? "").replace(/\D/g, "");
  await saveMeta(n);
}
export async function metaLoginUrl(base: string, email: string): Promise<string> {
  const c = await metaCfg();
  if (!c.appId || !c.appSecret) fail("Add the App ID and App Secret under Connect to Social first.");
  const state = randomBytes(16).toString("hex");
  c.pending = { state, email, exp: Date.now() + 15 * 60000 }; await saveMeta(c);
  const q = new URLSearchParams({ client_id: c.appId!, redirect_uri: metaRedirect(base), state, response_type: "code" });
  if (c.configId) q.set("config_id", c.configId); else q.set("scope", META_SCOPES);
  return `${process.env.SOCIAL_DIALOG_URL || `https://www.facebook.com/${GRAPH_VER}/dialog/oauth`}?${q}`;
}
/** Facebook sends the browser back here: swap the code for a long-lived token and keep the Page tokens. Returns an error message or null. */
export async function metaCallback(base: string, sp: URLSearchParams): Promise<string | null> {
  const c = await metaCfg(); const pend = c.pending; delete c.pending;
  const given = sp.get("state") || "";
  if (!pend || given.length !== pend.state.length || !timingSafeEqual(Buffer.from(given), Buffer.from(pend.state)) || Date.now() > pend.exp) { await saveMeta(c); return "That link has expired. Go back to Social and press Connect again."; }
  if (sp.get("error")) { await saveMeta(c); return "Facebook said: " + (sp.get("error_description") || sp.get("error") || "").slice(0, 200) + ". Nothing was changed."; }
  const t = await graph("GET", "oauth/access_token", { client_id: c.appId, client_secret: c.appSecret, redirect_uri: metaRedirect(base), code: sp.get("code") || "" });
  if (!t.access_token) { await saveMeta(c); return "Facebook didn’t complete the sign-in: " + (t.__error ?? "no token") + "."; }
  const l = await graph("GET", "oauth/access_token", { grant_type: "fb_exchange_token", client_id: c.appId, client_secret: c.appSecret, fb_exchange_token: String(t.access_token) });
  const ut = String(l.access_token ?? t.access_token);
  const acc = await graph("GET", "me/accounts", { fields: "id,name,access_token,tasks,picture{url},instagram_business_account{id,username,profile_picture_url}", limit: 100 }, ut, c.appSecret);
  if (acc.__error) { await saveMeta(c); return "Couldn’t list your Facebook Pages: " + acc.__error; }
  const pages: MetaPage[] = [];
  for (const p of (acc.data as Record<string, any>[] | undefined) ?? []) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!p.access_token) continue;
    const ig = p.instagram_business_account;
    pages.push({ id: String(p.id), name: String(p.name ?? ""), token: String(p.access_token), picture: String(p.picture?.data?.url ?? ""),
      ig: ig ? { id: String(ig.id), username: String(ig.username ?? ""), picture: String(ig.profile_picture_url ?? "") } : null });
  }
  if (!pages.length) { await saveMeta(c); return "Facebook didn’t share any Pages. Press Connect again and, when Facebook asks, tick the OH-SO ED Page (and its Instagram account)."; }
  c.pages = pages; c.userToken = ut; c.by = pend.email; c.at = new Date().toISOString();
  if (!pages.some((p) => p.id === c.pageId)) c.pageId = (pages.find((p) => p.ig) ?? pages[0]).id;
  await saveMeta(c);
  return null;
}

// ---------- pictures for posting ----------
export async function saveImage(buf: Buffer): Promise<string> {
  if (!(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) fail("Pictures for posting must be JPEGs.");
  if (buf.length > 8 * 1024 * 1024) fail("That picture is over 8MB.");
  return (await withSchool((q) => q<{ id: string }>(`insert into social_images (school_id, data) values (current_school(), $1) returning id`, [buf])))[0].id;
}
export async function getImage(id: string): Promise<Buffer | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  return (await withSchool((q) => q<{ data: Buffer }>(`select data from social_images where id = $1`, [id])))[0]?.data ?? null;
}
const imgId = (p: string) => (p.match(/^\/social-img\/([0-9a-f-]{36})\.jpg$/) || [])[1] ?? null;

// ---------- posts made from here ----------
type Channel = { status: "posted" | "scheduled" | "processing" | "failed" | "cancelled"; postId?: string; photoId?: string; container?: string; url?: string; at?: string; error?: string };
export type SocialPost = { id: string; created: string; by: string; text: string; igText: string; link: string; image: string; images: string[]; bookId: string; at: string | null;
  channels: Record<string, Channel>; stats: Record<string, Record<string, number>> | null; statsAt: string | null };
const POST_COLS = `id, created_at::text as created, created_by as by, text, ig_text as "igText", link, image, images, item_id as "bookId", post_at::text as at, channels, stats, stats_at::text as "statsAt"`;
export const listPosts = () => withSchool((q) => q<SocialPost>(`select ${POST_COLS} from social_posts order by created_at desc limit 200`));

async function igFinish(ig: Channel, page: MetaPage, secret: string | undefined, wait = 20) {
  const igid = page.ig?.id ?? "";
  for (let t = 0; t <= wait; t += 3) {
    const s = await graph("GET", ig.container!, { fields: "status_code,status" }, page.token, secret);
    if (s.__error) { ig.status = "failed"; ig.error = s.__error; return; }
    const sc = String(s.status_code ?? "");
    if (sc === "FINISHED") break;
    if (sc === "ERROR" || sc === "EXPIRED") { ig.status = "failed"; ig.error = `Instagram couldn’t use the picture (${s.status ?? sc}).`; return; }
    if (t + 3 > wait) { ig.status = "processing"; return; }
    await new Promise((r) => setTimeout(r, 3000));
  }
  const p = await graph("POST", `${igid}/media_publish`, { creation_id: ig.container }, page.token, secret);
  if (p.__error) { ig.status = "failed"; ig.error = p.__error; return; }
  ig.postId = String(p.id); ig.status = "posted"; ig.at = new Date().toISOString(); delete ig.error;
  const m = await graph("GET", ig.postId, { fields: "permalink" }, page.token, secret);
  if (m.permalink) ig.url = String(m.permalink);
}
async function igStart(ig: Channel, post: { igText: string; image: string; images: string[] }, page: MetaPage, secret: string | undefined, base: string) {
  const igid = page.ig?.id ?? ""; let c: GraphRes;
  if (post.images.length > 1) {
    const kids: string[] = [];
    for (const im of post.images) {
      const k = await graph("POST", `${igid}/media`, { image_url: base + im, is_carousel_item: "true" }, page.token, secret);
      if (k.__error) { ig.status = "failed"; ig.error = k.__error; return; }
      kids.push(String(k.id));
    }
    await new Promise((r) => setTimeout(r, 2000));
    c = await graph("POST", `${igid}/media`, { media_type: "CAROUSEL", children: kids.join(","), caption: post.igText }, page.token, secret);
  } else c = await graph("POST", `${igid}/media`, { image_url: base + post.image, caption: post.igText }, page.token, secret);
  if (c.__error) { ig.status = "failed"; ig.error = c.__error; return; }
  ig.container = String(c.id);
  await igFinish(ig, page, secret);
}

export async function createPost(b: Record<string, unknown>, by: string, base: string) {
  const c = await metaCfg(); const pg = metaPage(c); if (!pg) fail("Connect Facebook first (Connect to Social, top right).");
  const page = pg!;
  const text = String(b.text ?? "").replace(/\r/g, "").trim(), igText = String(b.igText ?? text).replace(/\r/g, "").trim(), link = String(b.link ?? "").trim();
  if (link && !/^https?:\/\/\S+$/i.test(link)) fail("The link should start with https://");
  const toFb = !!b.facebook, toIg = !!b.instagram;
  if (!toFb && !toIg) fail("Choose Facebook, Instagram or both.");
  if (toIg && !page.ig?.id) fail("This Page has no Instagram business account linked to it.");
  const imgs = (Array.isArray(b.images) ? b.images : []).map((x) => String(x).trim()).filter(Boolean);
  if (imgs.length > 10) fail("Up to 10 pictures in a carousel.");
  const img = imgs[0] ?? String(b.image ?? "").trim();
  for (const x of [...imgs, img].filter(Boolean)) if (!imgId(x)) fail("That picture wasn’t prepared for posting. Choose it again.");
  const multi = imgs.length > 1;
  if (toIg && !img) fail("Instagram needs a picture.");
  if (!text && !img && !link) fail("Write something first.");
  if (toIg && [...igText].length > 2200) fail("The Instagram caption is over 2,200 characters.");
  if (toIg && (igText.match(/(^|\s)#\w/gu) ?? []).length > 30) fail("Instagram allows up to 30 hashtags.");
  if (text.length > 20000) fail("That’s too long for a post.");
  let at: string | null = null;
  if (b.when && b.when !== "now") {
    const ts = Date.parse(String(b.when)); if (!ts) fail("Choose the date and time.");
    const now = Date.now();
    if (toFb && (ts < now + 600000 || ts > now + 29 * 86400000)) fail("Facebook schedules posts from 10 minutes to 29 days ahead.");
    if (ts < now + 120000) fail("Choose a time at least a few minutes ahead.");
    if (ts > now + 180 * 86400000) fail("Choose a date in the next six months.");
    at = new Date(ts).toISOString();
  }
  const post = { text, igText, link, image: img, images: multi ? imgs : [], bookId: validItemId(b.bookId) ? b.bookId : "", at, channels: {} as Record<string, Channel> };
  const sec = c.appSecret;
  if (toFb) {
    let fb: Channel = { status: "failed" };
    const sched = at ? { published: "false", scheduled_publish_time: String(Math.floor(Date.parse(at) / 1000)) } : {};
    const cap = text + (link && !text.includes(link) ? "\n\n" + link : "");
    if (multi) {
      const att: string[] = []; let err = "";
      for (const x of imgs) {
        const r = await graph("POST", `${page.id}/photos`, { url: base + x, published: "false", ...(at ? { temporary: "true" } : {}) }, page.token, sec);
        if (r.__error) { err = r.__error; break; } att.push(JSON.stringify({ media_fbid: String(r.id) }));
      }
      if (!err) { const r = await graph("POST", `${page.id}/feed`, { message: cap, attached_media: att, ...sched }, page.token, sec); if (!r.__error) fb = { status: at ? "scheduled" : "posted", postId: String(r.id) }; else fb.error = r.__error; }
      else fb.error = err;
    } else if (img) {
      const r = await graph("POST", `${page.id}/photos`, { url: base + img, caption: cap, ...sched }, page.token, sec);
      if (!r.__error) fb = { status: at ? "scheduled" : "posted", postId: String(r.post_id ?? r.id), photoId: String(r.id) }; else fb.error = r.__error;
    } else {
      const r = await graph("POST", `${page.id}/feed`, { message: text || undefined, link: link || undefined, ...sched }, page.token, sec);
      if (!r.__error) fb = { status: at ? "scheduled" : "posted", postId: String(r.id) }; else fb.error = r.__error;
    }
    if (fb.status === "posted") { fb.at = new Date().toISOString(); const u = await graph("GET", fb.postId!, { fields: "permalink_url" }, page.token, sec); if (u.permalink_url) fb.url = String(u.permalink_url); }
    post.channels.facebook = fb;
  }
  if (toIg) { const ig: Channel = { status: "scheduled" }; if (!at) await igStart(ig, post, page, sec, base); post.channels.instagram = ig; }
  const okAny = Object.values(post.channels).some((x) => x.status !== "failed");
  let saved: SocialPost | null = null;
  if (okAny) saved = (await withSchool((q) => q<SocialPost>(`insert into social_posts (school_id, created_by, text, ig_text, link, image, images, item_id, post_at, channels)
    values (current_school(), $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb) returning ${POST_COLS}`, [by, text, igText, link, img, post.images, post.bookId, at, JSON.stringify(post.channels)])))[0];
  return { post: saved ?? { ...post, id: "", created: new Date().toISOString(), by, stats: null, statsAt: null }, saved: okAny };
}

/** Scheduled Instagram posts (Instagram has no scheduling of its own) and Facebook ones whose time has come. */
export async function runDue(budget = 1): Promise<boolean> {
  const c = await metaCfg(); const page = metaPage(c); if (!page) return false;
  const base = await siteBase(); if (!base) return false;
  const posts = await withSchool((q) => q<SocialPost>(`select ${POST_COLS} from social_posts where channels::text ~ '"(scheduled|processing)"' order by post_at`));
  let done = 0, changed = false;
  for (const p of posts) {
    const ig = p.channels.instagram, fb = p.channels.facebook; let did = false;
    if (ig && done < budget && ((ig.status === "scheduled" && p.at && Date.parse(p.at) <= Date.now()) || ig.status === "processing")) {
      if (ig.status === "processing" && ig.container) await igFinish(ig, page, c.appSecret, 6); else await igStart(ig, p, page, c.appSecret, base);
      done++; did = true;
    }
    if (fb && fb.status === "scheduled" && p.at && Date.parse(p.at) <= Date.now() - 60000) {
      const r = await graph("GET", fb.postId!, { fields: "is_published,permalink_url" }, page.token, c.appSecret);
      if (r.is_published) { fb.status = "posted"; fb.at = p.at; if (r.permalink_url) fb.url = String(r.permalink_url); did = true; }
      else if (r.__error && Date.parse(p.at) < Date.now() - 3600000) { fb.status = "failed"; fb.error = r.__error; did = true; }
    }
    if (did) { changed = true; await withSchool((q) => q(`update social_posts set channels = $2::jsonb where id = $1`, [p.id, JSON.stringify(p.channels)])); }
  }
  return changed;
}
/** Likes, comments and shares, at most every 10 minutes per post. */
export async function refreshStats() {
  const c = await metaCfg(); const page = metaPage(c); if (!page) return;
  const posts = await withSchool((q) => q<SocialPost>(`select ${POST_COLS} from social_posts where stats_at is null or stats_at < now() - interval '10 minutes' order by created_at desc limit 25`));
  for (const p of posts) {
    const fb = p.channels.facebook, ig = p.channels.instagram; const stats = { ...(p.stats ?? {}) }; let did = false;
    if (fb?.status === "posted" && fb.postId) {
      const r = await graph("GET", fb.postId, { fields: "permalink_url,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)" }, page.token, c.appSecret) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (!r.__error) { stats.facebook = { reactions: +(r.reactions?.summary?.total_count ?? 0), comments: +(r.comments?.summary?.total_count ?? 0), shares: +(r.shares?.count ?? 0) }; if (r.permalink_url) fb.url = r.permalink_url; did = true; }
    }
    if (ig?.status === "posted" && ig.postId) {
      const r = await graph("GET", ig.postId, { fields: "permalink,like_count,comments_count" }, page.token, c.appSecret);
      if (!r.__error) { stats.instagram = { likes: +(r.like_count ?? 0), comments: +(r.comments_count ?? 0) }; did = true; }
    }
    if (did) await withSchool((q) => q(`update social_posts set stats = $2::jsonb, stats_at = now(), channels = $3::jsonb where id = $1`, [p.id, JSON.stringify(stats), JSON.stringify(p.channels)]));
  }
}
export async function cancelPost(id: string) {
  const c = await metaCfg(); const page = metaPage(c);
  const p = (await withSchool((q) => q<SocialPost>(`select ${POST_COLS} from social_posts where id::text = $1`, [id])))[0];
  if (!p) fail("That post wasn’t found.");
  for (const ch of ["facebook", "instagram"]) {
    const x = p.channels[ch]; if (x?.status !== "scheduled") continue;
    if (ch === "facebook" && page) { const r = await graph("DELETE", x.photoId ?? x.postId!, {}, page.token, c.appSecret); if (r.__error) fail("Facebook wouldn’t cancel it: " + r.__error); }
    x.status = "cancelled";
  }
  await withSchool((q) => q(`update social_posts set channels = $2::jsonb where id = $1`, [p.id, JSON.stringify(p.channels)]));
  return p;
}
export async function removePost(id: string) {
  const p = (await withSchool((q) => q<SocialPost>(`select ${POST_COLS} from social_posts where id::text = $1`, [id])))[0];
  if (p && Object.values(p.channels).some((x) => x.status === "scheduled" || x.status === "processing")) fail("Cancel the scheduled post first.");
  await withSchool((q) => q(`delete from social_posts where id::text = $1`, [id]));
}

// ---------- the content calendar ----------
const PLATFORMS = ["instagram", "facebook", "linkedin", "x", "threads", "bluesky"];
const PLAN_COLS = `id, created_at::text as created, created_by as by, status, platform, to_char(plan_date, 'YYYY-MM-DD') as date, item_id as "bookId", text, link, size, posted_at::text as "postedAt", url`;
export const listPlan = () => withSchool((q) => q(`select ${PLAN_COLS} from social_plan order by plan_date`));
export async function savePlan(b: Record<string, unknown>, by: string) {
  return withSchool(async (q) => {
    const id = typeof b.id === "string" && /^[0-9a-f-]{36}$/.test(b.id) ? b.id : null;
    const cur = id ? (await q<Record<string, unknown>>(`select ${PLAN_COLS} from social_plan where id = $1`, [id]))[0] : null;
    if (id && !cur) fail("That planned post wasn’t found.");
    const p: Record<string, unknown> = cur ? { ...cur } : { status: "planned" };
    if (b.platform !== undefined) { if (!PLATFORMS.includes(String(b.platform))) fail("Choose a platform."); p.platform = b.platform; }
    if (b.date !== undefined) { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.date))) fail("Choose a date."); p.date = b.date; }
    if (b.bookId !== undefined) p.bookId = validItemId(b.bookId) ? b.bookId : "";
    if (b.text !== undefined) p.text = String(b.text).replace(/\r/g, "").slice(0, 5000);
    if (b.link !== undefined) p.link = String(b.link).trim().slice(0, 500);
    if (b.size !== undefined) p.size = ["square", "portrait", "story", "landscape"].includes(String(b.size)) ? b.size : "square";
    let postedAt: string | null = (p.postedAt as string) ?? null;
    if (b.status !== undefined) {
      p.status = b.status === "posted" ? "posted" : "planned";
      if (p.status === "posted") { postedAt = new Date().toISOString(); const u = String(b.url ?? "").trim(); p.url = /^https?:\/\/\S+$/i.test(u) ? u.slice(0, 500) : ""; }
      else { postedAt = null; p.url = ""; }
    }
    if (!p.platform || !p.date) fail("Choose a platform and a date.");
    const vals = [p.status, p.platform, p.date, p.bookId ?? "", p.text ?? "", p.link ?? "", p.size ?? "square", postedAt, p.url ?? ""];
    const r = id ? await q(`update social_plan set status=$2, platform=$3, plan_date=$4, item_id=$5, text=$6, link=$7, size=$8, posted_at=$9, url=$10 where id = $1 returning ${PLAN_COLS}`, [id, ...vals])
      : await q(`insert into social_plan (school_id, created_by, status, platform, plan_date, item_id, text, link, size, posted_at, url) values (current_school(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning ${PLAN_COLS}`, [by, ...vals]);
    return r[0];
  });
}
export const deletePlan = (id: string) => withSchool((q) => q(`delete from social_plan where id::text = $1`, [id]));

// ---------- picture template, handles ----------
export async function getTemplate() { return kvGet<Record<string, unknown>>("template"); }
export async function saveTemplate(inp: Record<string, unknown>) {
  const t: Record<string, unknown> = {};
  const en: Record<string, string[]> = { bg: ["book", "custom"], tone: ["auto", "dark", "light"], coverAlign: ["left", "center"], textAlign: ["top", "middle"], logo: ["auto", "white", "black", "brand", "none"] };
  for (const [k, ok] of Object.entries(en)) t[k] = ok.includes(String(inp[k])) ? inp[k] : ok[0];
  t.bgColor = /^#[0-9a-f]{6}$/i.test(String(inp.bgColor ?? "")) ? inp.bgColor : "#F3F4FA";
  for (const [k, lo, hi] of [["coverSize", 80, 115], ["titleSize", 70, 130], ["logoSize", 70, 140]] as const) t[k] = Math.max(lo, Math.min(hi, Math.round(Number(inp[k] ?? 100)) || 100));
  for (const k of ["shadow", "eyebrow", "subtitle", "partner", "url"]) t[k] = !!inp[k] && inp[k] !== "false";
  t.urlText = String(inp.urlText ?? "").replace(/[\x00-\x1F]/g, "").trim().slice(0, 60);
  await kvSet("template", t);
  return t;
}
export async function getHandles() { return (await kvGet<Record<string, string>>("handles")) ?? {}; }
export async function saveHandle(partner: string, handles: string) {
  const p = partner.trim().slice(0, 160); if (!p) fail("No teacher.");
  const h = handles.replace(/[^@A-Za-z0-9._ ,]/g, "").split(/[\s,]+/).filter((x) => x && (x.indexOf("@") <= 0)).join(" "); // handles only, never an email address
  const all = await getHandles();
  if (!h) delete all[p]; else all[p] = h.slice(0, 200);
  await kvSet("handles", all);
}

// ---------- Claude: AI searches and Upcoming moments ----------
type AiCfg = { key?: string; model?: string };
const aiCfg = async () => (await kvGet<AiCfg>("ai")) ?? {};
export const aiReady = async () => !!(await aiCfg()).key;
export async function aiStatus() { const c = await aiCfg(); return { hasKey: !!c.key, keyEnd: c.key ? c.key.slice(-4) : "", model: c.model ?? "" }; }
export async function aiSave(b: Record<string, unknown>) {
  const c = await aiCfg();
  if (b.forget) { await kvSet("ai", null); return; }
  const key = String(b.key ?? "").trim();
  if (key) { if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key)) fail("That doesn’t look like an Anthropic API key. It starts sk-ant-."); c.key = key; }
  if (!c.key) fail("Paste the API key.");
  const m = String(b.model ?? "").trim(); c.model = /^[a-z0-9.-]{3,60}$/.test(m) ? m : undefined;
  await kvSet("ai", c);
}
const SYS = "You help the marketing team of OH-SO ED, a UK online school for home-educated secondary students (KS3, pre-GCSE, GCSE and A-Level courses taught live online by qualified subject specialists; Facebook /ohsoedonline). They post timely things: birthdays and anniversaries of authors, scientists, mathematicians, historical figures and events on the courses they teach, awareness days and weeks (World Book Day, British Science Week, Maths Week England and so on), exam-season dates (JCQ exam timetables, results days, private candidate entry deadlines), and home-education events, always leading back to a course or workshop.\n\nRules: use web search to check every fact and date; never invent or guess. Only include things you found a reliable source for, and give that source URL. Write openers in a warm, encouraging teacher's voice for parents and students, British spelling, 1-3 sentences, no hashtags, no emoji, no links in the text. Dates as YYYY-MM-DD. Reply with ONLY a JSON object, no other text.";
async function callClaude(body: Record<string, unknown>, key: string) {
  const res = await fetch(process.env.ANTHROPIC_API_URL || "https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(280000),
  }).catch((e) => fail("Couldn’t reach Claude: " + String((e as Error).message || e), 502));
  const j = await (res as Response).json().catch(() => ({})) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!(res as Response).ok) fail("Claude said: " + String(j?.error?.message ?? (res as Response).status), 502);
  return j;
}
async function socialAi(task: string, searches = 8): Promise<Record<string, unknown>> {
  const c = await aiCfg(); if (!c.key) fail("Add the Anthropic API key first (Connect to Social › AI searches).");
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });
  const msgs: unknown[] = [{ role: "user", content: `Today is ${today}.\n\n${task}` }];
  const tools = [{ type: "web_search_20250305", name: "web_search", max_uses: searches }];
  let text = "";
  for (let i = 0; i < 4; i++) { // the API can pause a long search turn: send it back unchanged to continue
    const res = await callClaude({ model: c.model || "claude-sonnet-5-5", max_tokens: 6000, system: SYS, messages: msgs, tools }, c.key!);
    for (const blk of res.content ?? []) if (blk.type === "text") text += blk.text;
    if (res.stop_reason !== "pause_turn") break;
    msgs.push({ role: "assistant", content: res.content }); text = "";
  }
  const m = text.match(/\{[\s\S]*\}/); if (!m) fail("Claude didn’t return any suggestions. Try again.", 502);
  try { return JSON.parse(m![0]); } catch { return fail("Claude’s answer couldn’t be read. Try again.", 502); }
}
export type Moment = { id: string; kind: string; date: string; title: string; opener: string; person: string; venue: string; city: string; starts: string; ends: string; url: string; bookId: string; addedAt?: string };
type Moments = { items: Moment[]; auto: boolean; emails: string[]; scannedAt?: string; lastAuto?: string; by?: string; dismissed?: string[] };
const KINDS = ["fact", "birthday", "anniversary", "news", "exhibition", "event"];
function cleanSuggestion(x: Record<string, unknown>, ids: string[]): Moment | null {
  const s = (k: string, n = 300) => String(x[k] ?? "").replace(/[\x00-\x1F]/g, " ").trim().slice(0, n);
  const d = (k: string) => /^\d{4}-\d{2}-\d{2}$/.test(String(x[k] ?? "")) ? String(x[k]) : "";
  let url = s("url", 500); if (url && !/^https?:\/\/\S+$/i.test(url)) url = "";
  const out: Moment = { id: createHmac("md5", "m").update(JSON.stringify(x)).digest("hex").slice(0, 10), kind: KINDS.includes(String(x.kind)) ? String(x.kind) : "fact", date: d("date"),
    title: s("title", 140), opener: s("opener", 700), person: s("person", 120), venue: s("venue", 140), city: s("city", 80), starts: d("starts"), ends: d("ends"), url,
    bookId: ids.includes(String(x.bookId)) ? String(x.bookId) : "" };
  return out.opener || out.title ? out : null;
}
export async function findForItem(itemId: string, kind: string) {
  const it = (await socialItems()).find((x) => x.id === itemId); if (!it) fail("Choose a course or workshop.");
  const item = it!;
  const what = kind === "exhibition" ? "events and key dates: upcoming awareness days or weeks, exam dates and deadlines, competitions, webinars and events linked to this subject, with dates"
    : kind === "fact" ? "facts: upcoming or recent birthdays and death anniversaries (roughly the past 2 weeks to the next 10 weeks) of authors, scientists, mathematicians or historical figures this course covers, anniversaries of key works, discoveries or events, and recent news or new research about the subject"
    : "facts (birthdays, anniversaries, news about the subject) and events or key dates linked to it";
  const info = `Course: ${item.title}${item.subtitle ? `\nExam board / level: ${item.subtitle}` : ""}${item.partner ? `\nTeacher: ${item.partner}` : ""}\nSubject: ${item.subject}\nAbout: ${item.summary}${item.topics.length ? `\nTopics: ${item.topics.join("; ")}` : ""}`;
  const j = await socialAi(`Find timely hooks for an Instagram or Facebook post about this OH-SO ED ${item.kind}. Look for ${what}. Prefer things that are coming up soon or happened very recently.\n\nThe ${item.kind}:\n${info}\n\nReturn {"suggestions": [up to 5 items: {"kind": "birthday"|"anniversary"|"fact"|"news"|"exhibition"|"event", "date": the day it happens or starts (YYYY-MM-DD or ""), "title": short label, "person": person or subject, "opener": the opening text for the post, "venue": "", "city": "", "starts": "", "ends": "", "url": source}]}. Use "exhibition" or "event" for dated events. If you find nothing reliable, return {"suggestions": []}.`, 6);
  const out: Moment[] = [];
  for (const x of (j.suggestions as Record<string, unknown>[] | undefined) ?? []) { const c = x && typeof x === "object" ? cleanSuggestion({ ...x, bookId: item.id }, [item.id]) : null; if (c) out.push(c); }
  return out.slice(0, 6);
}
const momentsLoad = async (): Promise<Moments> => ({ items: [], auto: true, emails: [], ...((await kvGet<Moments>("moments")) ?? {}) });
const momentsSave = (m: Moments) => kvSet("moments", m);
async function scanRun(by: string): Promise<[Moments, Moment[]]> {
  const items = await socialItems(); const ids = items.map((x) => x.id);
  const lines = items.map((x) => `${x.id} | ${x.title}${x.subtitle ? ": " + x.subtitle : ""}${x.topics.length ? " | topics: " + x.topics.join("; ") : ""}${x.kind === "workshop" ? " | workshop on " + x.pubDate : ""}`).join("\n");
  let m = await momentsLoad();
  const known = m.items.map((x) => `- ${x.date} ${x.title}`).join("\n");
  const j = await socialAi(`Here is the OH-SO ED list of courses and workshops (id | title | topics).\n\n${lines}\n\nFind up to 10 timely hooks in the next 8 weeks: birthdays or anniversaries (birth, death, a famous work, discovery or event) of people and things these courses teach, awareness days or weeks, exam and results dates, private-candidate entry deadlines, and home-education events that relate to a course or workshop. Start with what you already know has dates in that window, then check each with web search.${known ? `\n\nAlready on the team's list (don't repeat these):\n${known}` : ""}\n\nReturn {"suggestions": [{"bookId": an id from the list, "kind": "birthday"|"anniversary"|"fact"|"news"|"exhibition"|"event", "date": YYYY-MM-DD, "title": short label, "person": "", "opener": the opening text for the post, "venue": "", "city": "", "starts": "", "ends": "", "url": source}]}, sorted by date.`, 12);
  const fresh: Moment[] = [];
  for (const x of (j.suggestions as Record<string, unknown>[] | undefined) ?? []) { const c = x && typeof x === "object" ? cleanSuggestion(x, ids) : null; if (c && c.bookId) fresh.push(c); }
  m = await momentsLoad(); // read again: someone may have dismissed one meanwhile
  const cut = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  const keep = m.items.filter((x) => !x.date || x.date >= cut || (x.ends && x.ends >= cut));
  const key = (x: Moment) => `${x.bookId}|${x.date}|${x.kind}`;
  const have = new Set(keep.map(key)), gone = new Set(m.dismissed ?? []);
  const added: Moment[] = [];
  for (const c of fresh) { if (have.has(key(c)) || gone.has(c.id)) continue; c.addedAt = new Date().toISOString(); keep.push(c); added.push(c); have.add(key(c)); }
  keep.sort((a, b) => (a.date || "9").localeCompare(b.date || "9"));
  m.items = keep; m.scannedAt = new Date().toISOString(); m.by = by;
  await momentsSave(m);
  return [m, added];
}
async function momentsRecipients(m: Moments): Promise<string[]> {
  const to = (m.emails ?? []).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  if (to.length) return [...new Set(to)];
  const admins = await withSchool((q) => q<{ email: string }>(`select email::text from users where role = 'school_admin' and disabled_at is null`));
  return [...new Set(admins.map((a) => a.email.toLowerCase()))];
}
export async function momentsForClient() {
  const m = await kvGet<Moments>("moments"); if (!m) return null;
  const { dismissed, ...rest } = { ...({ items: [], auto: true, emails: [] } as Moments), ...m }; void dismissed;
  return { ...rest, recipients: await momentsRecipients(m) };
}
export async function scanNow(by: string) { const [m, added] = await scanRun(by); const { dismissed, ...rest } = m; void dismissed; return { ...rest, recipients: await momentsRecipients(m), added: added.length }; }
export async function momentSettings(b: Record<string, unknown>) {
  const m = await momentsLoad();
  if (b.auto !== undefined) m.auto = !!b.auto;
  if (b.emails !== undefined) {
    const l = String(b.emails).split(/[\s,;]+/).filter(Boolean);
    for (const x of l) if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)) fail(`“${x.slice(0, 60)}” isn’t an email address.`);
    m.emails = [...new Set(l.map((x) => x.toLowerCase()))];
  }
  await momentsSave(m);
  const { dismissed, ...rest } = m; void dismissed;
  return { ...rest, recipients: await momentsRecipients(m) };
}
export async function dismissMoment(id: string) {
  const m = await momentsLoad();
  m.items = m.items.filter((x) => x.id !== id);
  m.dismissed = [...new Set([...(m.dismissed ?? []), id])].slice(-300);
  await momentsSave(m);
}
function momentsEmail(m: Moments, added: Moment[], items: SocialItem[], base: string, test = false) {
  const e = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  const byId = new Map(items.map((x) => [x.id, x]));
  const d = (x: string) => x ? new Date(x + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
  const addedIds = new Set(added.map((x) => x.id));
  const rest = m.items.filter((x) => !addedIds.has(x.id));
  const card = (x: Moment, isNew: boolean) => {
    const it = byId.get(x.bookId); const cover = it?.cover ? (it.cover.startsWith("http") ? it.cover : base + it.cover) : "";
    const go = `${base}/admin/social?social=moments&m=${encodeURIComponent(x.id)}`;
    return `<tr><td style="padding:0 0 14px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #dfe2ea;border-radius:10px"><tr>`
      + (cover ? `<td width="92" valign="top" style="padding:16px 0 16px 16px"><img src="${e(cover)}" width="76" alt="" style="display:block;width:76px;height:auto;border:0;border-radius:8px"></td>` : "")
      + `<td valign="top" style="padding:16px 18px;font:400 14px/1.5 Arial,Helvetica,sans-serif;color:#171b2b">`
      + `<div style="font:600 12px/1.4 Arial,Helvetica,sans-serif;color:#5c6378;letter-spacing:.04em">${e(d(x.date))}${x.date ? " &middot; " : ""}${e(x.kind.toUpperCase())}${isNew ? ' &middot; <span style="color:#0f1747">NEW</span>' : ""}</div>`
      + `<div style="font:600 16px/1.3 Arial,Helvetica,sans-serif;margin:4px 0 6px;color:#0f1747">${e(x.title)}</div><div style="margin:0 0 8px">${e(x.opener)}</div>`
      + `<div style="font-size:13px;color:#5c6378;margin:0 0 12px">For: ${e(it?.title ?? "")}${x.url ? ` &middot; <a href="${e(x.url)}" style="color:#2c4fb8">Source</a>` : ""}</div>`
      + `<a href="${e(go)}" style="display:inline-block;background:#e3cd4b;color:#0f1747;text-decoration:none;font:700 13px/1 Arial,Helvetica,sans-serif;padding:10px 16px;border-radius:999px">Make a post</a></td></tr></table></td></tr>`;
  };
  const wk = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const intro = added.length ? `${added.length} new moment${added.length === 1 ? "" : "s"} this week, found on the web and checked by Claude. Pick one and the post is half written.` : "No new moments this week. Here’s what’s still coming up.";
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Upcoming moments</title></head><body style="margin:0;padding:0;background:#f3f4f8">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f8"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px">`
    + `<tr><td style="background:#0f1747;border-radius:12px;padding:22px 26px"><div style="font:600 12px/1.4 Arial,Helvetica,sans-serif;color:#c9cde4;letter-spacing:.08em">OH&ndash;SO ED &middot; WEEKLY &middot; ${e(wk.toUpperCase())}</div><div style="font:700 30px/1.15 Arial,Helvetica,sans-serif;color:#e3cd4b;margin-top:10px">Upcoming moments</div><div style="font:400 15px/1.5 Arial,Helvetica,sans-serif;color:#fff;margin-top:8px">${e(intro)}</div></td></tr>`
    + (test ? `<tr><td style="padding:14px 4px 0;font:400 13px/1.5 Arial,Helvetica,sans-serif;color:#5c6378">This is a test of the weekly report, sent from Social › Upcoming moments.</td></tr>` : "")
    + `<tr><td style="padding:20px 0 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">`
    + (added.length ? `<tr><td style="padding:0 2px 10px;font:700 13px/1 Arial,Helvetica,sans-serif;color:#5c6378;letter-spacing:.1em">NEW THIS WEEK</td></tr>` + added.map((x) => card(x, true)).join("") : "")
    + (rest.length ? `<tr><td style="padding:10px 2px 10px;font:700 13px/1 Arial,Helvetica,sans-serif;color:#5c6378;letter-spacing:.1em">STILL TO COME</td></tr>` + rest.slice(0, 12).map((x) => card(x, false)).join("") : "")
    + `</table></td></tr><tr><td style="padding:12px 4px 30px;font:400 12.5px/1.6 Arial,Helvetica,sans-serif;color:#5c6378">Sent every week by the OH-SO ED admin. The full list is in <a href="${e(base + "/admin/social?social=moments")}" style="color:#2c4fb8">Social › Upcoming moments</a>, where you can change who gets this email or switch it off. Always check the source before posting.</td></tr>`
    + `</table></td></tr></table></body></html>`;
}
export async function sendTestReport(to: string) {
  if (!emailReady()) fail("Email isn’t connected yet (Brevo), so the report can’t be sent.");
  const m = await momentsLoad(); const base = await siteBase();
  const recent = m.items.filter((x) => x.addedAt && Date.parse(x.addedAt) > Date.now() - 7 * 86400000);
  const r = await sendHtml("OH-SO ED social: upcoming moments (test)", momentsEmail(m, recent, await socialItems(), base, true), [to]);
  if (!r.ok) fail("The email couldn’t be sent: " + r.error, 500);
}
/** Once a week (on the first admin visit after it's due): update the list and email the report. Starts only after the team's first look. */
export async function weeklyMaybe() {
  const m = await momentsLoad();
  if (!m.auto || !m.scannedAt || !(await aiReady())) return;
  const week = 7 * 86400000;
  if (m.lastAuto && Date.parse(m.lastAuto) > Date.now() - week + 3600000) return;
  if (!m.lastAuto && Date.parse(m.scannedAt) > Date.now() - week) return; // a recent manual look counts as this week's
  // a lock so two visits don't both run it
  const got = await withSchool((q) => q(`insert into social_kv (school_id, key, value) values (current_school(), 'moments_lock', to_jsonb(now()))
    on conflict (school_id, key) do update set value = excluded.value, updated_at = now() where social_kv.updated_at < now() - interval '15 minutes' returning key`));
  if (!got.length) return;
  try {
    const [mm, added] = await scanRun("weekly");
    mm.lastAuto = new Date().toISOString(); await momentsSave(mm);
    if (emailReady()) {
      const base = await siteBase();
      const subj = added.length ? `OH-SO ED social: ${added.length} new moment${added.length === 1 ? "" : "s"} this week` : "OH-SO ED social: upcoming moments";
      await sendHtml(subj, momentsEmail(mm, added, await socialItems(), base), await momentsRecipients(mm));
    }
  } catch { /* tried again next week */ } finally { await kvSet("moments_lock", null).catch(() => {}); }
}

/** Background jobs run after an admin page has been sent (so nobody waits). */
export async function socialBackground() {
  try { await runDue(2); } catch { /* next visit */ }
  try { await weeklyMaybe(); } catch { /* next visit */ }
}
