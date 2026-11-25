import { NextResponse, type NextRequest } from "next/server";
import { openDemoAs, type DemoRole } from "@/lib/demo";

// The sticky "Try the demo" button on /newdashboard/<role>: opens Demo Academy as a made-up teacher, parent or student (read-only).
export const dynamic = "force-dynamic";
const ROLES: DemoRole[] = ["teacher", "parent", "student"];
export async function GET(req: NextRequest, { params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (!ROLES.includes(role as DemoRole)) return NextResponse.redirect(new URL("/", req.url), 303);
  const r = await openDemoAs(role as DemoRole);
  const to = "to" in r ? r.to : `/newdashboard/${role}?demo=${encodeURIComponent(r.error)}`;
  return NextResponse.redirect(new URL(to, req.url), 303);
}
