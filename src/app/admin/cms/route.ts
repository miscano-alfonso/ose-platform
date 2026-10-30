import { NextResponse, type NextRequest } from "next/server";
import { runAsSchool, siteSchool } from "@/lib/db";
import { currentStaff } from "@/lib/auth";
import { startEditing } from "@/lib/edt-cms";

export const dynamic = "force-dynamic";
// "Admin" at the foot of the OH-SO EdTech site (and Admin → Website → EdTech website): an admin of OH-SO ED (this
// site's own school) opens the EdTech site in edit mode. Not signed in yet? Sign in first, then press it again.
export async function GET(req: NextRequest) {
  const me = await runAsSchool(siteSchool(), () => currentStaff()).catch(() => null);
  if (!me || me.role !== "school_admin") return NextResponse.redirect(new URL("/admin/login?cms=1", req.url), 303);
  await startEditing(me.id);
  const to = req.nextUrl.searchParams.get("to") ?? "";
  return NextResponse.redirect(new URL(/^\/osedtech(\/[\w/-]*)?$/.test(to) ? to : "/osedtech", req.url), 303);
}
