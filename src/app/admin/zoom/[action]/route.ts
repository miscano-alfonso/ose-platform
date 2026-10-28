import { NextResponse, type NextRequest } from "next/server";
import { currentStaff } from "@/lib/auth";
import { siteBase } from "@/lib/social";
import { zoomLoginUrl, zoomCallback, ZoomError } from "@/lib/zoom";

// School settings → Live lessons → Connect Zoom: /admin/zoom/login sends the admin to Zoom; Zoom returns to /admin/zoom/callback.
export const dynamic = "force-dynamic";
const origin = (req: NextRequest) => `${req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(":", "")}://${req.headers.get("x-forwarded-host") || req.headers.get("host")}`;
const back = (base: string, key: "ok" | "err", msg: string) => NextResponse.redirect(`${base}/admin/school?${key}=${encodeURIComponent(msg)}#zoom`, 302);

export async function GET(req: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  const base = await siteBase(origin(req));
  const me = await currentStaff();
  if (!me || me.role !== "school_admin") return NextResponse.redirect(`${base}/admin/login`, 302);
  try {
    if (action === "login") return NextResponse.redirect(await zoomLoginUrl(base, me.email), 302);
    if (action === "callback") { const err = await zoomCallback(base, req.nextUrl.searchParams); return err ? back(base, "err", err) : back(base, "ok", "Zoom is connected. Press “Sync Zoom now” to read who joined this week’s lessons."); }
  } catch (e) { return back(base, "err", e instanceof ZoomError ? e.message : "Couldn’t connect to Zoom. Try again."); }
  return NextResponse.json({ error: "Unknown action." }, { status: 404 });
}
