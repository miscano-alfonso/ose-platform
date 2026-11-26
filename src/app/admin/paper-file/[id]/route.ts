import { requireSignedIn } from "@/lib/auth";
import { paperFile } from "@/lib/past-papers";

// 26 Nov: a past paper sent for marking (?marked=1: the marked one sent back). Admins, or the paper's teacher once it's paid.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await requireSignedIn();   // an admin always (even while Viewing as)
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const marked = new URL(req.url).searchParams.get("marked") === "1";
  const r = await paperFile({ id: me.id, role: me.role }, id, marked);
  if (!r) return new Response("Not found", { status: 404 });
  const name = r.file_name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "paper";
  return new Response(new Uint8Array(r.file), { headers: { "content-type": r.file_type, "content-disposition": `attachment; filename="${name}"`, "cache-control": "private, no-store" } });
}
