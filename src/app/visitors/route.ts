import { NextResponse, type NextRequest } from "next/server";
// /visitors (26 Nov): the stats page lives in the admin (it needs the staff sign-in)
export function GET(req: NextRequest) { return NextResponse.redirect(new URL("/admin/visitors", req.url), 307); }
