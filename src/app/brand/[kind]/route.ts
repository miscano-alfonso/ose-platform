import { getBrandAsset, DEFAULT_SRC, type BrandKind } from "@/lib/brand";
import { activeSchool, siteSchool } from "@/lib/db";

// Uploaded logo / browser icon. SVGs are served locked down so nothing inside them can run.
export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (kind !== "logo" && kind !== "icon") return new Response("Not found", { status: 404 });
  const a = await getBrandAsset(kind as BrandKind).catch(() => null);
  // emails and link previews use this address, and they need a PNG rather than the SVG the pages use
  if (!a) {
    // OH-SO ED's built-in logo is only ever used for OH-SO ED; another school without an upload has no logo here
    if (kind === "logo" && (await activeSchool().catch(() => siteSchool())) !== siteSchool()) return new Response("No logo uploaded", { status: 404 });
    return Response.redirect(new URL(kind === "logo" ? "/ose-logo-white.png" : DEFAULT_SRC[kind as BrandKind], req.url), 307);
  }
  return new Response(new Uint8Array(a.data), { headers: {
    "content-type": a.mime,
    "cache-control": "public, max-age=31536000, immutable",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
    "x-content-type-options": "nosniff",
  } });
}
