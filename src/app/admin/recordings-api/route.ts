import { currentStaff } from "@/lib/auth";
import { getPreview, getThumb } from "@/lib/recordings";

// Admin → Recordings: a title card's preview picture (?id=), or a recording's Drive thumbnail for the hover preview (?thumb=).
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const me = await currentStaff(); if (!me) return new Response("Sign in again.", { status: 401 });
  const sp = new URL(req.url).searchParams;
  if (sp.get("thumb")) {
    const t = await getThumb(sp.get("thumb")!).catch(() => null);
    return t ? new Response(new Uint8Array(t.data), { headers: { "content-type": t.mime, "cache-control": "private, max-age=3600" } }) : new Response("No thumbnail", { status: 404 });
  }
  const p = await getPreview(sp.get("id") || "");
  return p ? new Response(new Uint8Array(p), { headers: { "content-type": "image/png", "cache-control": "private, no-cache" } }) : new Response("Not found", { status: 404 });
}
