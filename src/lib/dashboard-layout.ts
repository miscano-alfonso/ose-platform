import "server-only";
import { withSchool } from "./db";

// A dashboard is a list of modules; each person can choose which show, their order and their width.
export type ModSize = "s" | "m" | "l" | "xl" | "full";
export type LayoutItem = { id: string; size: ModSize };
export const SIZES: ModSize[] = ["s", "m", "l", "xl", "full"];

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
