"use server";
import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { sendTeacherEmail } from "@/lib/teacher-area";

export async function teacherEmailAction(f: FormData): Promise<void> {
  const me = await requireViewer();
  const s = (k: string, n: number) => String(f.get(k) ?? "").slice(0, n);
  const err = me.viewing ? "While viewing as a teacher you can read their email but not send as them."
    : await sendTeacherEmail({ id: me.id, name: me.name, email: me.email }, s("subject", 200), s("body", 20000), s("thread", 120) || undefined);
  redirect(err ? `/admin/teacher/email?new=1&err=${encodeURIComponent(err)}` : `/admin/teacher/email?ok=${encodeURIComponent("Sent to the school. Their reply comes by email and shows here.")}`);
}
