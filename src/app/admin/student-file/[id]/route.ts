import { requireStaff } from "@/lib/auth";
import { withSchool } from "@/lib/db";

// A SEND report or other evidence a parent uploaded at registration (school admins only: special-category data).
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const r = await withSchool((q) => q<{ data: Buffer; mime: string; name: string }>(`select data, mime, name from student_files where id = $1`, [id]));
  if (!r[0]) return new Response("Not found", { status: 404 });
  const name = r[0].name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "report";
  return new Response(new Uint8Array(r[0].data), { headers: { "content-type": r[0].mime, "content-disposition": `attachment; filename="${name}"`, "cache-control": "private, no-store" } });
}
