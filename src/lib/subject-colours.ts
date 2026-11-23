import "server-only";
import { withSchool } from "./db";
import { getPalettes, savePalettes } from "./studio";

// Subject colours (23 Nov): the brand sheet's main, shade and highlight for each subject group, in one place.
// - Sketch Studio draws with them (they're the Studio's palettes: changes here and in the Studio's colour editor are the same thing).
// - Each subject in the timetable takes its group's main colour (subjects.colour), which Social's pictures, dashboards,
//   the timetable, emails and the website's course cards use.
// - Subjects outside the groups (e.g. a language) keep a colour of their own, set here too.
export type Group = { key: string; name: string; re: RegExp; main: string; shade: string; highlight: string };
export const BRAND: Group[] = [
  { key: "english", name: "English", re: /english/i, main: "#008CDB", shade: "#020737", highlight: "#09A6FF" },
  { key: "maths", name: "Maths", re: /math/i, main: "#14AF7C", shade: "#023222", highlight: "#15FFB2" },
  { key: "geography", name: "Geography", re: /geograph/i, main: "#FF914D", shade: "#602500", highlight: "#FFA66F" },
  { key: "history", name: "History", re: /histor/i, main: "#804AC2", shade: "#411B70", highlight: "#A65EFF" },
  { key: "science", name: "Science", re: /science|biolog|chemist|physic/i, main: "#CDC100", shade: "#393603", highlight: "#FFF001" },
  { key: "business", name: "Business", re: /business/i, main: "#9FB4CD", shade: "#263342", highlight: "#B5D7FF" },
  { key: "media", name: "Media", re: /media|film/i, main: "#CF65A6", shade: "#40132F", highlight: "#FF89D1" },
  { key: "economics", name: "Economics", re: /econom/i, main: "#506FA6", shade: "#12274B", highlight: "#89B3FD" },
  { key: "technology", name: "Technology & Computing", re: /comput|technolog|\bict\b/i, main: "#0CC0DF", shade: "#005B6B", highlight: "#1BDEFF" },
];
export const groupOf = (subject: string) => BRAND.find((g) => g.re.test(subject)) ?? null;
const hex = (v: unknown) => (typeof v === "string" && /^#[0-9A-Fa-f]{6}$/.test(v) ? v.toUpperCase() : null);

export type SubjectRow = { id: string; name: string; colour: string; group: string | null };
export async function subjectColours(): Promise<{ groups: (Group & { changed: boolean })[]; subjects: SubjectRow[] }> {
  const [ovr, subs] = await Promise.all([getPalettes(), withSchool((q) => q<{ id: string; name: string; colour: string | null }>(`select id, name, colour from subjects order by name`))]);
  const groups = BRAND.map((g) => { const o = ovr[g.key] ?? {}; const c = { ...g, main: hex(o.main) ?? g.main, shade: hex(o.shade) ?? g.shade, highlight: hex(o.highlight) ?? g.highlight };
    return { ...c, changed: c.main !== g.main || c.shade !== g.shade || c.highlight !== g.highlight }; });
  return { groups, subjects: subs.map((s) => ({ id: s.id, name: s.name, colour: (hex(s.colour) ?? "#8494C2").toLowerCase(), group: groupOf(s.name)?.key ?? null })) };
}

/** Save the groups (as the Studio's palette changes from the brand sheet) and give every subject its colour. */
export async function saveSubjectColours(f: { groups: Record<string, { main?: string; shade?: string; highlight?: string }>; subjects: Record<string, string>; reset?: boolean }) {
  const ovr = await getPalettes();
  for (const g of BRAND) {
    const o = { ...(ovr[g.key] ?? {}) }, v = f.reset ? {} : f.groups[g.key] ?? {};
    for (const k of ["main", "shade", "highlight"] as const) {
      const x = hex(v[k]) ?? (f.reset ? null : hex(o[k]));
      if (!x || x === g[k]) delete o[k]; else o[k] = x;
    }
    if (Object.keys(o).length) ovr[g.key] = o; else delete ovr[g.key];
  }
  await savePalettes(ovr);
  const mains = new Map(BRAND.map((g) => [g.key, (hex(ovr[g.key]?.main) ?? g.main).toLowerCase()]));
  await withSchool(async (q) => {
    const subs = await q<{ id: string; name: string }>(`select id, name from subjects`);
    for (const s of subs) {
      const g = groupOf(s.name), c = g ? mains.get(g.key)! : hex(f.subjects[s.id])?.toLowerCase();
      if (c) await q(`update subjects set colour = $2 where id = $1 and colour is distinct from $2`, [s.id, c]);
    }
  });
}
