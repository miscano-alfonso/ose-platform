import { NextResponse, type NextRequest } from "next/server";
import { currentStaff } from "@/lib/auth";
import { siteBase } from "@/lib/social";
import { loginUrl, callback, MeetError, googleKv } from "@/lib/meet";

// Admin → Attendance → Connect Google: sends the admin to Google's consent screen and takes them back.
export const dynamic = "force-dynamic";
const origin = (req: NextRequest) => `${req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(":", "")}://${req.headers.get("x-forwarded-host") || req.headers.get("host")}`;
const back = (base: string, key: "ok" | "err", msg: string) => NextResponse.redirect(`${base}/admin/attendance?tab=google&${key}=${encodeURIComponent(msg)}`, 302);

export async function GET(req: NextRequest) {
  const base = await siteBase(origin(req));
  const me = await currentStaff();
  if (!me || me.role !== "school_admin") return NextResponse.redirect(`${base}/admin/login`, 302);
  const action = req.nextUrl.searchParams.get("action");
  try {
    const what = req.nextUrl.searchParams.get("what");
    if (action === "login") return NextResponse.redirect(await loginUrl(base, me.email, what === "gmail" || what === "rec" ? what : undefined), 302);
    if (action === "callback") {
      const was = await googleKv<{ pending?: { kind?: string } }>("google");
      const inbox = was?.pending?.kind === "gmail", rec = was?.pending?.kind === "rec";
      const err = await callback(base, req.nextUrl.searchParams);
      if (rec) return NextResponse.redirect(`${base}/admin/recordings?tab=settings&${err ? "err" : "ok"}=${encodeURIComponent(err ?? "The recordings account is connected.")}`, 302);
      if (inbox) return NextResponse.redirect(`${base}/admin/email?tab=inbox&${err ? "err" : "ok"}=${encodeURIComponent(err ?? "The school inbox is connected. Replies from families will show here.")}`, 302);
      return err ? back(base, "err", err) : back(base, "ok", "Google is connected. Press “Sync now” to read this year’s Meet joins, and “Sync Classroom” for class work and marks.");
    }
  } catch (e) { return back(base, "err", e instanceof MeetError ? e.message : "Couldn’t connect to Google. Try again."); }
  return NextResponse.json({ error: "Unknown action." }, { status: 404 });
}
