import { NextResponse, type NextRequest } from "next/server";
import { logPresentationView, type Kind } from "@/lib/visitors";

// A view of a /newdashboard introduction page (sent by the page itself, so robots that don't run scripts aren't counted).
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as { page?: string };
  if (b.page === "teacher" || b.page === "parent" || b.page === "student") await logPresentationView(b.page as Kind).catch(() => null);
  return new NextResponse(null, { status: 204 });
}
