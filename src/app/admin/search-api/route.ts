import type { NextRequest } from "next/server";
import { currentStaff, requireViewer } from "@/lib/auth";
import { adminSearch, teacherSearch } from "@/lib/search";

export const dynamic = "force-dynamic";
// 27 Nov: suggestions for the search box in the side menu. area=teacher: the teacher's own students and classes
// (an admin Viewing as a teacher gets that teacher's); teachers always get the teacher search.
export async function GET(req: NextRequest) {
  const me = await currentStaff();
  if (!me) return Response.json({ error: "Sign in" }, { status: 401 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 80);
  const teacher = me.role !== "school_admin" || req.nextUrl.searchParams.get("area") === "teacher";
  const groups = teacher ? await teacherSearch((await requireViewer()).id, q) : await adminSearch(q);
  return Response.json({ groups }, { headers: { "cache-control": "no-store" } });
}
