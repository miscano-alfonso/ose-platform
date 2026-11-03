import "server-only";
import { withSchool } from "./db";
import { getAiConfig } from "./social";

// Sketch Studio (3 Nov): drawings in the home page's chalk style. Claude places shapes (a JSON "spec"); the page draws them.
// The page calls ask() for every draft, check and change; the answer is streamed back as plain text while it is written.
export class StudioError extends Error { constructor(msg: string, public status = 400) { super(msg); } }
const PALETTES = ["house", "english", "maths", "geography", "history", "science", "business", "media", "economics", "technology"];

export type Drawing = { id: string; title: string; prompt: string; bg: string; palette: string; hl: string; seed: number; spec: string; createdAt: string; updatedAt: string };
export async function listDrawings(): Promise<Drawing[]> {
  return withSchool((q) => q<Drawing>(`select id, title, prompt, bg, palette, hl, seed, spec::text as spec, created_at as "createdAt", updated_at as "updatedAt"
    from studio_drawings order by created_at desc limit 120`));
}
export async function saveDrawing(userId: string, b: Record<string, unknown>): Promise<string> {
  const spec = typeof b.spec === "string" ? b.spec : "";
  if (!spec || spec.length > 400_000) throw new StudioError("That drawing is too big to keep.");
  try { const s = JSON.parse(spec); if (!Array.isArray(s?.parts)) throw 0; } catch { throw new StudioError("That drawing couldn’t be read."); }
  const str = (v: unknown, n: number, d: string) => (typeof v === "string" ? v.slice(0, n) : d);
  const bg = b.bg === "navy" ? "navy" : "white", hl = ["off", "soft", "glow"].includes(String(b.hl)) ? String(b.hl) : "soft";
  const palette = PALETTES.includes(String(b.palette)) ? String(b.palette) : "house", seed = Number.isInteger(b.seed) ? Math.abs(Number(b.seed)) % 2_000_000_000 : 7;
  const id = typeof b.id === "string" && /^[0-9a-f-]{36}$/.test(b.id) ? b.id : null;
  return withSchool(async (q) => {
    if (id) {
      const r = await q<{ id: string }>(`update studio_drawings set title = $2, prompt = $3, bg = $4, palette = $5, hl = $6, seed = $7, spec = $8::jsonb, updated_at = now() where id = $1 returning id`,
        [id, str(b.title, 120, "Drawing"), str(b.prompt, 2000, ""), bg, palette, hl, seed, spec]);
      if (!r.length) throw new StudioError("That drawing has been deleted.", 404);
      return id;
    }
    const r = await q<{ id: string }>(`insert into studio_drawings (school_id, created_by, title, prompt, bg, palette, hl, seed, spec) values (current_school(), $1, $2, $3, $4, $5, $6, $7, $8::jsonb) returning id`,
      [userId, str(b.title, 120, "Drawing"), str(b.prompt, 2000, ""), bg, palette, hl, seed, spec]);
    return r[0].id;
  });
}
export async function deleteDrawing(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new StudioError("Unknown drawing.");
  await withSchool((q) => q(`delete from studio_drawings where id = $1`, [id]));
}

/** Ask Claude (the school's own Anthropic key) and stream the answer's text. A NUL character followed by a message marks a failure. */
export async function ask(input: string, images: string[], quick = false): Promise<ReadableStream<Uint8Array>> {
  const ai = await getAiConfig();
  if (!ai.key) throw new StudioError("The studio needs the Anthropic API key. Add it under Social › Connect to Social › AI searches.", 503);
  if (typeof input !== "string" || !input.trim() || input.length > 250_000) throw new StudioError("Nothing to draw.");
  const content: unknown[] = [];
  for (const d of images.slice(0, 2)) {
    const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(d);
    if (m && m[2].length < 5_000_000) content.push({ type: "image", source: { type: "base64", media_type: m[1], data: m[2] } });
  }
  content.push({ type: "text", text: input });
  const call = (model: string) => fetch(process.env.ANTHROPIC_API_URL || "https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "x-api-key": ai.key!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 32000, stream: true, messages: [{ role: "user", content }] }), signal: AbortSignal.timeout(290_000),
  });
  // the most capable model for drawing, falling back to the school's usual model if that one isn't available on the key
  // (quick questions such as "suggest ideas" use the school's usual model)
  let res = quick ? null : await call(process.env.STUDIO_MODEL || "claude-opus-5-5").catch(() => null);
  if (!res || (!res.ok && [400, 403, 404].includes(res.status))) res = await call(ai.model || "claude-sonnet-5-5").catch(() => null);
  if (!res) throw new StudioError("Couldn’t reach Claude. Try again.", 502);
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new StudioError(res.status === 429 ? "Claude is busy. Wait a minute, then try again." : "Claude said: " + (j.error?.message ?? res.status), res.status === 429 ? 429 : 502);
  }
  const body = res.body!.getReader(), enc = new TextEncoder(), dec = new TextDecoder();
  let buf = "";
  return new ReadableStream<Uint8Array>({
    async pull(ctl) {
      try {
        const { done, value } = await body.read();
        if (done) { ctl.close(); return; }
        buf += dec.decode(value, { stream: true });
        const events = buf.split("\n\n"); buf = events.pop() ?? "";
        let out = "";
        for (const ev of events) for (const line of ev.split("\n")) {
          if (!line.startsWith("data:")) continue;
          let j: { type?: string; delta?: { type?: string; text?: string }; error?: { message?: string } };
          try { j = JSON.parse(line.slice(5)); } catch { continue; }
          if (j.type === "content_block_delta" && j.delta?.type === "text_delta" && j.delta.text) out += j.delta.text;
          if (j.type === "error") out += "\u0000" + (j.error?.message ?? "Claude stopped part-way.");
        }
        if (out) ctl.enqueue(enc.encode(out));
      } catch (e) { ctl.enqueue(enc.encode("\u0000" + ((e as Error).name === "TimeoutError" ? "That took too long." : "The connection to Claude dropped."))); ctl.close(); }
    },
    cancel() { body.cancel().catch(() => {}); },
  });
}
