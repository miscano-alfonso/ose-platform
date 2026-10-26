import { NextResponse, type NextRequest } from "next/server";
import { currentStaff } from "@/lib/auth";
import { payrollTerm } from "@/lib/payroll";
import { withSchool } from "@/lib/db";

// Payroll → Export for payroll (CSV) and each teacher's payslip (a printable page). Gross pay only.
export const dynamic = "force-dynamic";
const gbp = (p: number) => (p / 100).toFixed(2);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

export async function GET(req: NextRequest) {
  const me = await currentStaff();
  if (!me || me.role !== "school_admin") return NextResponse.json({ error: "Sign in to the admin again." }, { status: 401 });
  const n = Number(req.nextUrl.searchParams.get("term")), teacher = req.nextUrl.searchParams.get("teacher");
  const d = await payrollTerm(n || null);
  if (!d.term) return NextResponse.json({ error: "No term." }, { status: 404 });
  const school = (await withSchool((q) => q<{ name: string }>(`select coalesce(legal_name, name) as name from schools where id = current_school()`)))[0]?.name ?? "";
  if (!teacher) {
    const head = ["Teacher", ...d.levels.map((l) => `${l} lessons`), "Lesson pay", "1:1s and workshops", "1:1 and workshop pay", "Adjustment", "Adjustment note", "Gross pay"];
    const csv = [head, ...d.rows.map((r) => [r.teacher, ...d.levels.map((l) => String(r.by_level[l] ?? 0)), gbp(r.lesson_pay), String(r.extras), gbp(r.extras_pay), gbp(r.adj), r.adj_note ?? "", gbp(r.gross)])]
      .map((row) => row.map((c) => /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c).join(",")).join("\r\n");
    return new NextResponse(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="payroll-${d.term.name.replace(/\W+/g, "-")}.csv"`, "cache-control": "no-store" } });
  }
  const r = d.rows.find((x) => x.teacher_id === teacher);
  if (!r) return NextResponse.json({ error: "No pay for that teacher this term." }, { status: 404 });
  const day = new Date(d.term.pay_date + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>Payslip · ${esc(r.teacher)} · ${esc(d.term.name)}</title>
<style>body{font:15px/1.5 system-ui,sans-serif;color:#171b2b;max-width:640px;margin:32px auto;padding:0 16px}h1{font-size:22px;margin:0}table{width:100%;border-collapse:collapse;margin:16px 0}td,th{padding:7px 4px;border-bottom:1px solid #dfe2ea;text-align:left}td.n,th.n{text-align:right}.muted{color:#5c6378}@media print{button{display:none}}</style></head>
<body><button onclick="print()" style="float:right">Print</button><h1>${esc(school)}</h1><p class="muted">Payslip (gross) · ${esc(d.term.name)} · paid ${day}</p>
<p><b>${esc(r.teacher)}</b></p><table><tr><th>Item</th><th class="n">Number</th><th class="n">Amount</th></tr>
${d.levels.filter((l) => r.by_level[l]).map((l) => `<tr><td>${esc(l)} lessons</td><td class="n">${r.by_level[l]}</td><td class="n"></td></tr>`).join("")}
<tr><td>Lesson pay</td><td class="n">${r.lessons}</td><td class="n">£${gbp(r.lesson_pay)}</td></tr>
${r.extras ? `<tr><td>1:1s and workshops</td><td class="n">${r.extras}</td><td class="n">£${gbp(r.extras_pay)}</td></tr>` : ""}
${r.adj ? `<tr><td>${esc(r.adj_note || "Adjustment")}</td><td class="n"></td><td class="n">£${gbp(r.adj)}</td></tr>` : ""}
<tr><th>Gross pay</th><th></th><th class="n">£${gbp(r.gross)}</th></tr></table>
<p class="muted">Gross pay only. Tax, National Insurance and pension are worked out by the payroll provider.</p></body></html>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
