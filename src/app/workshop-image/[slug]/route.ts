import { withSchool } from "@/lib/db";

// Workshop pictures uploaded in the admin (stored in the database), for the More page.
export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await withSchool((q) => q<{ image: Buffer; image_type: string }>(`select image, image_type from workshops where slug = $1 and image is not null and status in ('published', 'completed')`, [slug]));
  if (!r[0]) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(r[0].image), { headers: { "content-type": r[0].image_type, "cache-control": "public, max-age=31536000, immutable" } });
}
