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
