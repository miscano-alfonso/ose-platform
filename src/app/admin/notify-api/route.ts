import { currentStaff, requireViewer } from "@/lib/auth";
import { notifyGet, notifyPost } from "@/lib/notify-http";
import type { Who } from "@/lib/notify";

export const dynamic = "force-dynamic";
async function who(): Promise<{ w: Who | null; save: boolean }> {
  if (!(await currentStaff())) return { w: null, save: false };
  const v = await requireViewer();
  return { w: { role: v.role === "school_admin" && !v.viewing ? "admin" : "teacher", id: v.id }, save: !v.viewing };
}
export async function GET(req: Request) { return notifyGet(req, (await who()).w); }
export async function POST(req: Request) { const x = await who(); return notifyPost(req, x.w, x.save); }
