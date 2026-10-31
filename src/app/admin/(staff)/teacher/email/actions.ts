"use server";
import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { sendTeacherEmail } from "@/lib/teacher-area";

export async function teacherEmailAction(f: FormData): Promise<void> {
  const me = await requireViewer();
  const s = (k: string, n: number) => String(f.get(k) ?? "").slice(0, n);
  const err = me.viewing ? "While viewing as a teacher you can read their email but not send as them."
    : await sendTeacherEmail({ id: me.id, name: me.name, email: me.email }, s("subject", 200), s("body", 20000), s("thread", 120) || undefined, s("to", 40) || undefined,
      { links: s("links", 6000).split(/\s+/).filter(Boolean), files: f.getAll("files").filter((x): x is File => typeof x === "object" && "arrayBuffer" in x) });
  // back to Messages (31 Oct: teachers message the school there): the conversation for a reply, the list for a new message
  const th = s("thread", 120), to = s("to", 40);
  const back = th ? `/admin/teacher/messages?school=${encodeURIComponent(th)}` : `/admin/teacher/messages${err && to ? `?to=${to}` : ""}`;
  redirect(`${back}${back.includes("?") ? "&" : "?"}${err ? `err=${encodeURIComponent(err)}` : `ok=${encodeURIComponent("Sent. The reply shows here and comes by email too.")}`}`);
}
