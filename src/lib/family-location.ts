import "server-only";
import { withSchool } from "./db";

// 27 Nov (Alfonso: "allow parent to select location, so only geographical relevant info is presented"): where a family
// lives, chosen on Resources → Information; links grouped under another country or region are left out. Kept per
// family (the parent's id, so a parent and their children share it) in meet_kv 'family_loc:<parent id>'.
export const ENGLAND_REGIONS = ["London", "South East", "South West", "East of England", "East Midlands", "West Midlands", "Yorkshire and the Humber", "North West", "North East"];
export const COUNTRIES = ["England", "Wales", "Scotland", "Northern Ireland"];
export const PLACES = [...COUNTRIES, ...ENGLAND_REGIONS];
const countryOf = (place: string) => ENGLAND_REGIONS.includes(place) ? "England" : place;

export async function familyLocation(parentId: string): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/.test(parentId)) return null;
  const v = (await withSchool((q) => q<{ value: unknown }>(`select value from meet_kv where key = $1`, [`family_loc:${parentId}`])).catch(() => []))[0]?.value;
  return typeof v === "string" && PLACES.includes(v) ? v : null;
}
export async function setFamilyLocation(parentId: string, place: string) {
  if (!/^[0-9a-f-]{36}$/.test(parentId)) return;
  if (!PLACES.includes(place)) { await withSchool((q) => q(`delete from meet_kv where key = $1`, [`family_loc:${parentId}`])).catch(() => null); return; }
  await withSchool((q) => q(`insert into meet_kv (school_id, key, value) values (current_school(), $1, $2) on conflict (school_id, key) do update set value = excluded.value, updated_at = now()`,
    [`family_loc:${parentId}`, JSON.stringify(place)])).catch(() => null);
}
/** Does a group of links (its sub-heading) apply to this place? Groups not named after a place (or "Across the UK") always do;
 *  a country's group applies to it and its regions; a region's group to that region only. */
export function groupFits(grp: string, place: string | null): boolean {
  if (!place) return true;
  const g = grp.trim();
  if (!PLACES.includes(g)) return true;
  return g === place || g === countryOf(place);
}
