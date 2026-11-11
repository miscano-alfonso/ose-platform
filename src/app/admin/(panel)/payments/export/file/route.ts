import { type NextRequest } from "next/server";
import { currentStaff } from "@/lib/auth";
import { salesInvoicesCsv, paymentsCsv, teacherPayCsv } from "@/lib/accounting-export";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f-]{36}$/i, DAY = /^\d{4}-\d{2}-\d{2}$/;

// Payments → Accounting export: the CSV downloads (admins only).
export async function GET(req: NextRequest) {
  const me = await currentStaff().catch(() => null);
  if (!me || me.role !== "school_admin") return new Response("Not allowed.", { status: 403 });
  const p = req.nextUrl.searchParams, kind = p.get("kind"), term = p.get("term") ?? "", from = p.get("from") ?? "", to = p.get("to") ?? "";
  const f = kind === "invoices" && UUID.test(term) ? await salesInvoicesCsv(term)
    : kind === "pay" && UUID.test(term) ? await teacherPayCsv(term)
    : kind === "payments" && DAY.test(from) && DAY.test(to) && from <= to ? await paymentsCsv(from, to) : null;
  if (!f) return new Response("Choose a term, or a start and end date.", { status: 400 });
  return new Response(f.body, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${f.name}"`, "cache-control": "no-store" } });
}
