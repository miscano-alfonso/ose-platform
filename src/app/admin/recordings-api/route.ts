import { currentStaff } from "@/lib/auth";
import { getPreview } from "@/lib/recordings";

// Admin → Recordings: a title card's preview picture.
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const me = await currentStaff(); if (!me) return new Response("Sign in again.", { status: 401 });
  const p = await getPreview(new URL(req.url).searchParams.get("id") || "");
  return p ? new Response(new Uint8Array(p), { headers: { "content-type": "image/png", "cache-control": "private, no-cache" } }) : new Response("Not found", { status: 404 });
}
