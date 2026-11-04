import { NextResponse, type NextRequest } from "next/server";

// 4 Nov: Sketch Studio moved to /studio (its own password, no admin sign-in). Old links land there.
export const dynamic = "force-dynamic";
export function GET(req: NextRequest) { return NextResponse.redirect(new URL("/studio", req.url), 308); }
