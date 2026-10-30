import { NextResponse, type NextRequest } from "next/server";
import { runAsSchool, siteSchool } from "@/lib/db";
import { currentStaff } from "@/lib/auth";
import { startArranging } from "@/lib/hero-marks-store";

export const dynamic = "force-dynamic";
// Admin → Website → Home page symbols: opens the home page with the symbols ready to drag (OH-SO ED admins only).
export async function GET(req: NextRequest) {
  const me = await runAsSchool(siteSchool(), () => currentStaff()).catch(() => null);
  if (!me || me.role !== "school_admin") return NextResponse.redirect(new URL("/admin/login", req.url), 303);
  await startArranging(me.id);
  return NextResponse.redirect(new URL("/", req.url), 303);
}
