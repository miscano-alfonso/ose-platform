import "server-only";
import { withSchool, runAsSchool } from "./db";
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
export async function saveDrawing(userId: string | null, b: Record<string, unknown>): Promise<string> {
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
    const j = (await res.json().catch(() => ({}))) as { error?: { message?: string; type?: string } };
    console.error("studio: Claude answered", res.status, j.error);
    const m = j.error?.message ?? "";
    if (/credit balance/i.test(m)) throw new StudioError("The school's Anthropic account is out of credit. Top it up at console.anthropic.com (Billing), then try again.", 402);
    if (res.status === 401) throw new StudioError("Claude didn't accept the school's Anthropic API key. Check it under Social › Connect to Social › AI searches.", 502);
    throw new StudioError(res.status === 429 || res.status === 529 ? "Claude is busy. Wait a minute, then try again." : "Claude said: " + (m || res.status), res.status === 429 ? 429 : 502);
  }
  const body = res.body!.getReader(), enc = new TextEncoder(), dec = new TextDecoder();
  let buf = "";
  return new ReadableStream<Uint8Array>({
    // keep reading until there is text to pass on: a pull that ends without passing anything on is never called again,
    // and Claude's first events ("message started") carry no text, which used to stall every drawing (4 Nov)
    async pull(ctl) {
      try {
       for (;;) {
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
          if (j.type === "error") console.error("studio: Claude stream error", j.error);
          if (j.type === "error") out += "\u0000" + (/overloaded/i.test(j.error?.message ?? "") ? "Claude is very busy right now. Try again in a minute." : (j.error?.message ?? "Claude stopped part-way."));
        }
        if (out) { ctl.enqueue(enc.encode(out)); return; }
       }
      } catch (e) { console.error("studio: stream from Claude failed", (e as Error).name, (e as Error).message); ctl.enqueue(enc.encode("\u0000" + ((e as Error).name === "TimeoutError" ? "That took too long." : "The connection to Claude dropped."))); ctl.close(); }
    },
    cancel() { body.cancel().catch(() => {}); },
  });
}

