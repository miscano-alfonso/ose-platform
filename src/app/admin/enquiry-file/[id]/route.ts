import { requireStaff } from "@/lib/auth";
import { withSchool } from "@/lib/db";

// The paper sent with a past paper marking request (admins only).
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const r = await withSchool((q) => q<{ file: Buffer; file_type: string; file_name: string }>(`select file, file_type, file_name from enquiries where id = $1 and file is not null`, [id]));
  if (!r[0]) return new Response("Not found", { status: 404 });
  const name = r[0].file_name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "paper";
  return new Response(new Uint8Array(r[0].file), { headers: { "content-type": r[0].file_type, "content-disposition": `attachment; filename="${name}"`, "cache-control": "private, no-store" } });
}
