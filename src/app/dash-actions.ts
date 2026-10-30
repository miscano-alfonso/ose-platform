"use server";
import { revalidatePath } from "next/cache";
import { BOARD_MODULES } from "@/lib/dash-modules";

// Save a teacher, parent or student dashboard arrangement: only an admin "viewing as" a teacher, parent or student,
// and it becomes the school's layout for everyone of that kind. Teachers, parents and students can't customise.
export async function saveBoardAction(page: string, layout: { id: string; size: string }[] | null): Promise<void> {
  const known = BOARD_MODULES[page]; if (!known) return;
  const { saveBoard } = await import("@/lib/dashboard-layout");
  let person: string | null;
  if (page === "teacher-home") {
    const { requireViewer } = await import("@/lib/auth");
    const v = await requireViewer();
    if (!v.viewing) return;   // only an admin viewing as a teacher arranges it (teachers can't customise)
    person = null;
    await saveBoard(page, person, layout as never, known); revalidatePath("/admin/teacher"); return;
  }
  if (page === "solo-home") {   // Settings → Solo dashboard, in OH-SO ED only: the board every Solo school shows
    const { requireStaff } = await import("@/lib/auth"), { isPlatformSchool } = await import("@/lib/db");
    const me = await requireStaff(); if (me.role !== "school_admin" || !(await isPlatformSchool())) return;
    await saveBoard(page, null, layout as never, known); revalidatePath("/admin/solo-dashboard"); return;
  }
  const { requireParent, requireStudent } = await import("@/lib/family-auth");
  const f = page === "parent-home" ? await requireParent() : await requireStudent();
  if (!f.viewer) return;   // only an admin viewing as a parent or student
  person = null;
  await saveBoard(page, person, layout as never, known);
  revalidatePath(page === "parent-home" ? "/parent" : "/student");
}
