"use server";
import { requireViewer } from "@/lib/auth";
import { withSchool } from "@/lib/db";
import { draftComment } from "@/lib/report-draft";

/** "Draft with AI" on the report-writing page: returns a first attempt at one student's comment (nothing is saved). */
export async function draftCommentAction(entryId: string, scores: { effort?: number | null; progress?: number | null; working?: number | null; predicted?: number | null }) {
  const me = await requireViewer();
  const demo = (await withSchool((q) => q<{ d: boolean }>(`select is_demo as d from schools where id = current_school()`)))[0]?.d ?? false;
  const n = (v: unknown) => typeof v === "number" && v >= 1 && v <= 9 ? v : null;
  return draftComment({ id: me.id, role: me.role }, String(entryId).slice(0, 40), { effort: n(scores?.effort), progress: n(scores?.progress), working: n(scores?.working), predicted: n(scores?.predicted) }, demo);
}
