import { requireStaff } from "@/lib/auth";
import { getApplicationFile } from "@/lib/jobs";

// Applicant documents: admins only, always downloaded (never shown inside the site).
export async function GET(_: Request, { params }: { params: Promise<{ id: string; kind: string }> }) {
  await requireStaff();
  const { id, kind } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id) || (kind !== "pgce" && kind !== "cv")) return new Response("Not found", { status: 404 });
  const f = await getApplicationFile(id, kind);
  if (!f?.data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(f.data), { headers: {
    "content-type": f.type ?? "application/octet-stream",
    "content-disposition": `attachment; filename="${(f.name ?? "file").replace(/["\\\r\n]/g, "_")}"`,
    "cache-control": "private, no-store", "x-content-type-options": "nosniff",
  } });
}
