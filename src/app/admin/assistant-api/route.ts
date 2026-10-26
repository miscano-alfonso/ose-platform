import { NextResponse, type NextRequest } from "next/server";
import { currentStaff } from "@/lib/auth";
import { ask, apply, AsstError } from "@/lib/assistant";

// The admin Assistant: ask (read-only look-ups, returns proposals) and apply (an admin pressed Apply on a proposal).
export const dynamic = "force-dynamic";
export const maxDuration = 120;
const out = (d: unknown, status = 200) => NextResponse.json(d, { status, headers: { "cache-control": "no-store" } });

export async function POST(req: NextRequest) {
  const me = await currentStaff();
  if (!me || me.role !== "school_admin") return out({ error: "Sign in to the admin again." }, 401);
  const o = req.headers.get("origin"); if (o && new URL(o).host !== req.headers.get("host")) return out({ error: "Not allowed." }, 403);
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    if (req.nextUrl.searchParams.get("action") === "apply") return out(await apply(me.id, b as { kind: string; params: Record<string, unknown> }));
    const hist = Array.isArray(b.messages) ? (b.messages as { role: string; text: string }[]).filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.text === "string") as { role: "user" | "assistant"; text: string }[] : [];
    return out(await ask(hist));
  } catch (e) {
    if (e instanceof AsstError) return out({ error: e.message }, e.status);
    console.error("assistant", e); return out({ error: "Something went wrong. Try again." }, 500);
  }
}
