import "server-only";
import { withSchool } from "./db";
import { googleAccess, DRIVE_URL } from "./meet";
import { getAiConfig } from "./social";

// 27 Nov (Alfonso: "message students to re-submit work if a photo is not in the correct orientation, ie if an A4 writing has
// been handed in the wrong way"): after each Classroom read, the photos in new hand-ins are checked. The recordings account
// (ose@, a teacher in every Classroom) can open students' files. With the Anthropic key set (Social → AI searches), Claude
// looks at each photo; without it, a page photo that's wider than it is tall is taken as sideways. The automation "Hand-in
// needs doing again" then emails the student (db/122).

type Row = { id: string; files: { id: string; title: string }[] };
type Verdict = "ok" | "sideways" | "upside_down" | "unclear";
const WORSE: Verdict[] = ["ok", "unclear", "sideways", "upside_down"];

async function verdictFor(token: string, fileId: string, ai: { key?: string; model?: string }): Promise<Verdict> {
  const meta = await fetch(`${DRIVE_URL()}/files/${encodeURIComponent(fileId)}?fields=mimeType,thumbnailLink,imageMediaMetadata(width,height,rotation)&supportsAllDrives=true`,
    { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) }).then((r) => r.ok ? r.json() : null).catch(() => null) as
    { mimeType?: string; thumbnailLink?: string; imageMediaMetadata?: { width?: number; height?: number; rotation?: number } } | null;
  if (!meta || !(meta.mimeType ?? "").startsWith("image/")) return "ok";   // documents and PDFs aren't checked
  if (ai.key && meta.thumbnailLink) {
    const img = await fetch(meta.thumbnailLink.replace(/=s\d+$/, "=s1000"), { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) })
      .then(async (r) => r.ok ? { type: r.headers.get("content-type") ?? "image/jpeg", b64: Buffer.from(await r.arrayBuffer()).toString("base64") } : null).catch(() => null);
    if (img && img.b64.length < 6_000_000) {
      const res = await fetch(process.env.ANTHROPIC_API_URL || "https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "x-api-key": ai.key, "anthropic-version": "2023-06-01", "content-type": "application/json" }, signal: AbortSignal.timeout(45000),
        body: JSON.stringify({ model: ai.model || "claude-sonnet-5-5", max_tokens: 20, messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: /png|webp|gif/.test(img.type) ? img.type.split(";")[0] : "image/jpeg", data: img.b64 } },
          { type: "text", text: "A student handed in this photo of their work. Is it the right way up, so a teacher can read it without rotating it? Reply with one word: upright, sideways, upside_down, or unclear (not a page of work, or can't tell)." }] }] }),
      }).then((r) => r.ok ? r.json() : null).catch(() => null) as { content?: { type: string; text?: string }[] } | null;
      const t = (res?.content ?? []).map((c) => c.text ?? "").join(" ").toLowerCase();
      if (/upside/.test(t)) return "upside_down";
      if (/sideways/.test(t)) return "sideways";
      if (/upright/.test(t)) return "ok";
      if (/unclear/.test(t)) return "unclear";
    }
  }
  // no AI: a photo of a page is taller than it is wide; one that's clearly wider is probably sideways
  const m = meta.imageMediaMetadata ?? {}, turned = m.rotation === 1 || m.rotation === 3;
  const w = turned ? m.height : m.width, h = turned ? m.width : m.height;
  return w && h && w > h * 1.2 ? "sideways" : "ok";
}

/** Check the photos in hand-ins from the last week that haven't been checked (or whose files changed). */
export async function checkHandInPhotos(limit = 25): Promise<{ checked: number; flagged: number }> {
  const rows = await withSchool((q) => q<Row>(`select s.id, s.files from classroom_submissions s
    where s.state = 'turned_in' and s.photo_check is null and jsonb_typeof(s.files) = 'array' and jsonb_array_length(s.files) > 0
      and s.turned_in_at > now() - interval '7 days' order by s.turned_in_at desc limit $1`, [limit])).catch(() => [] as Row[]);
  if (!rows.length) return { checked: 0, flagged: 0 };
  let token: string; try { token = await googleAccess("rec"); } catch { return { checked: 0, flagged: 0 }; }
  const ai = await getAiConfig().catch(() => ({} as { key?: string; model?: string }));
  let flagged = 0;
  for (const r of rows) {
    let worst: Verdict = "ok";
    for (const f of r.files.slice(0, 5)) { const v = await verdictFor(token, f.id, ai); if (WORSE.indexOf(v) > WORSE.indexOf(worst)) worst = v; }
    if (worst === "sideways" || worst === "upside_down") flagged++;
    await withSchool((q) => q(`update classroom_submissions set photo_check = $2 where id = $1`, [r.id, worst])).catch(() => null);
  }
  return { checked: rows.length, flagged };
}
