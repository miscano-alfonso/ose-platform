"use server";
import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { setClassFolder } from "@/lib/teacher-area";

export async function classFolderAction(f: FormData): Promise<void> {
  const me = await requireViewer();
  const err = await setClassFolder(me.id, String(f.get("group") ?? "").slice(0, 40), String(f.get("folder") ?? "").slice(0, 400));
  redirect(`/admin/teacher/drive?${err ? `err=${encodeURIComponent(err)}` : "ok=Saved."}`);
}
