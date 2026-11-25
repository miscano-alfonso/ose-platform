import { NextResponse, type NextRequest } from "next/server";
import { leaveNewDashDemo } from "@/lib/demo";

export const dynamic = "force-dynamic";
export async function GET(req: NextRequest, { params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  await leaveNewDashDemo();
  return NextResponse.redirect(new URL(["teacher", "parent", "student"].includes(role) ? `/newdashboard/${role}` : "/", req.url), 303);
}
