import { NextResponse, type NextRequest } from "next/server";
import { joinInvite } from "@/lib/edtech-account";

export const dynamic = "force-dynamic";
// A teacher's invitation to an OH-SO EdTech customer school: picks that school in this browser, then shows the invitation.
export async function GET(req: NextRequest) {
  const s = req.nextUrl.searchParams.get("s") ?? "", t = req.nextUrl.searchParams.get("t") ?? "";
  const ok = await joinInvite(s, t);
  return NextResponse.redirect(new URL(ok ? `/admin/invite/${encodeURIComponent(t)}` : "/osedtech/login?error=" + encodeURIComponent("That invitation has expired or been used. Ask your school for a new one."), req.url), 303);
}
