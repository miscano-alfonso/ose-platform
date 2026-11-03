// On the school's own site: the same page, talking to /admin/studio-api instead of the Claude viewer.
const STUDIO_API = "/admin/studio-api";
async function toDataUrl(blob, max = 1400) {
  const bmp = await createImageBitmap(blob); const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height); return c.toDataURL("image/jpeg", 0.85);
}
function parseJsonReply(text) {
  try { return JSON.parse(text); } catch { }
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/); if (m) { try { return JSON.parse(m[1]); } catch { } }
  const a = Math.min(...["{", "["].map((c) => { const i = text.indexOf(c); return i < 0 ? Infinity : i; })), b = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (a < b) { try { return JSON.parse(text.slice(a, b + 1)); } catch { } }
  throw { code: "invalid_json", text };
}
async function studioPost(action, body, signal) {
  let r; try { r = await fetch(STUDIO_API + "?action=" + action, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal }); }
  catch (e) { throw { code: e && e.name === "AbortError" ? "cancelled" : "network" }; }
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw { code: r.status === 401 ? "signed_out" : r.status === 503 ? "no_key" : r.status === 429 ? "rate_limited" : "server", message: j.error }; }
  return r;
}
const sampleShim = {
  async json(input, o = {}) {
    const images = []; for (const f of o.images || []) images.push(await toDataUrl(f));
    const r = await studioPost("ask", { input, images, quick: o.modelTier && o.modelTier !== "complex" }, o.signal);
    const rd = r.body.getReader(), dec = new TextDecoder(); let text = "";
    try {
      for (;;) { const { done, value } = await rd.read(); if (done) break; text += dec.decode(value, { stream: true });
        const k = text.indexOf("\u0000"); if (k >= 0) throw { code: "server", message: text.slice(k + 1) };
        if (o.onText) o.onText({ text }); }
    } catch (e) { if (e && e.code) throw e; throw { code: o.signal && o.signal.aborted ? "cancelled" : "network" }; }
    return parseJsonReply(text);
  },
  async limits() { return { images: { mediaTypes: ["image/jpeg", "image/png"] } }; },
};
const studioListeners = [];
async function studioRefresh() {
  const r = await fetch(STUDIO_API, { cache: "no-store" }); if (!r.ok) throw { code: r.status === 401 ? "signed_out" : "server" };
  const j = await r.json(); if (window.studioCanva) window.studioCanva.info = j.canva || null; const snap = { docs: (j.drawings || []).map((d) => ({ id: d.id, data: () => d })) };
  for (const [next] of studioListeners) next(snap);
}
const refreshSoon = () => studioRefresh().catch(() => { });
const dbShim = {
  collection() { const q = { orderBy() { return q; }, limit() { return q; },
    onSnapshot(next, err) { studioListeners.push([next, err]); studioRefresh().catch((e) => err && err(e)); return () => { }; },
    async add(doc) { const r = await (await studioPost("save", doc)).json(); refreshSoon(); return { id: r.id }; } }; return q; },
  doc(path) { const id = path.split("/")[1]; return {
    async update(doc) { await studioPost("save", Object.assign({ id }, doc)); refreshSoon(); },
    async delete() { await studioPost("delete", { id }); refreshSoon(); } }; },
};
const downloadsShim = { async save({ filename, data }) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: filename.endsWith(".svg") ? "image/svg+xml" : "application/octet-stream" });
  const u = URL.createObjectURL(blob), a = document.createElement("a"); a.href = u; a.download = filename; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 5000); return { status: "saved" }; } };
// Send to Canva: the school's Canva connection uploads the PNG and files it in the Canva folder set in the admin
window.studioCanva = { info: null, async send(name, png) {
  let r; try { r = await fetch(STUDIO_API + "?action=canva", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, png }) }); }
  catch { throw new Error("Lost the connection to the server. Try again."); }
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Couldn't send that to Canva."); return j; } };
