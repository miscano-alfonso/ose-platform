"use server";
import { revalidatePath } from "next/cache";
import { arranger, saveHeroMarks, saveGirlMarks, stopArranging } from "@/lib/hero-marks-store";
import type { GirlMarks } from "./hero-girl";
import type { Mark } from "./hero-marks";

/** Save the home page symbols (null puts the original arrangement back). Only for the signed-in arranger. */
export async function saveHeroMarksAction(list: Mark[] | null): Promise<{ ok: boolean }> {
  if (!(await arranger())) return { ok: false };
  await saveHeroMarks(list); revalidatePath("/"); return { ok: true };
}
export async function stopArrangingAction() { await stopArranging(); revalidatePath("/"); }
/** Save the drawn symbols round the illustration (null puts the original arrangement back). */
export async function saveGirlMarksAction(v: GirlMarks | null): Promise<{ ok: boolean }> {
  if (!(await arranger())) return { ok: false };
  await saveGirlMarks(v); revalidatePath("/"); return { ok: true };
}
