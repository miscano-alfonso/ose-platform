import "server-only";
import { withSchool } from "./db";

// The quick links in the admin dashboard's greeting (5 Nov): each person chooses their own (up to 8), kept in meet_kv.
export type QuickLink = { href: string; label: string };
const EXTRA: QuickLink[] = [{ href: "/admin/messages/write", label: "New message" }, { href: "/admin/social", label: "New post" }, { href: "/admin/email?tab=compose", label: "Write an email" }];
export const DEFAULT_LINKS = ["/admin/timetable", "/admin/families", "/admin/messages", "/admin/social"];
const okId = (s: string) => /^[0-9a-f-]{36}$/.test(s);

/** Everything that can be a quick link: a few actions, then every page in the admin menu. */
export async function linkOptions(allowed: (href: string) => boolean): Promise<QuickLink[]> {
  const { CATALOGUE } = await import("./menus");
  const seen = new Set(EXTRA.map((x) => x.href));
  return [...EXTRA, ...CATALOGUE.admin.filter((x) => x.href !== "/admin" && !seen.has(x.href)).map((x) => ({ href: x.href, label: x.label }))].filter((x) => allowed(x.href.split("?")[0]));
}
export async function myLinks(userId: string): Promise<string[] | null> {
  if (!okId(userId)) return null;
  const r = await withSchool((q) => q<{ value: unknown }>(`select value from meet_kv where key = $1`, [`quick_links:${userId}`])).catch(() => []);
  return Array.isArray(r[0]?.value) ? (r[0].value as unknown[]).filter((x): x is string => typeof x === "string") : null;
}
export async function saveMyLinks(userId: string, hrefs: string[] | null, options: QuickLink[]) {
  if (!okId(userId)) return;
  const key = `quick_links:${userId}`;
  if (!hrefs) { await withSchool((q) => q(`delete from meet_kv where key = $1`, [key])); return; }
  const ok = new Set(options.map((o) => o.href)), clean = [...new Set(hrefs)].filter((h) => ok.has(h)).slice(0, 8);
  await withSchool((q) => q(`insert into meet_kv (school_id, key, value) values (current_school(), $1, $2) on conflict (school_id, key) do update set value = excluded.value, updated_at = now()`, [key, JSON.stringify(clean)]));
}
