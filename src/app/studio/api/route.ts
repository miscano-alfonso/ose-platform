import { NextResponse, after, type NextRequest } from "next/server";
import { listDrawings, saveDrawing, deleteDrawing, getPalettes, savePalettes, startJob, jobStatus, StudioError, STUDIO_COOKIE, studioCookieOk } from "@/lib/studio";
import { canvaUploadImage, canvaUploadStatus } from "@/lib/designs";

// Sketch Studio's API (/studio/api): start a draft, check or change, poll it, list, save, delete, palettes, Canva. Needs the studio password.
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const out = (d: unknown, status = 200) => NextResponse.json(d, { status, headers: { "cache-control": "no-store" } });

// anyone who has entered the studio password (the ose_studio cookie), from this site only
async function admin(req: NextRequest) {
  if (!studioCookieOk(req.cookies.get(STUDIO_COOKIE)?.value)) return null;
  const o = req.headers.get("origin"); if (o && new URL(o).host !== req.headers.get("host")) return null;
  return { id: null as string | null };
}
export async function GET(req: NextRequest) {
  if (!(await admin(req))) return out({ error: "Enter the studio password again." }, 401);
  const job = req.nextUrl.searchParams.get("job");
  if (job) { const j = await jobStatus(job); return j ? out(j) : out({ error: "That drawing job has gone." }, 404); }
  const [drawings, canva, palettes] = await Promise.all([listDrawings(), canvaUploadStatus().catch(() => null), getPalettes()]);
  return out({ drawings, canva, palettes });
}
export async function POST(req: NextRequest) {
  const me = await admin(req);
  if (!me) return out({ error: "Enter the studio password again." }, 401);
  const action = req.nextUrl.searchParams.get("action");
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    if (action === "start") {
      const imgs = Array.isArray(b.images) ? (b.images as unknown[]).filter((x): x is string => typeof x === "string") : [];
      const { id, run } = await startJob(me.id, String(b.input ?? ""), imgs, b.quick === true);
      after(run);   // carries on after this response; the page polls ?job=id
      return out({ id });
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
