import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { reportPdf } from "@/lib/report-pdf";

// 26 Nov: a student's report as the PDF parents are emailed (approved subjects only).
export const dynamic = "force-dynamic";
export async function GET(_: Request, { params }: { params: Promise<{ id: string; sid: string }> }) {
  await requireStaff();
  const { id, sid } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f-]{36}$/.test(sid)) return new NextResponse("Not found", { status: 404 });
  const pdf = await reportPdf(id, sid);
  if (!pdf) return new NextResponse("No approved subjects in this report yet.", { status: 404 });
  return new NextResponse(Buffer.from(pdf.bytes), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${pdf.filename}"`, "cache-control": "no-store" } });
}
