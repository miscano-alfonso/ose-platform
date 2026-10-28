import { NextResponse, type NextRequest } from "next/server";
import { currentFamily } from "@/lib/family-auth";
import { joinClass, verifyJoin } from "@/lib/checkins";

export const dynamic = "force-dynamic";

// Every Join button goes through here: /join/<class> records the student's check-in (when the school uses check-ins)
// and sends them straight on to the lesson link, whatever the video tool. Parents, staff and anyone else just go on.
export async function GET(req: NextRequest, { params }: { params: Promise<{ group: string }> }) {
  const { group } = await params;
  const s = req.nextUrl.searchParams.get("s"), t = req.nextUrl.searchParams.get("t");
  let student: string | null = null;
  const f = await currentFamily().catch(() => null);
  if (f?.kind === "student" && !f.viewer) student = f.id; // someone "viewing as" a student never checks them in
  else if (s && t && verifyJoin(group, s, t)) student = s;
  const { link } = await joinClass(group, student);
  if (link) return NextResponse.redirect(link, 302);
  const back = new URL(f?.kind === "student" ? `/student/class/${group}` : "/", req.nextUrl.origin);
  back.searchParams.set("err", "This class doesn’t have a lesson link yet. Please check Google Classroom or ask your teacher.");
  return NextResponse.redirect(back, 302);
}
