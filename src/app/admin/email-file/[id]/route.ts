import { NextResponse } from "next/server";
import { currentStaff, requireViewer } from "@/lib/auth";
import { withSchool } from "@/lib/db";

export const dynamic = "force-dynamic";
// A file attached to a teacher's email to the school: the admins, or the teacher who sent it. Always a download.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id) || !(await currentStaff())) return new NextResponse("Not found", { status: 404 });
  const me = await requireViewer();
  const f = (await withSchool((q) => q<{ name: string; mime: string; data: Buffer; from_email: string }>(`select a.name, a.mime, a.data, m.from_email::text
    from inbox_attachments a join inbox_messages m on m.id = a.message_id where a.id = $1`, [id])))[0];
  if (!f) return new NextResponse("Not found", { status: 404 });
  const admin = me.role === "school_admin" && !me.viewing;
  if (!admin && f.from_email.toLowerCase() !== me.email.toLowerCase()) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(f.data), { headers: {
    "content-type": "application/octet-stream", "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`,
    "x-content-type-options": "nosniff", "cache-control": "private, no-store" } });
}
