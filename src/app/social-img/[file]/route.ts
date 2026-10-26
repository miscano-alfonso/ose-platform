import { getImage } from "@/lib/social";

// Pictures made in Admin → Social for posting. Facebook and Instagram fetch them from here, so they are public
// (even while the preview password is on): they only ever hold pictures made for public posts.
export async function GET(_: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const m = file.match(/^([0-9a-f-]{36})\.jpg$/);
  const data = m ? await getImage(m[1]) : null;
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" } });
}
