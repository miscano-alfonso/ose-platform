import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { withSchool } from "./db";

// Admin → Marketing → Post designs: data for the templates, the illustration library, and Canva (read-only: your own designs).
type Q = <T = Record<string, unknown>>(s: string, p?: unknown[]) => Promise<T[]>;
export class DesignError extends Error {}
const fail = (m: string): never => { throw new DesignError(m); };

async function kvGet<T>(key: string, q?: Q): Promise<T | null> {
  const run = async (qq: Q) => (await qq<{ value: T }>(`select value from design_kv where key = $1`, [key]))[0]?.value ?? null;
  return q ? run(q) : withSchool(run);
}
async function kvSet(key: string, value: unknown, q?: Q) {
  const run = (qq: Q) => value == null ? qq(`delete from design_kv where key = $1`, [key])
    : qq(`insert into design_kv (school_id, key, value) values (current_school(), $1, $2) on conflict (school_id, key) do update set value = excluded.value, updated_at = now()`, [key, JSON.stringify(value)]);
  await (q ? run(q) : withSchool(run));
}

// ---------- what the templates are filled from ----------
export type StudioCourse = { id: string; level: string; subject: string; colour: string; code: string; teacher: string | null; times: string; status: string };
export type StudioTeacher = { id: string; name: string; first: string; designation: string | null; photo: string | null; subjects: string[]; levels: string[] };
export type StudioData = { school: string; subjects: { name: string; colour: string }[]; levels: { name: string; min: number | null; max: number | null }[];
  courses: StudioCourse[]; teachers: StudioTeacher[]; nextTerm: { name: string; starts: string } | null; assets: Asset[] };
export type Asset = { id: string; name: string; kind: string; source: string; created_at: string };

export async function studioData(): Promise<StudioData> {
  return withSchool(async (q) => {
    const [s] = await q<{ name: string }>(`select name from schools where id = current_school()`);
    const subjects = await q<{ name: string; colour: string }>(`select name, coalesce(colour, '#8494c2') as colour from subjects order by name`);
    const levels = await q<{ name: string; min: number | null; max: number | null }>(`select name, min_age as min, max_age as max from levels order by sort_order`);
    const courses = await q<StudioCourse>(`select g.id, l.name as level, sj.name as subject, coalesce(sj.colour, '#8494c2') as colour, g.code, u.name as teacher, g.status::text as status,
        coalesce((select string_agg(case s.weekday when 1 then 'Mondays' when 2 then 'Tuesdays' when 3 then 'Wednesdays' when 4 then 'Thursdays' when 5 then 'Fridays' when 6 then 'Saturdays' else 'Sundays' end
          || ' @' || to_char(s.starts_at, 'FMHH12.MI') || lower(to_char(s.starts_at, 'am')), ', ' order by s.weekday, s.starts_at) from lesson_slots s where s.group_id = g.id), '') as times
      from course_groups g join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id join academic_years y on y.id = g.academic_year_id
      left join teachers t on t.id = g.teacher_id left join users u on u.id = t.user_id
      where y.ends_on >= current_date and g.status <> 'closed' order by l.sort_order, sj.name, g.code`);
    const teachers = await q<StudioTeacher>(`select t.id, u.name, split_part(u.name, ' ', 1) as first, t.designation,
        case when t.photo is not null or t.photo_asset is not null then '/admin/design-api?action=photo&id=' || t.id || '&v=' || coalesce(extract(epoch from t.photo_updated_at)::bigint, 0) end as photo,
        coalesce((select array_agg(distinct sj.name) from teacher_subjects ts join subjects sj on sj.id = ts.subject_id where ts.teacher_id = t.id), '{}') as subjects,
        coalesce((select array_agg(distinct l.name) from teacher_subjects ts join levels l on l.id = ts.level_id where ts.teacher_id = t.id), '{}') as levels
      from teachers t join users u on u.id = t.user_id where t.archived_at is null and u.disabled_at is null order by t.sort_order, u.name`);
    const [nt] = await q<{ name: string; starts: string }>(`select name, starts_on::text as starts from terms where starts_on > current_date order by starts_on limit 1`);
    const assets = await q<Asset>(`select id, name, kind, source, created_at::text from design_assets order by created_at desc limit 300`);
    return { school: s?.name ?? "OH-SO ED", subjects, levels, courses, teachers, nextTerm: nt ?? null, assets };
  });
}

