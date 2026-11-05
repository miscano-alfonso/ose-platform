import { NextResponse, type NextRequest } from "next/server";
import { currentFamily } from "@/lib/family-auth";
import { joinClass, verifyJoin } from "@/lib/checkins";
import { accessSettings, logJoinClick, meetAs, onClass } from "@/lib/lesson-access";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Every Join button goes through here: /join/<class> records the student's check-in (when the school uses check-ins)
// and sends them on to the lesson link, whatever the video tool. Every press is noted (who, when), so an unknown
// Google account in a lesson can be traced to the student who pressed Join just before.
// 5 Nov: with "Join through the dashboard" on (Students → Lesson access), only a student signed in to their own account,
// and booked on this class, is sent on (with Meet opened in their own Google account); everyone else is asked to sign
// in, or turned away. Signed links in older emails stop working then, so a forwarded reminder can't be used.
export async function GET(req: NextRequest, { params }: { params: Promise<{ group: string }> }) {
  const { group } = await params;
  const go = (path: string) => NextResponse.redirect(new URL(path, req.nextUrl.origin), 302);
  if (!UUID.test(group)) return go("/");
  const s = req.nextUrl.searchParams.get("s"), t = req.nextUrl.searchParams.get("t");
  const f = await currentFamily().catch(() => null);
  const { viaDashboard } = await accessSettings();
  let student: string | null = null, who: "student" | "parent" | "link" | "nobody" = "nobody";
  if (f?.kind === "student" && !f.viewer) { student = f.id; who = "student"; } // someone "viewing as" a student never checks them in
  else if (f?.kind === "parent") who = "parent";
  else if (s && t && verifyJoin(group, s, t)) { student = s; who = "link"; }

  if (viaDashboard) {
    if (who === "parent" && !f?.viewer) { await logJoinClick(group, null, "parent", false); return go(`/lesson-join?why=parent&g=${group}`); }
    if (who !== "student") { await logJoinClick(group, who === "link" ? student : null, who, false); return go(`/account?next=${encodeURIComponent(`/join/${group}`)}`); }
    if (!(await onClass(group, student!))) { await logJoinClick(group, student, "student", false); return go(`/lesson-join?why=notyours&g=${group}`); }
  }
  const { link } = await joinClass(group, student);
  await logJoinClick(group, student, who, !!link);
  if (link) return NextResponse.redirect(viaDashboard && who === "student" ? meetAs(link, f?.email ?? null) : link, 302);
  return go(`/lesson-join?why=nolink&g=${group}`);
}