/** The school's tweaks to Sketch Studio's swatches: { geography: { main, shade, highlight, white }, … }, hex colours only. */
export async function getPalettes(): Promise<Record<string, Record<string, string>>> {
  const r = await withSchool((q) => q<{ value: Record<string, Record<string, string>> }>(`select value from design_kv where key = 'studio_palettes'`)).catch(() => []);
  return r[0]?.value ?? {};
}
export async function savePalettes(v: unknown) {
  const clean: Record<string, Record<string, string>> = {};
  if (v && typeof v === "object") for (const [k, c] of Object.entries(v as Record<string, unknown>)) {
    if (!PALETTES.includes(k) || !c || typeof c !== "object") continue;
    const o: Record<string, string> = {};
    for (const f of ["main", "shade", "highlight", "white"]) { const x = (c as Record<string, unknown>)[f]; if (typeof x === "string" && /^#[0-9A-Fa-f]{6}$/.test(x)) o[f] = x.toUpperCase(); }
    if (Object.keys(o).length) clean[k] = o;
  }
  await withSchool((q) => q(`insert into design_kv (school_id, key, value) values (current_school(), 'studio_palettes', $1::jsonb)
    on conflict (school_id, key) do update set value = excluded.value, updated_at = now()`, [JSON.stringify(clean)]));
}

// ---------- background jobs (4 Nov): start one, then the page polls it ----------
/** Start a draft, check or change. Returns the job id at once; the work carries on after the response (see the route's after()). */
export async function startJob(userId: string | null, input: string, images: string[], quick: boolean): Promise<{ id: string; run: () => Promise<void> }> {
  if (typeof input !== "string" || !input.trim() || input.length > 250_000) throw new StudioError("Nothing to draw.");
  const ai = await getAiConfig();
  if (!ai.key) throw new StudioError("The studio needs the Anthropic API key. Add it under Social › Connect to Social › AI searches.", 503);
  const { id, slug } = await withSchool(async (q) => {
    await q(`delete from studio_jobs where created_at < now() - interval '2 days'`);
    // the studio is behind a shared password, so cap how much it can spend: at most 60 Claude calls an hour for the school
    const [{ n }] = await q<{ n: number }>(`select count(*)::int as n from studio_jobs where created_at > now() - interval '1 hour'`);
    if (n >= 60) throw new StudioError("The studio has made a lot of drawings in the last hour. Wait a little, then try again.", 429);
    const r = await q<{ id: string }>(`insert into studio_jobs (school_id, created_by) values (current_school(), $1) returning id`, [userId]);
    const sc = await q<{ slug: string }>(`select slug from schools where id = current_school()`);
    return { id: r[0].id, slug: sc[0].slug };
  });
  const run = () => runAsSchool(slug, async () => {
    const set = (sql: string, params: unknown[]) => withSchool((q) => q(sql, params)).catch((e) => console.error("studio: job update", e));
    let text = "", last = Date.now();
    console.log("studio: job started", id);
    try {
      const stream = await ask(input, images, quick);
      console.log("studio: job streaming", id);
      const rd = stream.getReader(), dec = new TextDecoder();
      for (;;) {
        const { done, value } = await rd.read(); if (process.env.STUDIO_DEBUG) console.log("studio: read", done, value?.length); if (done) break;
        text += dec.decode(value, { stream: true });
        if (Date.now() - last > 4000) { last = Date.now(); await set(`update studio_jobs set text = $2, updated_at = now() where id = $1`, [id, text]); }
      }
      const k = text.indexOf("\u0000");
      if (k >= 0) await set(`update studio_jobs set status = 'error', error = $2, text = $3, updated_at = now() where id = $1`, [id, text.slice(k + 1).trim() || "Claude stopped part-way.", text.slice(0, k)]);
      else if (!text.trim()) await set(`update studio_jobs set status = 'error', error = 'Claude’s answer came back empty.', updated_at = now() where id = $1`, [id]);
      else await set(`update studio_jobs set status = 'done', text = $2, updated_at = now() where id = $1`, [id, text]);
      console.log("studio: job finished", id, text.length);
    } catch (e) {
      console.error("studio: job failed", e);
      await set(`update studio_jobs set status = 'error', error = $2, text = $3, updated_at = now() where id = $1`, [id, e instanceof StudioError ? e.message : "Claude couldn’t finish that one.", text]);
    }
  });
  return { id, run };
}
export async function jobStatus(id: string): Promise<{ status: string; text: string; error: string | null; age: number } | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const r = await withSchool((q) => q<{ status: string; text: string; error: string | null; age: number }>(
    `select status, text, error, extract(epoch from now() - updated_at)::int as age from studio_jobs where id = $1`, [id]));
  const j = r[0]; if (!j) return null;
  // a job whose server was stopped mid-way never finishes: after 6 quiet minutes, say so
  if (j.status === "running" && j.age > 360) return { ...j, status: "error", error: "The drawing stopped before Claude finished (the website's time limit). Try again, or set Checking to Off." };
  return j;
}

// ---------- the studio's password (4 Nov): /studio is open to anyone with the password, no admin sign-in ----------
import { createHmac, createHash, timingSafeEqual } from "node:crypto";
export const STUDIO_COOKIE = "ose_studio";
const studioKey = () => process.env.STUDIO_SECRET || process.env.ADMIN_SETUP_KEY || process.env.DATABASE_URL || "ose-studio";
// the password is "ose" unless STUDIO_PASSWORD is set in Vercel (only its hash is kept here)
const PASS_HASH = "699a9f9d57b23ee3a86afdc0fe67adf9dafc3e648ad8d3b54687f091b64471cf";
export function studioPasswordOk(given: string): boolean {
  const want = process.env.STUDIO_PASSWORD ? createHash("sha256").update(process.env.STUDIO_PASSWORD).digest() : Buffer.from(PASS_HASH, "hex");
  const got = createHash("sha256").update(String(given ?? "").trim()).digest();
  return timingSafeEqual(want, got);
}
/** The cookie's value: an HMAC of the password's hash, so changing STUDIO_PASSWORD signs everyone out. */
export function studioToken(): string {
  const ph = process.env.STUDIO_PASSWORD ? createHash("sha256").update(process.env.STUDIO_PASSWORD).digest("hex") : PASS_HASH;
  return createHmac("sha256", studioKey()).update("studio:" + ph).digest("base64url");
}
export function studioCookieOk(v: string | undefined): boolean {
  if (!v) return false; const want = studioToken();
  return v.length === want.length && timingSafeEqual(Buffer.from(v), Buffer.from(want));
}

