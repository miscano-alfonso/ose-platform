import "server-only";
import { withSchool } from "./db";
import { folderId } from "./teacher-area";

// 27 Nov (Alfonso): who owns the lesson-slides library: the school or each teacher. A school setting.
// school (OH-SO ED's case, the default): the school keeps a slides folder for each class in its own Drive and sets it
//   on Settings → Lesson slides. Teachers see their class's folder (and work in it) but can't change which folder it is.
// teacher: each teacher shares their own folder with the school's Google account and sets it on their Google Drive page.
export type SlidesOwner = "school" | "teacher";

export async function slidesOwner(): Promise<SlidesOwner> {
  const v = (await withSchool((q) => q<{ v: unknown }>(`select value as v from meet_kv where key = 'slides_owner'`)).catch(() => []))[0]?.v;
  return v === "teacher" ? "teacher" : "school";
}
export async function setSlidesOwner(owner: SlidesOwner): Promise<void> {
  await withSchool((q) => q(`insert into meet_kv (school_id, key, value) values (current_school(), 'slides_owner', $1)
    on conflict (school_id, key) do update set value = excluded.value, updated_at = now()`, [JSON.stringify(owner)]));
}

/** Every class this school year with its slides folder, for Settings → Lesson slides. */
export async function allClassFolders() {
  return withSchool((q) => q<{ id: string; name: string; code: string; teacher: string | null; folder: string | null; status: string }>(`
    select g.id, l.name || ' ' || coalesce(sj.short_name, sj.name) as name, g.code, u.name as teacher, g.slides_folder as folder, g.status::text as status
    from course_groups g join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id join academic_years y on y.id = g.academic_year_id
      left join teachers t on t.id = g.teacher_id left join users u on u.id = t.user_id
    where y.starts_on <= current_date + 120 and y.ends_on >= current_date and g.status <> 'hidden'
    order by l.sort_order, coalesce(sj.short_name, sj.name), g.code`));
}
/** The office sets (or clears) a class's slides folder. */
export async function adminSetClassFolder(groupId: string, value: string): Promise<string | null> {
  const id = value.trim() ? folderId(value) : null;
  if (value.trim() && !id) return "That doesn’t look like a Google Drive folder link. Open the folder in Drive and copy the address.";
  if (!/^[0-9a-f-]{36}$/.test(groupId)) return "Class not found.";
  const r = await withSchool((q) => q(`update course_groups set slides_folder = $2 where id = $1 returning id`, [groupId, id]));
  if (!r.length) return "Class not found.";
  await withSchool((q) => q(`delete from meet_kv where key like 'slidesdir:%'`)).catch(() => null);
  return null;
}
