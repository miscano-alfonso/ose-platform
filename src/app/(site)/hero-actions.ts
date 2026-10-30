"use server";
import { revalidatePath } from "next/cache";
import { arranger, saveHeroMarks, stopArranging } from "@/lib/hero-marks-store";
import type { Mark } from "./hero-marks";

/** Save the home page symbols (null puts the original arrangement back). Only for the signed-in arranger. */
export async function saveHeroMarksAction(list: Mark[] | null): Promise<{ ok: boolean }> {
  if (!(await arranger())) return { ok: false };
  await saveHeroMarks(list); revalidatePath("/"); return { ok: true };
}
export async function stopArrangingAction() { await stopArranging(); revalidatePath("/"); }
