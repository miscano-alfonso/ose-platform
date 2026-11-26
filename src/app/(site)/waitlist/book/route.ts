import { NextResponse, type NextRequest } from "next/server";
import { WL_COOKIE, wlIds, entryCourse } from "@/lib/waitlist-join";

// 27 Nov: the "book your place" link in the waiting-list email. Remembers the family's waiting-list entry in this browser
// (so they can book during the head start) and opens the course page.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const w = req.nextUrl.searchParams.get("w") ?? "";
  const slug = await entryCourse(w).catch(() => null);
  const res = NextResponse.redirect(new URL(slug ? `/courses/${slug}` : "/courses", req.nextUrl.origin));
  if (slug) {
    const ids = [w, ...wlIds(req.cookies.get(WL_COOKIE)?.value).filter((x) => x !== w)].slice(0, 20);
    res.cookies.set(WL_COOKIE, ids.join("."), { path: "/", sameSite: "lax", httpOnly: true, secure: process.env.VERCEL === "1", maxAge: 60 * 60 * 24 * 30 });
  }
  return res;
}
