import "server-only";
import { withSchool } from "./db";

// 'New to Home Ed?' resource hub (public page /home-ed, edited in Admin → Home Ed hub).
export type HubLink = { id: string; section_id: string; grp: string; kind: "link" | "video" | "date"; title: string; url: string; description: string; sort_order: number; published: boolean };
export type HubSection = { id: string; slug: string; title: string; intro: string; sort_order: number; published: boolean; links: HubLink[] };

export async function getHub(all = false): Promise<HubSection[]> {
  try {
    return await withSchool(async (q) => {
      const secs = await q<Omit<HubSection, "links">>(`select id, slug, title, intro, sort_order, published from hub_sections where $1 or published order by sort_order, title`, [all]);
      const links = await q<HubLink>(`select id, section_id, grp, kind, title, url, description, sort_order, published from hub_links where $1 or published order by sort_order, title`, [all]);
      return secs.map((s) => ({ ...s, links: links.filter((l) => l.section_id === s.id) }));
    });
  } catch { return []; }
}

/** Links grouped by their sub-heading, keeping the order of first appearance. */
export function grouped(links: HubLink[]): [string, HubLink[]][] {
  const m = new Map<string, HubLink[]>();
  for (const l of links) { if (!m.has(l.grp)) m.set(l.grp, []); m.get(l.grp)!.push(l); }
  return [...m];
}

export function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/);
  return m ? m[1] : null;
}

const audit = (q: (s: string, p?: unknown[]) => Promise<unknown>, actor: string, action: string, detail: unknown) =>
  q(`insert into audit_log (school_id, actor_user_id, action, entity, detail) values (current_school(), $1, $2, 'hub', $3)`, [actor, action, JSON.stringify(detail)]);

export async function saveHubSection(actor: string, id: string, d: { title: string; intro: string; sort: number; published: boolean }) {
  await withSchool(async (q) => {
    await q(`update hub_sections set title = $2, intro = $3, sort_order = $4, published = $5 where id = $1`, [id, d.title, d.intro, d.sort, d.published]);
    await audit(q, actor, "update", { section: id });
  });
}

export async function addHubSection(actor: string, title: string) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "section";
  return withSchool(async (q) => {
    const r = await q<{ id: string }>(`insert into hub_sections (school_id, slug, title, sort_order)
      values (current_school(), $1 || case when exists (select 1 from hub_sections where slug = $1) then '-' || substr(md5(random()::text), 1, 4) else '' end, $2,
        coalesce((select max(sort_order) from hub_sections), 0) + 10) returning id`, [slug, title]);
    await audit(q, actor, "create", { section: r[0].id });
    return r[0].id;
  });
}

export async function deleteHubSection(actor: string, id: string) {
  await withSchool(async (q) => { await q(`delete from hub_sections where id = $1`, [id]); await audit(q, actor, "delete", { section: id }); });
}

export type LinkInput = { grp: string; kind: HubLink["kind"]; title: string; url: string; description: string; sort: number; published: boolean };
export async function saveHubLink(actor: string, id: string | null, sectionId: string, d: LinkInput) {
  await withSchool(async (q) => {
    const sort = Number.isFinite(d.sort) ? d.sort : null;
    if (id) await q(`update hub_links set grp = $2, kind = $3, title = $4, url = $5, description = $6, sort_order = coalesce($7, sort_order), published = $8 where id = $1`, [id, d.grp, d.kind, d.title, d.url, d.description, sort, d.published]);
    else await q(`insert into hub_links (school_id, section_id, grp, kind, title, url, description, sort_order, published)
      values (current_school(), $1, $2, $3, $4, $5, $6, coalesce($7, (select coalesce(max(sort_order), 0) + 10 from hub_links where section_id = $1)), $8)`,
      [sectionId, d.grp, d.kind, d.title, d.url, d.description, sort, d.published]);
    await audit(q, actor, id ? "update" : "create", { link: id, section: sectionId, title: d.title });
  });
}

export async function deleteHubLink(actor: string, id: string) {
  await withSchool(async (q) => { await q(`delete from hub_links where id = $1`, [id]); await audit(q, actor, "delete", { link: id }); });
}
