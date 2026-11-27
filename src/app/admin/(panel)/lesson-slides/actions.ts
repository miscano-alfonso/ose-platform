"use server";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { setSlidesOwner, adminSetClassFolder } from "@/lib/slides-owner";

export async function slidesOwnerAction(f: FormData): Promise<void> {
  const me = await requireStaff(); if (me.role !== "school_admin") redirect("/admin");
  const v = f.get("owner") === "teacher" ? "teacher" : "school";
  await setSlidesOwner(v);
  redirect("/admin/lesson-slides?ok=" + encodeURIComponent(v === "school" ? "Saved. The school owns the slides folders: set one for each class below." : "Saved. Each teacher now chooses their own folders on their Google Drive page."));
}
export async function adminFolderAction(f: FormData): Promise<void> {
  const me = await requireStaff(); if (me.role !== "school_admin") redirect("/admin");
  const g = String(f.get("group") ?? "").slice(0, 40);
  const err = await adminSetClassFolder(g, String(f.get("folder") ?? "").slice(0, 400));
  redirect(`/admin/lesson-slides?${err ? `err=${encodeURIComponent(err)}` : "ok=Saved."}#c-${g}`);
}
