import { NextResponse, after, type NextRequest } from "next/server";
import { currentStaff } from "@/lib/auth";
import { ask, listDrawings, saveDrawing, deleteDrawing, getPalettes, savePalettes, startJob, jobStatus, StudioError } from "@/lib/studio";
import { canvaUploadImage, canvaUploadStatus } from "@/lib/designs";

// Sketch Studio: ask (draft, check or change a drawing; streamed), list, save, delete. Admins only: drawing uses the school's API credit.
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const out = (d: unknown, status = 200) => NextResponse.json(d, { status, headers: { "cache-control": "no-store" } });

async function admin(req: NextRequest) {
  const me = await currentStaff();
  if (!me || me.role !== "school_admin") return null;
  const o = req.headers.get("origin"); if (o && new URL(o).host !== req.headers.get("host")) return null;
  return me;
}
export async function GET(req: NextRequest) {
  if (!(await admin(req))) return out({ error: "Sign in to the admin again." }, 401);
  const job = req.nextUrl.searchParams.get("job");
  if (job) { const j = await jobStatus(job); return j ? out(j) : out({ error: "That drawing job has gone." }, 404); }
  const [drawings, canva, palettes] = await Promise.all([listDrawings(), canvaUploadStatus().catch(() => null), getPalettes()]);
  return out({ drawings, canva, palettes });
}
export async function POST(req: NextRequest) {
  const me = await admin(req);
  if (!me) return out({ error: "Sign in to the admin again." }, 401);
  const action = req.nextUrl.searchParams.get("action");
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    if (action === "start") {
      const imgs = Array.isArray(b.images) ? (b.images as unknown[]).filter((x): x is string => typeof x === "string") : [];
      const { id, run } = await startJob(me.id, String(b.input ?? ""), imgs, b.quick === true);
      after(run);   // carries on after this response; the page polls ?job=id
      return out({ id });
    }
    if (action === "ask") {
      const stream = await ask(String(b.input ?? ""), Array.isArray(b.images) ? (b.images as unknown[]).filter((x): x is string => typeof x === "string") : [], b.quick === true);
      return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
    }
    if (action === "save") return out({ id: await saveDrawing(me.id, b) });
    if (action === "palettes") { await savePalettes(b.palettes); return out({ ok: true }); }
    if (action === "delete") { await deleteDrawing(String(b.id ?? "")); return out({ ok: true }); }
    if (action === "canva") {
      const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.png ?? ""));
      if (!m) return out({ error: "That picture couldn’t be read." }, 400);
      try { return out(await canvaUploadImage(String(b.name ?? "Sketch Studio drawing"), Buffer.from(m[1], "base64"))); }
      catch (e) { return out({ error: (e as Error).message || "Canva didn’t take the picture." }, 400); }
    }
    return out({ error: "Unknown action." }, 400);
  } catch (e) {
    if (e instanceof StudioError) return out({ error: e.message }, e.status);
    console.error("studio", e); return out({ error: "Something went wrong. Try again." }, 500);
  }
}
