import { socialItems, validItemId, siteBase } from "@/lib/social";

// Tracked short links from Social posts: /s/<course>?utm_source=<platform>&utm_medium=social&utm_campaign=<course>.
// The page carries the link-preview (Open Graph) tags, then sends the reader on to the course with the tags kept.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = new URL(req.url);
  const base = (await siteBase()) || u.origin;
  const utm = new URLSearchParams();
  for (const k of ["utm_source", "utm_medium", "utm_campaign"]) { const v = u.searchParams.get(k); if (v && /^[A-Za-z0-9_.-]{1,60}$/.test(v)) utm.set(k, v); }
  const it = validItemId(id) ? (await socialItems()).find((x) => x.id === id) : undefined;
  const [path, hash] = (it?.link ?? "/courses").split("#");
  const to = base + path + (utm.size ? "?" + utm : "") + (hash ? "#" + hash : "");
  if (!it) return Response.redirect(to, 302);
  const e = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  const title = it.title + (it.subtitle ? ` (${it.subtitle})` : "");
  const img = it.cover ? (it.cover.startsWith("http") ? it.cover : base + it.cover) : base + "/brand/logo";
  return new Response(`<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>${e(title)} · OH-SO ED</title>
<meta property="og:type" content="website"><meta property="og:site_name" content="OH-SO ED Online School"><meta property="og:title" content="${e(title)}">
<meta property="og:description" content="${e(it.summary.slice(0, 300))}"><meta property="og:url" content="${e(base + "/s/" + id)}"><meta property="og:image" content="${e(img)}">
<meta name="twitter:card" content="summary_large_image"><meta name="robots" content="noindex"><link rel="canonical" href="${e(base + path)}">
<meta http-equiv="refresh" content="0;url=${e(to)}"></head><body><p><a href="${e(to)}">${e(title)}</a></p></body></html>`, { headers: { "content-type": "text/html; charset=utf-8" } });
}
