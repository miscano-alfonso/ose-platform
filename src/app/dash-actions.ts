"use server";
import { revalidatePath } from "next/cache";
import { BOARD_MODULES } from "@/lib/dash-modules";

// Save a teacher, parent or student dashboard arrangement. Someone signed in as themselves saves their own copy;
// an admin "viewing as" a teacher, parent or student saves the school's standard for everyone of that kind.
export async function saveBoardAction(page: string, layout: { id: string; size: string }[] | null): Promise<void> {
  const known = BOARD_MODULES[page]; if (!known) return;
  const { saveBoard } = await import("@/lib/dashboard-layout");
  let person: string | null;
  if (page === "teacher-home") {
    const { requireViewer } = await import("@/lib/auth");
    const v = await requireViewer();
    if (v.viewing) person = null; else if (v.role === "teacher") person = v.id; else return;
    await saveBoard(page, person, layout as never, known); revalidatePath("/admin/teacher"); return;
  }
  const { requireParent, requireStudent } = await import("@/lib/family-auth");
  const f = page === "parent-home" ? await requireParent() : await requireStudent();
  person = f.viewer ? null : f.id;
  await saveBoard(page, person, layout as never, known);
  revalidatePath(page === "parent-home" ? "/parent" : "/student");
}
