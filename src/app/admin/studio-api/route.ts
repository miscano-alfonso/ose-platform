import { NextResponse, type NextRequest } from "next/server";
import { currentStaff } from "@/lib/auth";
import { ask, listDrawings, saveDrawing, deleteDrawing, StudioError } from "@/lib/studio";

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
  return out({ drawings: await listDrawings() });
}
export async function POST(req: NextRequest) {
  const me = await admin(req);
  if (!me) return out({ error: "Sign in to the admin again." }, 401);
  const action = req.nextUrl.searchParams.get("action");
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    if (action === "ask") {
      const stream = await ask(String(b.input ?? ""), Array.isArray(b.images) ? (b.images as unknown[]).filter((x): x is string => typeof x === "string") : [], b.quick === true);
      return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
    }
    if (action === "save") return out({ id: await saveDrawing(me.id, b) });
    if (action === "delete") { await deleteDrawing(String(b.id ?? "")); return out({ ok: true }); }
    return out({ error: "Unknown action." }, 400);
  } catch (e) {
    if (e instanceof StudioError) return out({ error: e.message }, e.status);
    console.error("studio", e); return out({ error: "Something went wrong. Try again." }, 500);
  }
}