// ---------- illustration library ----------
const MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);
const sniff = (b: Buffer) => b[0] === 0x89 && b[1] === 0x50 ? "image/png" : b[0] === 0xff && b[1] === 0xd8 ? "image/jpeg" : b.slice(8, 12).toString() === "WEBP" ? "image/webp" : null;
export async function saveAsset(by: string, name: string, kind: string, data: Buffer, canvaId?: string): Promise<string> {
  const mime = sniff(data);
  if (!mime || !MIMES.has(mime)) fail("Upload a PNG, JPEG or WebP picture.");
  if (data.length > 8 * 1024 * 1024) fail("That picture is over 8 MB. Make it smaller first.");
  const k = kind === "photo" ? "photo" : "illustration";
  return withSchool(async (q) => {
    if (canvaId) {
      const r = await q<{ id: string }>(`insert into design_assets (school_id, name, kind, source, canva_id, mime, data, created_by) values (current_school(), $1, $2, 'canva', $3, $4, $5, $6)
        on conflict (school_id, canva_id) where canva_id is not null do update set data = excluded.data, mime = excluded.mime, name = excluded.name returning id`, [name.slice(0, 120), k, canvaId, mime, data, by]);
      return r[0].id;
    }
    const r = await q<{ id: string }>(`insert into design_assets (school_id, name, kind, source, mime, data, created_by) values (current_school(), $1, $2, 'upload', $3, $4, $5) returning id`, [name.slice(0, 120) || "Picture", k, mime, data, by]);
    return r[0].id;
  });
}
export async function getAsset(id: string): Promise<{ mime: string; data: Buffer } | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  return (await withSchool((q) => q<{ mime: string; data: Buffer }>(`select mime, data from design_assets where id = $1`, [id])))[0] ?? null;
}
export async function deleteAsset(id: string) { await withSchool((q) => q(`delete from design_assets where id = $1`, [id])); }
export async function renameAsset(id: string, name: string, kind: string) {
  await withSchool((q) => q(`update design_assets set name = $2, kind = $3 where id = $1`, [id, name.slice(0, 120) || "Picture", kind === "photo" ? "photo" : "illustration"]));
}

/** A teacher's photo, served from this site so the canvas can tint it (the photo may live on the old website). */
export async function teacherPhoto(id: string): Promise<{ mime: string; data: Buffer } | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [t] = await withSchool((q) => q<{ photo: Buffer | null; photo_type: string | null; photo_asset: string | null }>(`select photo, photo_type, photo_asset from teachers where id = $1 and archived_at is null`, [id]));
  if (!t) return null;
  if (t.photo) return { mime: t.photo_type || "image/jpeg", data: t.photo };
  if (t.photo_asset && /^https:\/\//.test(t.photo_asset)) {
    const r = await fetch(t.photo_asset, { signal: AbortSignal.timeout(15000) }).catch(() => null);
    if (!r?.ok) return null;
    const data = Buffer.from(await r.arrayBuffer()); const mime = sniff(data);
    return mime ? { mime, data } : null;
  }
  return null;
}

// ---------- Canva (Connect API, read-only: list your designs, export one as a PNG) ----------
type Canva = { clientId?: string; clientSecret?: string; refreshToken?: string; by?: string; at?: string; folderId?: string; folderName?: string;
  pending?: { state: string; verifier: string; exp: number } };
