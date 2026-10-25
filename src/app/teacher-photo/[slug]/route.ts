import { withSchool } from "@/lib/db";

// Teacher photos uploaded in the admin (stored in the database).
export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await withSchool((q) => q<{ photo: Buffer; photo_type: string }>(`select photo, photo_type from teachers where slug = $1 and photo is not null and archived_at is null`, [slug]));
  if (!r[0]) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(r[0].photo), { headers: { "content-type": r[0].photo_type, "cache-control": "public, max-age=31536000, immutable" } });
}
