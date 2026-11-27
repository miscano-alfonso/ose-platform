import { NextResponse, type NextRequest } from "next/server";
import { currentStaff } from "@/lib/auth";
import { MODE_COOKIE, teachesSelf } from "@/lib/staff-mode";

export const dynamic = "force-dynamic";
// 27 Nov: an admin who also teaches (e.g. Leanne) switches between Admin mode and Teacher mode. Teacher mode shows her own
// teacher dashboard with the teacher menu (not "Viewing as": it's her own classes, and anything she does is recorded as her).
export async function GET(req: NextRequest) {
  const me = await currentStaff();
  if (!me) return NextResponse.redirect(new URL("/admin/login", req.nextUrl.origin));
  const to = req.nextUrl.searchParams.get("to") === "teacher" && me.role === "school_admin" && await teachesSelf(me.id) ? "teacher" : "admin";
  const res = NextResponse.redirect(new URL(to === "teacher" ? "/admin/teacher" : "/admin", req.nextUrl.origin));
  res.cookies.set(MODE_COOKIE, to, { path: "/", sameSite: "lax", httpOnly: true, secure: process.env.VERCEL === "1", maxAge: 60 * 60 * 24 * 365 });
  return res;
}
