import "server-only";
import { withSchool } from "./db";

// A dashboard is a list of modules; each person can choose which show, their order and their width.
export type ModSize = "s" | "q" | "m" | "l" | "xl" | "full";
export type LayoutItem = { id: string; size: ModSize };
export const SIZES: ModSize[] = ["s", "q", "m", "l", "xl", "full"];

/** The saved layout, cleaned against the modules that exist; null when the person hasn't arranged it. */
export async function getLayout(userId: string, page: string, known: string[]): Promise<LayoutItem[] | null> {
  const r = (await withSchool((q) => q<{ layout: LayoutItem[] }>(`select layout from dashboard_layouts where user_id = $1 and page = $2`, [userId, page])))[0];
  if (!r || !Array.isArray(r.layout)) return null;
  const seen = new Set<string>();
  return r.layout.filter((x) => x && known.includes(x.id) && SIZES.includes(x.size) && !seen.has(x.id) && seen.add(x.id));
}

export async function saveLayout(userId: string, page: string, layout: LayoutItem[] | null, known: string[]) {
  if (!/^[a-z-]{1,40}$/.test(page)) return;
  await withSchool(async (q) => {
    if (!layout) { await q(`delete from dashboard_layouts where user_id = $1 and page = $2`, [userId, page]); return; }
    const seen = new Set<string>();
    const clean = layout.filter((x) => x && known.includes(x.id) && SIZES.includes(x.size) && !seen.has(x.id) && seen.add(x.id)).slice(0, 40);
    await q(`insert into dashboard_layouts (school_id, user_id, page, layout) values (current_school(), $1, $2, $3)
      on conflict (user_id, page) do update set layout = excluded.layout, updated_at = now()`, [userId, page, JSON.stringify(clean)]);
  });
}

// ---------- teacher, parent and student dashboards ----------
// The school's standard arrangement (set by an admin while "viewing as") and each person's own copy live in meet_kv:
// dash_std:<page> and dash:<page>:<person id>. A person with no copy of their own sees the school's standard,
// and a school with no standard sees the built-in one.
const clean = (layout: unknown, known: string[]): LayoutItem[] | null => {
  if (!Array.isArray(layout)) return null;
  const seen = new Set<string>();
  return (layout as LayoutItem[]).filter((x) => x && known.includes(x.id) && SIZES.includes(x.size) && !seen.has(x.id) && seen.add(x.id)).slice(0, 40);
};
const okPage = (p: string) => /^[a-z-]{1,30}$/.test(p), okId = (id: string) => /^[0-9a-f-]{36}$/.test(id);

export async function boardLayout(page: string, personId: string | null, known: string[], builtIn: LayoutItem[]):
  Promise<{ layout: LayoutItem[]; defaults: LayoutItem[]; saved: boolean; std: boolean }> {
  const keys = [`dash_std:${page}`, ...(personId && okId(personId) ? [`dash:${page}:${personId}`] : [])];
  const rows = await withSchool((q) => q<{ key: string; value: unknown }>(`select key, value from meet_kv where key = any($1::text[])`, [keys])).catch(() => []);
  const std = clean(rows.find((r) => r.key === keys[0])?.value, known), mine = keys[1] ? clean(rows.find((r) => r.key === keys[1])?.value, known) : null;
  const defaults = std ?? builtIn;
  return { layout: mine ?? defaults, defaults, saved: !!mine, std: !!std };
}

/** Save (or with null, remove) a person's own arrangement, or the school's standard one when personId is null. */
export async function saveBoard(page: string, personId: string | null, layout: LayoutItem[] | null, known: string[]) {
  if (!okPage(page) || (personId !== null && !okId(personId))) return;
  const key = personId ? `dash:${page}:${personId}` : `dash_std:${page}`;
  await withSchool(async (q) => {
    const c = layout && clean(layout, known);
    if (!c) { await q(`delete from meet_kv where key = $1`, [key]); return; }
    await q(`insert into meet_kv (school_id, key, value) values (current_school(), $1, $2)
      on conflict (school_id, key) do update set value = excluded.value, updated_at = now()`, [key, JSON.stringify(c)]);
  });
}
