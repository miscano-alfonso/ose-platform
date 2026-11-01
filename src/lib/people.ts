import "server-only";
import { withSchool } from "./db";

// The website's People page (1 Nov): the teachers, plus other people at the school (e.g. Systems & Support), who have a
// name, a role and a photo but no profile page. Managed in Admin → Teachers → "Also on the People page".
export type SitePerson = { id: string; name: string; role: string | null; photo: string | null; sort_order: number; archived: boolean };

const SQL = `select p.id, p.name, p.role, p.sort_order, p.archived_at is not null as archived,
    case when p.photo is not null then '/people-photo/' || p.id || '?v=' || extract(epoch from p.photo_updated_at)::bigint else p.photo_asset end as photo
  from site_people p`;

/** Shown on the website. */
export async function sitePeople(): Promise<SitePerson[]> {
  return withSchool((q) => q<SitePerson>(`${SQL} where p.archived_at is null order by p.sort_order, p.name`)).catch(() => []);
}
/** For the admin, hidden ones included. */
export async function allSitePeople(): Promise<SitePerson[]> {
  return withSchool((q) => q<SitePerson>(`${SQL} order by p.archived_at is not null, p.sort_order, p.name`));
}

export type PersonInput = { id?: string; name: string; role: string; sortOrder: number; hidden: boolean;
  photo?: { data: Buffer; type: string } | null; removePhoto: boolean };

export async function savePerson(actorId: string, d: PersonInput): Promise<string | null> {
  if (!d.name.trim()) return "Give their name.";
  try {
    return await withSchool(async (q) => {
      let id = d.id;
      if (id) {
        const r = await q(`update site_people set name = $2, role = nullif($3, ''), sort_order = $4::int, archived_at = case when $5 then coalesce(archived_at, now()) end where id = $1 returning id`,
          [id, d.name.trim(), d.role.trim(), d.sortOrder, d.hidden]);
        if (!r.length) return "That person wasn’t found.";
      } else {
        id = (await q<{ id: string }>(`insert into site_people (school_id, name, role, sort_order) values (current_school(), $1, nullif($2, ''), $3::int) returning id`,
          [d.name.trim(), d.role.trim(), d.sortOrder]))[0].id;
      }
      if (d.photo) await q(`update site_people set photo = $2, photo_type = $3, photo_updated_at = now() where id = $1`, [id, d.photo.data, d.photo.type]);
      else if (d.removePhoto) await q(`update site_people set photo = null, photo_type = null, photo_asset = null, photo_updated_at = now() where id = $1`, [id]);
      await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, $2, 'site_person', $3, $4)`,
        [actorId, d.id ? "update" : "create", id, JSON.stringify({ name: d.name, role: d.role, photo: !!d.photo, hidden: d.hidden })]);
      return null;
    });
  } catch { return "Couldn’t save that person."; }
}

export async function removePerson(actorId: string, id: string): Promise<void> {
  await withSchool(async (q) => {
    await q(`delete from site_people where id = $1`, [id]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'delete', 'site_person', $2, '{}')`, [actorId, id]);
  });
}
