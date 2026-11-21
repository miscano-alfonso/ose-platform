import "server-only";
import { withSchool } from "./db";

// Resources (21 Nov): the website's public /resources page of useful resources for learning at home, grouped by subject
// (documentaries, websites, podcasts, books, tips). In the website menu. Managed in Admin → Website → Resources.
export type ResourceKind = "website" | "watch" | "listen" | "book" | "tip";
export const RES_KINDS: { id: ResourceKind; label: string; action: string }[] = [
  { id: "website", label: "Website", action: "Visit the site" }, { id: "watch", label: "Watch", action: "Watch" },
  { id: "listen", label: "Listen", action: "Listen" }, { id: "book", label: "Book", action: "Find the book" }, { id: "tip", label: "Tip", action: "Open" },
];
/** The group that applies to every subject; always shown last. */
export const ALL_SUBJECTS = "All subjects";
export type Resource = { id: string; subject: string; title: string; description: string | null; url: string | null; kind: ResourceKind; sort_order: number; hidden: boolean };

export async function getResources(all = false): Promise<Resource[]> {
  return withSchool((q) => q<Resource>(`select id, subject, title, description, url, kind, sort_order, hidden from site_resources
    ${all ? "" : "where not hidden"} order by sort_order, title`)).catch(() => []);
}

/** Subjects in page order: the school's own subjects in their usual order, then any others A–Z, then "All subjects". */
export function groupBySubject(list: Resource[]): [string, Resource[]][] {
  const ORDER = [/english/i, /math/i, /science|biology|chemistry|physics/i, /geography/i, /history/i, /business/i];
  const rank = (s: string) => s === ALL_SUBJECTS ? 999 : (ORDER.findIndex((re) => re.test(s)) + 1 || 100);
  const subjects = [...new Set(list.map((r) => r.subject))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  return subjects.map((s) => [s, list.filter((r) => r.subject === s)]);
}

/** "Physical Geography" → "physical-geography", for /resources#geography links. */
export const subjectAnchor = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export type ResourceInput = { id?: string; subject: string; title: string; description: string; url: string; kind: string; sortOrder: number; hidden: boolean };
export async function saveResource(actorId: string, d: ResourceInput): Promise<string | null> {
  if (!d.subject.trim()) return "Choose which subject it’s for.";
  if (!RES_KINDS.some((k) => k.id === d.kind)) return "Choose what kind of resource it is.";
  if (!d.title.trim()) return "Give it a title.";
  if (d.url.trim() && !/^https:\/\/[^\s]+$/.test(d.url.trim())) return "The link must start with https://";
  if (!d.url.trim() && d.kind !== "tip") return "Add a link, or choose “Tip” for advice with no link.";
  try {
    return await withSchool(async (q) => {
      const args = [d.subject.trim(), d.title.trim(), d.description.trim(), d.url.trim(), d.kind, d.sortOrder, d.hidden];
      let id = d.id;
      if (id) { if (!(await q(`update site_resources set subject = $2, title = $3, description = nullif($4, ''), url = nullif($5, ''), kind = $6, sort_order = $7::int, hidden = $8 where id = $1 returning id`, [id, ...args])).length) return "That resource wasn’t found."; }
      else id = (await q<{ id: string }>(`insert into site_resources (school_id, subject, title, description, url, kind, sort_order, hidden) values (current_school(), $1, $2, nullif($3, ''), nullif($4, ''), $5, $6::int, $7) returning id`, args))[0].id;
      await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, $2, 'resource', $3, $4)`,
        [actorId, d.id ? "update" : "create", id, JSON.stringify({ subject: d.subject, title: d.title, url: d.url })]);
      return null;
    });
  } catch { return "Couldn’t save that resource."; }
}
export async function deleteResource(actorId: string, id: string) {
  await withSchool(async (q) => {
    await q(`delete from site_resources where id = $1`, [id]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'delete', 'resource', $2, '{}')`, [actorId, id]);
  });
}
