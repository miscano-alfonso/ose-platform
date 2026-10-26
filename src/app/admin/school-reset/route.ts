import { NextResponse, type NextRequest } from "next/server";
import { SCHOOL_COOKIE } from "@/lib/db";
import { VIEWAS_COOKIE } from "@/lib/auth";

// Back to this site's own school (clears the School switcher and Viewing-as choices).
export function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/admin", req.url), 302);
  res.cookies.set(SCHOOL_COOKIE, "", { path: "/admin", maxAge: 0 });
  res.cookies.set(VIEWAS_COOKIE, "", { path: "/admin", maxAge: 0 });
  return res;
}
