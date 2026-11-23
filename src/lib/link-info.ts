import "server-only";
import { lookup } from "node:dns/promises";

// What a web page is about (23 Nov), for Social's "Draw in Sketch Studio": the page's title and description, read from its
// <title> and meta tags. Public web addresses only (no private or local addresses), at most 3 redirects, 6 seconds, 600 KB.
export type LinkInfo = { url: string; site: string; title: string; description: string };

const privateIp = (a: string) => /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(a)
  || /^(::1?|f[cd][0-9a-f]{2}:|fe[89ab][0-9a-f]:|::ffff:(10|127|192\.168|169\.254)\.)/i.test(a);
async function publicUrl(raw: string): Promise<URL | null> {
  let u: URL; try { u = new URL(raw); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password || (u.port && !["80", "443"].includes(u.port))) return null;
  const h = u.hostname.toLowerCase();
  if (!h.includes(".") || /^[\d.]+$/.test(h) || h.includes(":") || /(^|\.)(localhost|local|internal|lan|home)$/.test(h)) return null;
  const addrs = await lookup(h, { all: true }).catch(() => []);
  if (!addrs.length || addrs.some((x) => privateIp(x.address))) return null;
  return u;
}
const decode = (s: string) => s.replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_, e) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " }[e as string] ?? ""))
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(0x10ffff, Number(n)))).replace(/\s+/g, " ").trim();
function meta(html: string, ...names: string[]): string {
  for (const n of names) {
    const re = new RegExp(`<meta\\s(?:[^>"']|"[^"]*"|'[^']*')*?(?:property|name)=["']${n}["'](?:[^>"']|"[^"]*"|'[^']*')*>`, "i"), tag = re.exec(html)?.[0];
    const m = tag && /content=(?:"([^"]*)"|'([^']*)')/i.exec(tag), c = m ? m[1] ?? m[2] : "";
    if (c && c.trim()) return decode(c);
  }
  return "";
}
export async function linkInfo(raw: string): Promise<LinkInfo | null> {
  let u = await publicUrl(String(raw ?? "").trim().slice(0, 2000));
  for (let hop = 0; u && hop < 4; hop++) {
    const r = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(6000), headers: { "user-agent": "Mozilla/5.0 (compatible; OH-SO ED link preview)", accept: "text/html" } }).catch(() => null);
    if (!r) return null;
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) { u = await publicUrl(new URL(r.headers.get("location")!, u).toString()); continue; }
    if (!r.ok || !/html/i.test(r.headers.get("content-type") ?? "")) return null;
    // read at most 600 KB
    const reader = r.body?.getReader(); if (!reader) return null;
    let html = "", got = 0; const dec = new TextDecoder();
    while (got < 600_000) { const { done, value } = await reader.read(); if (done) break; got += value.length; html += dec.decode(value, { stream: true }); if (/<\/head>/i.test(html)) break; }
    reader.cancel().catch(() => {});
    const title = (meta(html, "og:title", "twitter:title") || decode(/<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1] ?? "")).slice(0, 200);
    const description = meta(html, "og:description", "description", "twitter:description").slice(0, 600);
    const site = (meta(html, "og:site_name") || u.hostname.replace(/^www\./, "")).slice(0, 80);
    return title || description ? { url: u.toString(), site, title, description } : null;
  }
  return null;
}
