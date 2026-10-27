import { NextResponse, type NextRequest } from "next/server";
import { leaveDemo } from "@/lib/demo";

export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  await leaveDemo();
  return NextResponse.redirect(new URL("/osedtech", req.url), 303);
}
