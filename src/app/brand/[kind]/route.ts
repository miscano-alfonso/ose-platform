import { getBrandAsset, DEFAULT_SRC, type BrandKind } from "@/lib/brand";

// Uploaded logo / browser icon. SVGs are served locked down so nothing inside them can run.
export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (kind !== "logo" && kind !== "icon") return new Response("Not found", { status: 404 });
  const a = await getBrandAsset(kind as BrandKind).catch(() => null);
  // emails and link previews use this address, and they need a PNG rather than the SVG the pages use
  if (!a) return Response.redirect(new URL(kind === "logo" ? "/ose-logo-white.png" : DEFAULT_SRC[kind as BrandKind], req.url), 307);
  return new Response(new Uint8Array(a.data), { headers: {
    "content-type": a.mime,
    "cache-control": "public, max-age=31536000, immutable",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
    "x-content-type-options": "nosniff",
  } });
}
