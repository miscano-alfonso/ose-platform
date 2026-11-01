import "server-only";
import { withSchool } from "./db";

// Guides (2 Nov): presentations and how-to guides for teachers, parents and students, on the website's /guides page
// (open to anyone with the link; not in the menu). Managed in Admin → Website → Guides.
export type Audience = "teachers" | "parents" | "students";
export const AUDIENCES: { id: Audience; label: string; intro: string }[] = [
  { id: "teachers", label: "Teachers", intro: "Your dashboard, and how it works with Google Classroom, Meet, Drive and Calendar." },
  { id: "parents", label: "Parents", intro: "Your family dashboard: classes, payments, reports and messages." },
  { id: "students", label: "Students", intro: "Joining lessons, your classes, rewards and staying in touch." },
];
export type GuideKind = "slides" | "video" | "document" | "link";
export const KINDS: { id: GuideKind; label: string; action: string }[] = [
  { id: "slides", label: "Presentation", action: "Open the presentation" }, { id: "video", label: "Video", action: "Watch the video" },
  { id: "document", label: "Guide", action: "Read the guide" }, { id: "link", label: "Link", action: "Open" },
];
export type Guide = { id: string; audience: Audience; title: string; description: string | null; url: string; kind: GuideKind; sort_order: number; hidden: boolean };

export async function getGuides(all = false): Promise<Guide[]> {
  return withSchool((q) => q<Guide>(`select id, audience, title, description, url, kind, sort_order, hidden from site_guides
    ${all ? "" : "where not hidden"} order by sort_order, title`)).catch(() => []);
}

export type GuideInput = { id?: string; audience: string; title: string; description: string; url: string; kind: string; sortOrder: number; hidden: boolean };
export async function saveGuide(actorId: string, d: GuideInput): Promise<string | null> {
  if (!AUDIENCES.some((a) => a.id === d.audience)) return "Choose who it’s for.";
  if (!KINDS.some((k) => k.id === d.kind)) return "Choose what kind of link it is.";
  if (!d.title.trim()) return "Give it a title.";
  if (!/^https:\/\/[^\s]+$/.test(d.url)) return "The link must start with https://";
  try {
    return await withSchool(async (q) => {
      const args = [d.audience, d.title.trim(), d.description.trim(), d.url.trim(), d.kind, d.sortOrder, d.hidden];
      let id = d.id;
      if (id) { if (!(await q(`update site_guides set audience = $2, title = $3, description = nullif($4, ''), url = $5, kind = $6, sort_order = $7::int, hidden = $8 where id = $1 returning id`, [id, ...args])).length) return "That guide wasn’t found."; }
      else id = (await q<{ id: string }>(`insert into site_guides (school_id, audience, title, description, url, kind, sort_order, hidden) values (current_school(), $1, $2, nullif($3, ''), $4, $5, $6::int, $7) returning id`, args))[0].id;
      await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, $2, 'guide', $3, $4)`,
        [actorId, d.id ? "update" : "create", id, JSON.stringify({ audience: d.audience, title: d.title, url: d.url })]);
      return null;
    });
  } catch { return "Couldn’t save that guide."; }
}
export async function deleteGuide(actorId: string, id: string) {
  await withSchool(async (q) => {
    await q(`delete from site_guides where id = $1`, [id]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'delete', 'guide', $2, '{}')`, [actorId, id]);
  });
}
