import { NextResponse, type NextRequest } from "next/server";
import { currentStaff } from "@/lib/auth";
import { siteBase } from "@/lib/social";
import * as D from "@/lib/designs";

// Admin → Marketing → Post designs: pictures for the canvas (served from this site so they can be tinted), uploads, and Canva.
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const origin = (req: NextRequest) => `${req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(":", "")}://${req.headers.get("x-forwarded-host") || req.headers.get("host")}`;
const out = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { "cache-control": "no-store" } });
const err = (e: unknown) => out({ error: e instanceof D.DesignError ? e.message : "Something went wrong. Try again." }, e instanceof D.DesignError ? 400 : 500);
const back = (base: string, key: "ok" | "err", msg: string) => NextResponse.redirect(`${base}/admin/designs?tab=library&${key}=${encodeURIComponent(msg)}`, 302);
const img = (x: { mime: string; data: Buffer } | null) => x ? new Response(new Uint8Array(x.data), { headers: { "content-type": x.mime, "cache-control": "private, max-age=86400", "x-content-type-options": "nosniff" } }) : new Response("Not found", { status: 404 });

export async function GET(req: NextRequest) {
  const me = await currentStaff();
  const base = await siteBase(origin(req));
  if (!me) return out({ error: "Sign in again." }, 401);
  // Canva sends people back to the redirect URL with its own "?code=…&state=…" added, which can drop our ?action=
  // or glue its "?" onto it ("action=canvacallback?code=…"): either way, a return from Canva is the callback.
  const sp = new URLSearchParams(req.nextUrl.search.replace(/^\?/, "").replace(/\?/g, "&"));
  const action = sp.has("code") || (sp.has("state") && sp.has("error")) ? "canvacallback" : sp.get("action");
  try {
    if (action === "asset") return img(await D.getAsset(sp.get("id") || ""));
    if (action === "photo") return img(await D.teacherPhoto(sp.get("id") || ""));
    if (me.role !== "school_admin") return out({ error: "Only a school admin can do that." }, 403);
    if (action === "canvalogin") return NextResponse.redirect(await D.canvaLoginUrl(base), 302);
    if (action === "canvacallback") { const e = await D.canvaCallback(base, sp, me.email); return e ? back(base, "err", e) : back(base, "ok", "Canva is connected. Choose “From Canva” to bring in an illustration."); }
    if (action === "canvalist") return out(await D.canvaList(sp.get("q") || ""));
  } catch (e) { if (action === "canvalogin" || action === "canvacallback") return back(base, "err", e instanceof D.DesignError ? e.message : "Couldn’t connect to Canva."); return err(e); }
  console.warn("design-api unknown action", JSON.stringify([...sp.keys()]), String(action).slice(0, 40));
  return out({ error: "Unknown action." }, 404);
}

export async function POST(req: NextRequest) {
  const me = await currentStaff();
  if (!me || me.role !== "school_admin") return out({ error: "Sign in to the admin again." }, 401);
  const o = req.headers.get("origin");
  if (o && new URL(o).host !== req.headers.get("host")) return out({ error: "Not allowed." }, 403);
  const action = req.nextUrl.searchParams.get("action");
  try {
    if (action === "upload") {
      const f = await req.formData(); const file = f.get("file");
      if (!(file instanceof File)) return out({ error: "Choose a picture." }, 400);
      const id = await D.saveAsset(me.id, String(f.get("name") || file.name.replace(/\.[a-z0-9]+$/i, "")), String(f.get("kind") || "illustration"), Buffer.from(await file.arrayBuffer()));
      return out({ id });
    }
    const b = (await req.json().catch(() => ({}))) as Record<string, string>;
    if (action === "delete") { await D.deleteAsset(String(b.id || "")); return out({ ok: true }); }
    if (action === "rename") { await D.renameAsset(String(b.id || ""), String(b.name || ""), String(b.kind || "")); return out({ ok: true }); }
    if (action === "canvaimport") return out({ id: await D.canvaImport(me.id, String(b.id || ""), String(b.title || "Canva design"), String(b.kind || "illustration")) });
  } catch (e) { return err(e); }
  return out({ error: "Unknown action." }, 404);
}
