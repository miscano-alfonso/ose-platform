import { withSchool } from "@/lib/db";

// Photos of the people on the People page who aren't teachers (stored in the database), e.g. Systems & Support.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const r = await withSchool((q) => q<{ photo: Buffer; photo_type: string }>(`select photo, photo_type from site_people where id = $1 and photo is not null and archived_at is null`, [id]));
  if (!r[0]) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(r[0].photo), { headers: { "content-type": r[0].photo_type, "cache-control": "public, max-age=31536000, immutable" } });
}
