"use server";
import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { markUnread, type InboxKind } from "@/lib/teacher-inbox";

/** 26 Nov: "Mark as unread" on a conversation (back to the list, so opening it doesn't read it again). */
export async function markUnreadAction(f: FormData) {
  const me = await requireViewer();
  const kind = String(f.get("kind") ?? "") as InboxKind, id = String(f.get("id") ?? "").slice(0, 200), tab = String(f.get("f") ?? "");
  const list = `/admin/teacher/${f.get("mode") === "email" ? "email" : "messages"}${/^(unread|school|families)$/.test(tab) ? `?f=${tab}` : ""}`;
  if (me.viewing) redirect(list);   // an admin Viewing as doesn't change what the teacher has read
  if (["office", "school", "family"].includes(kind) && id) await markUnread(me.id, kind, id);
  redirect(list);
}
