"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { BRAND, saveSubjectColours } from "@/lib/subject-colours";

export async function subjectColoursAction(f: FormData): Promise<void> {
  const me = await requireStaff(); if (me.role !== "school_admin") redirect("/admin");
  const reset = f.get("reset") === "1";
  const groups = Object.fromEntries(BRAND.map((g) => [g.key, { main: String(f.get(`${g.key}.main`) ?? ""), shade: String(f.get(`${g.key}.shade`) ?? ""), highlight: String(f.get(`${g.key}.highlight`) ?? "") }]));
  const subjects: Record<string, string> = {};
  for (const [k, v] of f.entries()) if (k.startsWith("sub.")) subjects[k.slice(4)] = String(v);
  await saveSubjectColours({ groups, subjects, reset });
  revalidatePath("/", "layout");
  redirect("/admin/subject-colours?ok=" + encodeURIComponent(reset ? "Back to the brand sheet’s colours." : "Saved. Sketch Studio, Social, the dashboards and the website use the new colours now."));
}
