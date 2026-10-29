"use server";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { saveTeacherContacts, saveOfficeLabel } from "@/lib/teacher-area";

export async function teacherContactsAction(f: FormData): Promise<void> {
  const me = await requireStaff(); if (me.role !== "school_admin") redirect("/admin");
  const ids = f.getAll("on").map(String);
  await saveTeacherContacts(ids.map((id) => ({ user_id: id, label: String(f.get(`label_${id}`) ?? "") || "Admin" })));
  await saveOfficeLabel(String(f.get("office_label") ?? ""));
  redirect("/admin/teacher-contacts?ok=Saved.");
}
