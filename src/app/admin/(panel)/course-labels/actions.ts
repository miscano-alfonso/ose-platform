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
