"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/auth";
import { resolveWork } from "@/lib/marking";

// 27 Nov (Alfonso): the teacher resolves a piece of work they've chosen not to mark (or puts it back on the list)
export async function resolveWorkAction(f: FormData): Promise<void> {
  const me = await requireViewer();
  const on = f.get("on") === "1", why = String(f.get("why") ?? ""), other = String(f.get("other") ?? "");
  const err = await resolveWork(me.id, String(f.get("cw") ?? "").slice(0, 40), on, why === "other" ? other : why);
  revalidatePath("/admin/teacher/marking"); revalidatePath("/admin/teacher");
  redirect(`/admin/teacher/marking?${err ? `err=${encodeURIComponent(err)}` : `ok=${encodeURIComponent(on ? "Resolved: it’s off your marking list (see Archived at the bottom)." : "Put back on your marking list.")}`}`);
}
