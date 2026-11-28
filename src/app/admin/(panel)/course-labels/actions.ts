"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { saveLabelWords, LABEL_KEYS } from "@/lib/course-labels";

export async function courseLabelsAction(f: FormData): Promise<void> {
  const me = await requireStaff(); if (me.role !== "school_admin") redirect("/admin");
  await saveLabelWords(Object.fromEntries(LABEL_KEYS.map((k) => [k.key, String(f.get(k.key) ?? "")])));
  revalidatePath("/", "layout");
  redirect("/admin/course-labels?ok=Saved. The website shows the new wording now.");
}

/** 26 Nov: short subject names for the dashboards ("English Language" → "English"); empty = the full name. */
export async function shortNamesAction(f: FormData): Promise<void> {
  const me = await requireStaff(); if (me.role !== "school_admin") redirect("/admin");
  const { withSchool } = await import("@/lib/db");
  const ids = f.getAll("sid").map(String).filter((s) => /^[0-9a-f-]{36}$/.test(s));
  await withSchool(async (q) => {
    for (const id of ids) {
      const v = String(f.get(`short_${id}`) ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
      await q(`update subjects set short_name = nullif($2, '') where id = $1 and short_name is distinct from nullif($2, '')`, [id, v]);
    }
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, detail) values (current_school(), $1, 'subject_short_names', 'subject', '{}'::jsonb)`, [me.id]).catch(() => {});
  });
  revalidatePath("/", "layout");
  redirect("/admin/course-labels?ok=Short names saved. Teacher, parent and student dashboards use them now.#short");
}

/** 28 Nov (Alfonso: "these labels ideally can be automated based on the facts of the lesson"): when the Automatic label
 *  says "Almost full" or "Few spaces left" (places left at or below each number). A class can still choose its own. */
export async function labelRulesAction(f: FormData): Promise<void> {
  const me = await requireStaff(); if (me.role !== "school_admin") redirect("/admin");
  const few = parseInt(String(f.get("few") ?? ""), 10), almost = parseInt(String(f.get("almost") ?? ""), 10);
  if (!(few >= 0 && few <= 50) || !(almost >= 0 && almost <= 50)) redirect("/admin/course-labels?ok=Use numbers from 0 to 50.#auto");
  const { withSchool } = await import("@/lib/db");
  await withSchool(async (q) => {
    await q(`update schools set few_places_at = $1, almost_full_at = $2 where id = current_school()`, [Math.max(few, almost), Math.min(few, almost)]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, detail) values (current_school(), $1, 'label_rules', 'school', $2)`, [me.id, JSON.stringify({ few, almost })]).catch(() => {});
  });
  revalidatePath("/", "layout");
  redirect("/admin/course-labels?ok=Automatic label rules saved. Classes set to Automatic follow them now.#auto");
}
