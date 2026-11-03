import { NextResponse, type NextRequest } from "next/server";
import { currentStaff } from "@/lib/auth";
import { STUDIO_HTML } from "@/lib/studio-page";

// Sketch Studio's page (/studio sends people here, under /admin so the admin sign-in applies). Admins only.
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const me = await currentStaff();
  if (!me) return NextResponse.redirect(new URL("/admin/login", req.url));
  if (me.role !== "school_admin") return NextResponse.redirect(new URL("/admin/teacher", req.url));
  return new Response(STUDIO_HTML, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" } });
}
