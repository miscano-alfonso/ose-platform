"use server";
import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/auth";
import { setLessonSlides } from "@/lib/teacher-area";

/** Save the link to a lesson's slides (the teacher, or an admin viewing as them). */
export async function lessonSlidesAction(eventId: string, url: string): Promise<string | null> {
  const me = await requireViewer();
  const err = await setLessonSlides(me.id, String(eventId).slice(0, 40), String(url).slice(0, 600));
  if (!err) revalidatePath("/admin/teacher");
  return err;
}