const API = () => process.env.CANVA_API_URL || "https://api.canva.com/rest/v1";
const AUTH = () => process.env.CANVA_AUTH_URL || "https://www.canva.com/api/oauth/authorize";
const SCOPES = "design:meta:read design:content:read folder:read";
export const canvaRedirect = (base: string) => `${base}/admin/design-api?action=canvacallback`;
const b64u = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function canvaStatus(base: string) {
  const c = (await kvGet<Canva>("canva")) ?? {};
  return { hasApp: !!(c.clientId && c.clientSecret), clientId: c.clientId ?? "", connected: !!c.refreshToken, by: c.by ?? "", at: c.at ?? "",
    folderId: c.folderId ?? "", folderName: c.folderName ?? "", redirect: canvaRedirect(base) };
}
export async function canvaSaveApp(clientId: string, secret: string) {
  clientId = clientId.trim(); secret = secret.trim();
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(clientId)) fail("Paste the Client ID from the Canva Developer Portal.");
  const c = (await kvGet<Canva>("canva")) ?? {};
  if (!secret && (c.clientId !== clientId || !c.clientSecret)) fail("Paste the Client secret too.");
  if (secret && !/^[\w.~+/=-]{16,200}$/.test(secret)) fail("That doesn’t look like a Canva Client secret.");
  if (c.clientId !== clientId) { delete c.refreshToken; delete c.by; delete c.at; }
  c.clientId = clientId; if (secret) c.clientSecret = secret;
  await kvSet("canva", c);
}
export async function canvaDisconnect(forget: boolean) {
  const c = (await kvGet<Canva>("canva")) ?? {};
  if (forget) return kvSet("canva", null);
  delete c.refreshToken; delete c.by; delete c.at; await kvSet("canva", c);
}
export async function canvaFolder(link: string) {
  const m = /(?:folder\/|^)(FA[A-Za-z0-9_-]{6,40})/.exec(link.trim());
  if (!m && link.trim()) fail("Paste the folder’s link from Canva (it contains /folder/FA…).");
  const c = (await kvGet<Canva>("canva")) ?? {};
  c.folderId = m?.[1] ?? undefined; c.folderName = undefined;
  await kvSet("canva", c);
}
export async function canvaLoginUrl(base: string): Promise<string> {
  const c = (await kvGet<Canva>("canva")) ?? {};
  if (!c.clientId || !c.clientSecret) fail("Save the Canva Client ID and secret first.");
  const verifier = b64u(randomBytes(48)), state = randomBytes(16).toString("hex");
  c.pending = { state, verifier, exp: Date.now() + 15 * 60000 }; await kvSet("canva", c);
  const q = new URLSearchParams({ code_challenge_method: "s256", response_type: "code", client_id: c.clientId!, redirect_uri: canvaRedirect(base), scope: SCOPES,
    code_challenge: b64u(createHash("sha256").update(verifier).digest()), state });
  return `${AUTH()}?${q}`;
}
async function token(c: Canva, body: Record<string, string>) {
  const r = await fetch(`${API()}/oauth/token`, { method: "POST", signal: AbortSignal.timeout(20000),
    headers: { "content-type": "application/x-www-form-urlencoded", authorization: "Basic " + Buffer.from(`${c.clientId}:${c.clientSecret}`).toString("base64") }, body: new URLSearchParams(body) });
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  return r.ok ? j : { __error: String(j.error_description ?? j.message ?? j.error ?? r.status) };
}
export async function canvaCallback(base: string, sp: URLSearchParams, by: string): Promise<string | null> {
  const c = (await kvGet<Canva>("canva")) ?? {}; const p = c.pending; delete c.pending;
  const given = sp.get("state") || "";
  if (!p || given.length !== p.state.length || !timingSafeEqual(Buffer.from(given), Buffer.from(p.state)) || Date.now() > p.exp) { await kvSet("canva", c); return "That link has expired. Press Connect Canva again."; }
  if (sp.get("error")) { await kvSet("canva", c); return "Canva said: " + (sp.get("error") || "").slice(0, 200) + "."; }
  const t = await token(c, { grant_type: "authorization_code", code: sp.get("code") || "", code_verifier: p.verifier, redirect_uri: canvaRedirect(base) });
  if (!t.refresh_token) { await kvSet("canva", c); return "Canva didn’t complete the sign-in" + (t.__error ? `: ${t.__error}` : "") + "."; }
  c.refreshToken = String(t.refresh_token); c.by = by; c.at = new Date().toISOString();
  await kvSet("canva", c);
  return null;
}
async function access(): Promise<string> {
  const c = (await kvGet<Canva>("canva")) ?? {};
  if (!c.refreshToken) fail("Connect Canva first.");
  const t = await token(c, { grant_type: "refresh_token", refresh_token: c.refreshToken! });
  if (!t.access_token) fail("Canva’s connection has expired. Press Connect Canva again.");
  if (t.refresh_token) { c.refreshToken = String(t.refresh_token); await kvSet("canva", c); }   // Canva hands out a new refresh token each time
  return String(t.access_token);
}
async function get<T>(at: string, path: string): Promise<T> {
  const r = await fetch(API() + path, { headers: { authorization: `Bearer ${at}` }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) fail(r.status === 404 ? "Canva couldn’t find that folder: paste its link again." : r.status === 403 ? "Canva didn’t allow that: reconnect Canva." : `Canva answered ${r.status}.`);
  return (await r.json()) as T;
}

export type CanvaItem = { id: string; title: string; thumb: string | null; updated: number; imported: boolean };
type DesignObj = { id: string; title?: string; thumbnail?: { url?: string }; updated_at?: number };
export async function canvaList(query: string): Promise<{ items: CanvaItem[]; folder: string | null }> {
  const at = await access();
  const c = (await kvGet<Canva>("canva")) ?? {};
  let designs: DesignObj[] = [];
  if (c.folderId && !query) {
    const j = await get<{ items?: { type: string; design?: DesignObj }[] }>(at, `/folders/${encodeURIComponent(c.folderId)}/items?item_types=design&limit=100&sort_by=modified_descending`);
    designs = (j.items ?? []).filter((x) => x.type === "design" && x.design).map((x) => x.design!);
  } else {
    const j = await get<{ items?: DesignObj[] }>(at, `/designs?${new URLSearchParams({ ...(query ? { query: query.slice(0, 100) } : {}), sort_by: "modified_descending" })}`);
    designs = j.items ?? [];
  }
  const have = new Set((await withSchool((q) => q<{ c: string }>(`select canva_id as c from design_assets where canva_id = any($1::text[])`, [designs.map((d) => d.id)]))).map((x) => x.c));
  return { folder: c.folderId ?? null, items: designs.slice(0, 100).map((d) => ({ id: d.id, title: d.title || "Untitled design", thumb: d.thumbnail?.url ?? null, updated: d.updated_at ?? 0, imported: have.has(d.id) })) };
}
/** Export a Canva design's first page as a PNG and keep it in the library. */
export async function canvaImport(by: string, designId: string, title: string, kind: string): Promise<string> {
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(designId)) fail("That isn’t a Canva design.");
  const at = await access();
  const r = await fetch(`${API()}/exports`, { method: "POST", headers: { authorization: `Bearer ${at}`, "content-type": "application/json" }, signal: AbortSignal.timeout(20000),
    body: JSON.stringify({ design_id: designId, format: { type: "png", width: 1600, pages: [1] } }) });
  if (!r.ok) fail(`Canva wouldn’t export that design (${r.status}).`);
  let job = ((await r.json()) as { job: { id: string; status: string; urls?: string[]; error?: { message?: string } } }).job;
  for (let i = 0; i < 25 && job.status === "in_progress"; i++) {
    await new Promise((ok) => setTimeout(ok, 1200));
    job = (await get<{ job: typeof job }>(at, `/exports/${encodeURIComponent(job.id)}`)).job;
  }
  if (job.status !== "success" || !job.urls?.[0]) fail(job.error?.message ? `Canva: ${job.error.message}` : "Canva is still exporting that design. Try again in a minute.");
  const u = new URL(job.urls![0]);
  if (u.protocol !== "https:" && !process.env.CANVA_API_URL) fail("Canva sent an unexpected download link.");
  const img = await fetch(u, { signal: AbortSignal.timeout(30000) });
  if (!img.ok) fail("Couldn’t download the export from Canva.");
  return saveAsset(by, title, kind, Buffer.from(await img.arrayBuffer()), designId);
}
