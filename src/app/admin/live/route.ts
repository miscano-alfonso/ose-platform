import { currentStaff } from "@/lib/auth";
import { messagesStamp } from "@/lib/live-stamp";

export const dynamic = "force-dynamic";
// 26 Nov: polled by <LiveMessages /> every few seconds while a messages page is open.
export async function GET() {
  if (!(await currentStaff())) return Response.json({ error: "Sign in" }, { status: 401 });
  return Response.json({ stamp: await messagesStamp() }, { headers: { "cache-control": "no-store" } });
}
