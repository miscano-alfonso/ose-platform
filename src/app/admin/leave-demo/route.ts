import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { SCHOOL_COOKIE, runAsSchool } from "@/lib/db";
import { DEMO } from "@/lib/demo";
import { VIEWAS_COOKIE, signOut } from "@/lib/auth";
import { currentFamily, familySignOut } from "@/lib/family-auth";

// "Leave the demo" (25 Nov): back to this site's own school after looking round Demo Academy as its demo visitor.
// It lives under /admin so the admin's school cookie can be read: only the demo is left; another school's cookie is kept.
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const jar = await cookies(), opts = { secure: process.env.NODE_ENV === "production" };
  if (jar.get(SCHOOL_COOKIE)?.value === DEMO) {
    await runAsSchool(DEMO, async () => { await signOut(); if ((await currentFamily())?.viewer) await familySignOut(); });
    jar.delete({ name: SCHOOL_COOKIE, path: "/admin", ...opts }); jar.delete({ name: VIEWAS_COOKIE, path: "/admin", ...opts });
  }
  jar.delete({ name: SCHOOL_COOKIE + "_p", path: "/parent" }); jar.delete({ name: SCHOOL_COOKIE + "_s", path: "/student" });
  jar.delete({ name: "ose_site", path: "/" }); jar.delete({ name: "ose_demo", path: "/" }); jar.delete({ name: "ose_nd", path: "/" });
  return NextResponse.redirect(new URL("/admin", req.url), 303);
}
