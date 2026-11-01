"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { saveTeacherContacts, saveOfficeLabel } from "@/lib/teacher-area";

export async function teacherContactsAction(f: FormData): Promise<void> {
  const me = await requireStaff(); if (me.role !== "school_admin") redirect("/admin");
  const ids = f.getAll("on").map(String);
  await saveTeacherContacts(ids.map((id) => ({ user_id: id, label: String(f.get(`label_${id}`) ?? "") || "Admin" })));
  await saveOfficeLabel(String(f.get("office_label") ?? ""));
  redirect("/admin/email-settings?ok=Saved.");
}

/** Settings → Email: let teachers message families and post in class chats, or not (1 Nov). */
export async function familyMsgsAction(f: FormData) {
  const me = await requireStaff(); if (me.role !== "school_admin") redirect("/admin");
  const { setFamilyMsgs } = await import("@/lib/teacher-area");
  await setFamilyMsgs(f.get("on") === "1");
  revalidatePath("/admin/email-settings");
  redirect("/admin/email-settings#family-msgs");
}
