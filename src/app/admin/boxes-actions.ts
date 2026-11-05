"use server";
import { requireStaff } from "@/lib/auth";
import type { Box } from "@/lib/page-boxes";

export type Loaded = { ids: string[]; saved: boolean; boxes: Box[]; catalogue: { id: string; title: string }[] } | null;
/** The summary boxes for an admin page (null: this page doesn't have them). */
export async function loadBoxesAction(path: string): Promise<Loaded> {
  const me = await requireStaff();
  const P = await import("@/lib/page-boxes");
  const c = await P.chosenBoxes(me.id, String(path).slice(0, 120));
  if (!c) return null;
  return { ...c, boxes: await P.boxValues(c.ids), catalogue: P.CATALOGUE };
}
/** Save this person's boxes for a page; null goes back to the page's standard set. */
export async function saveBoxesAction(path: string, ids: string[] | null): Promise<Loaded> {
  const me = await requireStaff();
  const P = await import("@/lib/page-boxes");
  await P.saveBoxes(me.id, String(path).slice(0, 120), Array.isArray(ids) ? ids.map(String).slice(0, 12) : null);
  return loadBoxesAction(path);
}
