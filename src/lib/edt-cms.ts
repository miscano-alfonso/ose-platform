import "server-only";
import { cache } from "react";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { runAsSchool, siteSchool, withSchool } from "./db";
import { EMPTY_CMS, type Cms, type SecSet, type StyleSet, type BlkSet, FONTS, SIZES, BSIZES } from "./edt-cms-key";

// OH-SO EdTech website editor (edit on the page). OH-SO ED's admins open it from the "Admin" link at the foot of the
// EdTech site (or Admin → Website → EdTech website): /admin/cms checks they're signed in and sets a signed "ose_cms"
// cookie for /osedtech, valid 8 hours. Changes are saved as a draft (shown only to editors) until Publish.
// Stored in OH-SO ED's settings (meet_kv): edt_cms_live and edt_cms_draft.
export const CMS_COOKIE = "ose_cms";
const HOURS = 8;
const secret = () => process.env.ADMIN_SETUP_KEY || process.env.SITE_PASSWORD || process.env.DATABASE_URL || "ose-cms";
const sign = (s: string) => createHmac("sha256", secret()).update(`ose-cms:${s}`).digest("base64url");

export async function startEditing(userId: string) {
  const exp = Math.floor(Date.now() / 1000) + HOURS * 3600, body = `${userId}.${exp}`;
  (await cookies()).set(CMS_COOKIE, `${body}.${sign(body)}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/osedtech", maxAge: HOURS * 3600 });
}
export async function stopEditing() { (await cookies()).delete({ name: CMS_COOKIE, path: "/osedtech" }); }

/** The signed-in editor (an admin of OH-SO ED), or null. */
export const editor = cache(async (): Promise<{ id: string; name: string } | null> => {
  const v = (await cookies()).get(CMS_COOKIE)?.value ?? "";
  const m = /^([0-9a-f-]{36})\.(\d{9,11})\.([\w-]{40,50})$/.exec(v); if (!m) return null;
  const a = Buffer.from(m[3]), b = Buffer.from(sign(`${m[1]}.${m[2]}`));
  if (a.length !== b.length || !timingSafeEqual(a, b) || Number(m[2]) * 1000 < Date.now()) return null;
  const u = await runAsSchool(siteSchool(), () => withSchool((q) => q<{ id: string; name: string }>(`select id, name from users where id = $1 and role = 'school_admin' and disabled_at is null`, [m[1]]))).catch(() => []);
  return u[0] ?? null;
});

const kv = (key: string) => runAsSchool(siteSchool(), () => withSchool((q) => q<{ value: Cms }>(`select value from meet_kv where key = $1`, [key]))).then((r) => r[0]?.value ?? null).catch(() => null);
const put = (key: string, v: Cms | null) => runAsSchool(siteSchool(), () => withSchool((q) => v == null ? q(`delete from meet_kv where key = $1`, [key])
  : q(`insert into meet_kv (school_id, key, value) values (current_school(), $1, $2) on conflict (school_id, key) do update set value = excluded.value, updated_at = now()`, [key, JSON.stringify(v)])));
const fill = (c: Partial<Cms> | null): Cms => ({ text: c?.text ?? {}, sec: c?.sec ?? {}, order: c?.order ?? {}, blk: c?.blk ?? {}, style: c?.style ?? {}, at: c?.at, by: c?.by });

/** What the site shows: the published version, or for an editor the draft (if there is one). */
export const siteCms = cache(async (): Promise<{ cms: Cms; edit: boolean; hasDraft: boolean; publishedAt: string | null }> => {
  const ed = await editor();
  const [live, draft] = await Promise.all([kv("edt_cms_live"), ed ? kv("edt_cms_draft") : Promise.resolve(null)]);
  return { cms: fill(ed && draft ? draft : live ?? EMPTY_CMS), edit: !!ed, hasDraft: !!draft, publishedAt: live?.at ?? null };
});

/** Change the draft (made from the published version the first time). */
export async function changeDraft(by: string, fn: (c: Cms) => void) {
  const c = fill((await kv("edt_cms_draft")) ?? (await kv("edt_cms_live")));
  fn(c); c.by = by; await put("edt_cms_draft", c);
}
export async function publishDraft(by: string) {
  const d = await kv("edt_cms_draft"); if (!d) return;
  await put("edt_cms_live", { ...fill(d), at: new Date().toISOString(), by }); await put("edt_cms_draft", null);
}
export const discardDraft = () => put("edt_cms_draft", null);

// ---------- checking what the editor sends ----------
const SZ = new Set(SIZES.map((s) => s.id));
export function cleanSection(s: Partial<SecSet>): SecSet {
  const o: SecSet = {};
  if (s.pt && SZ.has(s.pt)) o.pt = s.pt; if (s.pb && SZ.has(s.pb)) o.pb = s.pb;
  if (typeof s.bg === "string" && /^(paper|card|deep|teal|sun|#[0-9a-f]{6})$/i.test(s.bg)) o.bg = s.bg;
  if (s.hidden) o.hidden = true;
  return o;
}
const HEX = (v: unknown) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : undefined;
export function cleanStyle(s: Partial<StyleSet>): StyleSet {
  return Object.fromEntries(Object.entries({
    accent: HEX(s.accent), title: HEX(s.title), eyebrow: HEX(s.eyebrow), font: FONTS.includes(String(s.font)) ? s.font : undefined,
    size: typeof s.size === "number" && s.size >= 15 && s.size <= 20 ? Math.round(s.size) : undefined,
    space: s.space === "compact" || s.space === "roomy" ? s.space : undefined, btn: s.btn === "round" || s.btn === "square" ? s.btn : undefined,
    card: typeof s.card === "number" && s.card >= 0 && s.card <= 32 ? Math.round(s.card) : undefined,
  }).filter(([, v]) => v !== undefined)) as StyleSet;
}
const BZ = new Set(BSIZES.map((s) => s.id));
export function cleanBlock(b: Partial<BlkSet>): BlkSet {
  const o: BlkSet = {};
  if (b.mt && BZ.has(b.mt)) o.mt = b.mt; if (b.mb && BZ.has(b.mb)) o.mb = b.mb; if (b.gap && BZ.has(b.gap)) o.gap = b.gap;
  return o;
}
