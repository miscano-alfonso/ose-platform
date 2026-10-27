import { NextResponse, type NextRequest } from "next/server";
import { openDemoSite } from "@/lib/demo";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
// Opens the demo school's public website (its course shop) in this browser.
export async function GET(req: NextRequest) {
  const err = await openDemoSite();
  return NextResponse.redirect(new URL(err ? `/osedtech/demo?error=${encodeURIComponent(err)}` : "/", req.url), 303);
}
