import { withSchool } from "@/lib/db";
import { cleanMenu, resolveMenu, type MenuArea, type MenuConfig, type MenuItem, type ResolvedGroup } from "@/lib/menus";

// A school's own menu arrangement for each dashboard, kept in the school's settings store (meet_kv, key menu_<area>).
const key = (a: MenuArea) => `menu_${a}`;

/** The saved arrangement, tidied against today's pages, or null when the school uses the standard one. */
export async function getMenuConfig(area: MenuArea): Promise<MenuConfig | null> {
  const raw = (await withSchool((q) => q<{ value: unknown }>(`select value from meet_kv where key = $1`, [key(area)])))[0]?.value;
  return raw ? cleanMenu(area, raw) : null;
}
export async function saveMenuConfig(area: MenuArea, cfg: MenuConfig | null) {
  await withSchool((q) => cfg == null ? q(`delete from meet_kv where key = $1`, [key(area)])
    : q(`insert into meet_kv (school_id, key, value) values (current_school(), $1, $2) on conflict (school_id, key) do update set value = excluded.value, updated_at = now()`,
      [key(area), JSON.stringify(cleanMenu(area, cfg))]));
}
/** The menu to draw for one dashboard. */
export async function menuFor(area: MenuArea, classes: MenuItem[] = []): Promise<ResolvedGroup[]> {
  return resolveMenu(area, await getMenuConfig(area), classes);
}
