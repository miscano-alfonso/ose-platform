import { NextResponse, type NextRequest } from "next/server";
import { currentStaff } from "@/lib/auth";
import { siteBase } from "@/lib/social";
import { loginUrl, callback, MeetError } from "@/lib/meet";

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
    if (action === "login") return NextResponse.redirect(await loginUrl(base, me.email), 302);
    if (action === "callback") {
      const err = await callback(base, req.nextUrl.searchParams);
      return err ? back(base, "err", err) : back(base, "ok", "Google is connected. Press “Sync now” to read this year’s Meet joins.");
    }
  } catch (e) { return back(base, "err", e instanceof MeetError ? e.message : "Couldn’t connect to Google. Try again."); }
  return NextResponse.json({ error: "Unknown action." }, { status: 404 });
}
