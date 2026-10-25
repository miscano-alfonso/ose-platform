import "server-only";
import { withSchool } from "./db";

// Admin: add teachers and edit the profile shown on the website (/teachers/<slug>).
export type TeacherAdmin = { id: string; user_id: string; name: string; email: string; slug: string | null; designation: string | null; bio: string | null;
  qualifications: string[]; photo: string | null; archived: boolean; sort_order: number; subjects: string[]; classes: number; can_sign_in: boolean };

const SQL = `select t.id, u.id as user_id, u.name, u.email::text, t.slug, t.designation, t.bio, t.qualifications, t.archived_at is not null as archived, t.sort_order,
    case when t.photo is not null then '/teacher-photo/' || t.slug || '?v=' || extract(epoch from t.photo_updated_at)::bigint else t.photo_asset end as photo,
    coalesce((select array_agg(distinct ts.subject_id::text) from teacher_subjects ts where ts.teacher_id = t.id), '{}') as subjects,
    (select count(*)::int from course_groups g join academic_years y on y.id = g.academic_year_id where g.teacher_id = t.id and y.ends_on >= current_date) as classes,
    u.password_hash is not null and u.disabled_at is null as can_sign_in
  from teachers t join users u on u.id = t.user_id`;

export async function listTeachers() {
  return withSchool((q) => q<TeacherAdmin>(`${SQL} order by t.archived_at is not null, t.sort_order, u.name`));
}
export async function getTeacherAdmin(id: string) {
  return withSchool(async (q) => ({
    teacher: (await q<TeacherAdmin>(`${SQL} where t.id = $1`, [id]))[0] ?? null,
    subjects: await q<{ id: string; name: string }>(`select id, name from subjects order by name`),
  }));
}

export const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

export async function addTeacher(actorId: string, name: string, email: string): Promise<{ id?: string; error?: string }> {
  try {
    return await withSchool(async (q) => {
      const existing = (await q<{ id: string; role: string }>(`select id, role::text from users where email = $1::citext`, [email]))[0];
      if (existing && existing.role !== "school_admin") return { error: "Someone with that email already has an account." };
      if (existing && (await q(`select 1 from teachers where user_id = $1`, [existing.id])).length) return { error: "That person is already a teacher." };
      // an admin (e.g. the principal) can also be a teacher: reuse their account
      const uid = existing?.id ?? (await q<{ id: string }>(`insert into users (school_id, email, name, role) values (current_school(), $1, $2, 'teacher') returning id`, [email, name]))[0].id;
      let slug = slugify(name) || "teacher", n = 1;
      while ((await q(`select 1 from teachers where slug = $1`, [slug])).length) slug = `${slugify(name)}-${++n}`;
      const t = (await q<{ id: string }>(`insert into teachers (school_id, user_id, slug, sort_order) values (current_school(), $1, $2, (select coalesce(max(sort_order),0)+1 from teachers)) returning id`, [uid, slug]))[0];
      await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'create', 'teacher', $2, $3)`, [actorId, t.id, JSON.stringify({ name, email })]);
      return { id: t.id };
    });
  } catch { return { error: "Couldn’t add that teacher." }; }
}

export type ProfileInput = { name: string; designation: string; bio: string; qualifications: string[]; slug: string; sortOrder: number; subjects: string[];
  photo?: { data: Buffer; type: string } | null; removePhoto: boolean };

export async function saveTeacher(actorId: string, id: string, d: ProfileInput): Promise<string | null> {
  try {
    return await withSchool(async (q) => {
      const t = (await q<{ user_id: string }>(`select user_id from teachers where id = $1`, [id]))[0];
      if (!t) return "That teacher wasn’t found.";
      const slug = slugify(d.slug || d.name);
      if (!slug) return "Give the profile a web address.";
      if ((await q(`select 1 from teachers where slug = $1 and id <> $2`, [slug, id])).length) return "Another teacher already uses that web address.";
      await q(`update users set name = $2 where id = $1`, [t.user_id, d.name]);
      await q(`update teachers set designation = nullif($2, ''), bio = nullif($3, ''), qualifications = $4::text[], slug = $5, sort_order = $6::int where id = $1`,
        [id, d.designation, d.bio, d.qualifications, slug, d.sortOrder]);
      if (d.photo) await q(`update teachers set photo = $2, photo_type = $3, photo_updated_at = now() where id = $1`, [id, d.photo.data, d.photo.type]);
      else if (d.removePhoto) await q(`update teachers set photo = null, photo_type = null, photo_asset = null, photo_updated_at = now() where id = $1`, [id]);
      await q(`delete from teacher_subjects where teacher_id = $1`, [id]);
      if (d.subjects.length) await q(`insert into teacher_subjects (teacher_id, level_id, subject_id) select $1, l.id, s.id from levels l cross join subjects s where s.id = any($2::uuid[]) on conflict do nothing`, [id, d.subjects]);
      await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'update', 'teacher', $2, $3)`,
        [actorId, id, JSON.stringify({ name: d.name, slug, photo: !!d.photo, subjects: d.subjects.length })]);
      return null;
    });
  } catch { return "Couldn’t save the profile."; }
}

export async function setTeacherArchived(actorId: string, id: string, archived: boolean) {
  await withSchool(async (q) => {
    await q(`update teachers set archived_at = case when $2 then now() else null end where id = $1`, [id, archived]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id) values (current_school(), $1, $2, 'teacher', $3)`, [actorId, archived ? "archive" : "restore", id]);
  });
}
