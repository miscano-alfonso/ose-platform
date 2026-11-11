import "server-only";
import { withSchool } from "./db";

// Accounting export (11 Nov): files the bookkeeper imports into Xero (they also open in Excel or Google Sheets).
//  - Sales invoices: one invoice per family per term, a line per child's course, in Xero's sales-invoice import layout.
//  - Payments received: every payment (and refund) this site has recorded, in Xero's bank-statement import layout,
//    with the invoice numbers as the reference so Xero can suggest the match.
//  - Teacher pay: each teacher's lessons and gross pay for a term, to enter in payroll.
// Nothing is sent to Xero: these are downloads. A direct Xero connection can come later.

export type ExportCfg = { salesAccount: string; taxType: string; prefix: string };
export const DEFAULT_EXPORT: ExportCfg = { salesAccount: "200", taxType: "No VAT", prefix: "OSE" };
export async function exportCfg(): Promise<ExportCfg> {
  const v = await withSchool((q) => q<{ value: Partial<ExportCfg> }>(`select value from meet_kv where key = 'accounting_export'`)).then((r) => r[0]?.value ?? {}).catch(() => ({} as Partial<ExportCfg>));
  return { salesAccount: v.salesAccount || DEFAULT_EXPORT.salesAccount, taxType: v.taxType || DEFAULT_EXPORT.taxType, prefix: v.prefix || DEFAULT_EXPORT.prefix };
}
export async function saveExportCfg(c: ExportCfg) {
  const clean = { salesAccount: c.salesAccount.replace(/[^\w.-]/g, "").slice(0, 10) || DEFAULT_EXPORT.salesAccount, taxType: c.taxType.replace(/[^\w %().-]/g, "").slice(0, 40) || DEFAULT_EXPORT.taxType,
    prefix: c.prefix.replace(/[^A-Za-z0-9-]/g, "").slice(0, 8).toUpperCase() || DEFAULT_EXPORT.prefix };
  await withSchool((q) => q(`insert into meet_kv (school_id, key, value) values (current_school(), 'accounting_export', $1) on conflict (school_id, key) do update set value = excluded.value, updated_at = now()`, [JSON.stringify(clean)]));
}

export type ExportTerm = { id: string; number: number; name: string; year: string; bills_on: string; families: number; total: number };
/** This year's and last year's terms, with how many families and how much is invoiced in each. */
export async function exportTerms(): Promise<ExportTerm[]> {
  return withSchool((q) => q<ExportTerm>(`select t.id, t.number, t.name, y.label as year, t.bills_on::text,
      (select count(distinct s.parent_id)::int from instalments i join enrolments e on e.id = i.enrolment_id join students s on s.id = e.student_id where i.term_id = t.id and i.status not in ('cancelled', 'waived')) as families,
      (select coalesce(sum(i.amount_pence), 0)::int from instalments i where i.term_id = t.id and i.status not in ('cancelled', 'waived')) as total
    from terms t join academic_years y on y.id = t.academic_year_id where y.ends_on >= current_date - 365 order by y.starts_on desc, t.number`));
}

const cell = (v: string | number | null | undefined) => { const s = v == null ? "" : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csv = (head: string[], rows: (string | number | null)[][]) => "﻿" + [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
const ukDate = (d: string) => { const [y, m, dd] = d.slice(0, 10).split("-"); return `${dd}/${m}/${y}`; };
const pounds = (p: number) => (p / 100).toFixed(2);
/** Stable invoice number: prefix, year, term and the family (e.g. OSE-2627-T3-4F2A9C). */
export const invoiceNo = (prefix: string, year: string, term: number, parentId: string) => `${prefix}-${year.replace(/\D/g, "").slice(-4)}-T${term}-${parentId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;

/** Xero sales-invoice import: one invoice per family for the term, one line per child's course. */
export async function salesInvoicesCsv(termId: string): Promise<{ name: string; body: string; rows: number } | null> {
  const c = await exportCfg();
  return withSchool(async (q) => {
    const t = (await q<{ number: number; name: string; year: string }>(`select t.number, t.name, y.label as year from terms t join academic_years y on y.id = t.academic_year_id where t.id = $1`, [termId]))[0];
    if (!t) return null;
    const rows = await q<{ parent_id: string; contact: string; email: string; child: string; course: string; due: string; amount: number }>(`
      select p.id as parent_id, p.first_name || ' ' || p.last_name as contact, p.email::text as email, s.first_name || ' ' || s.last_name as child,
        l.name || ' ' || sj.name as course, i.due_on::text as due, i.amount_pence as amount
      from instalments i join enrolments e on e.id = i.enrolment_id join students s on s.id = e.student_id join parents p on p.id = s.parent_id
        join course_groups g on g.id = e.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
      where i.term_id = $1 and i.status not in ('cancelled', 'waived') and i.amount_pence > 0
      order by p.last_name, p.first_name, s.first_name, l.sort_order, sj.name`, [termId]);
    // an invoice's date and due date: the family's earliest payment date for the term
    const due = new Map<string, string>(); for (const r of rows) if (!due.has(r.parent_id) || r.due < due.get(r.parent_id)!) due.set(r.parent_id, r.due);
    const head = ["*ContactName", "EmailAddress", "POAddressLine1", "POAddressLine2", "POAddressLine3", "POAddressLine4", "POCity", "PORegion", "POPostalCode", "POCountry",
      "*InvoiceNumber", "Reference", "*InvoiceDate", "*DueDate", "InventoryItemCode", "*Description", "*Quantity", "*UnitAmount", "Discount", "*AccountCode", "*TaxType",
      "TrackingName1", "TrackingOption1", "TrackingName2", "TrackingOption2", "Currency", "BrandingTheme"];
    const out = rows.map((r) => { const d = due.get(r.parent_id)!;
      return [r.contact, r.email, "", "", "", "", "", "", "", "", invoiceNo(c.prefix, t.year, t.number, r.parent_id), `${t.name} ${t.year}`, ukDate(d), ukDate(d), "",
        `${r.child} · ${r.course} · ${t.name} ${t.year}`, 1, pounds(r.amount), "", c.salesAccount, c.taxType, "", "", "", "", "GBP", ""]; });
    return { name: `xero-sales-invoices-${t.year.replace(/\W/g, "")}-term-${t.number}.csv`, body: csv(head, out), rows: due.size };
  });
}

/** Xero bank-statement import: payments and refunds recorded here between two dates (inclusive), newest last. */
export async function paymentsCsv(from: string, to: string): Promise<{ name: string; body: string; rows: number }> {
  const c = await exportCfg();
  return withSchool(async (q) => {
    const rows = await q<{ at: string; kind: string; amount: number; payee: string; parent_id: string; what: string | null; refs: string | null; obj: string | null }>(`
      select l.created_at::date::text as at, l.kind, sum(l.amount_pence)::int as amount, p.first_name || ' ' || p.last_name as payee, p.id as parent_id,
        string_agg(distinct s.first_name || ' ' || lv.name || ' ' || sj.name || ' · ' || t.name, '; ') as what,
        string_agg(distinct y.label || '|' || t.number, ',') as refs, split_part(min(l.stripe_object_id), ':', 1) as obj
      from ledger_entries l join parents p on p.id = l.parent_id
        left join instalments i on i.id = l.instalment_id left join terms t on t.id = i.term_id left join academic_years y on y.id = t.academic_year_id
        left join enrolments e on e.id = i.enrolment_id left join students s on s.id = e.student_id left join course_groups g on g.id = e.group_id
        left join levels lv on lv.id = g.level_id left join subjects sj on sj.id = g.subject_id
      where l.kind in ('charge', 'refund') and l.created_at >= $1::date and l.created_at < $2::date + 1
      group by l.created_at::date, l.kind, p.id, p.first_name, p.last_name, split_part(l.stripe_object_id, ':', 1) order by 1, 4`, [from, to]);
    const out = rows.map((r) => [ukDate(r.at), pounds(r.kind === "refund" ? -Math.abs(r.amount) : r.amount), r.payee,
      `${r.kind === "refund" ? "Refund: " : ""}${r.what ?? "Payment"}`,
      (r.refs ?? "").split(",").filter(Boolean).map((x) => { const [y, n] = x.split("|"); return invoiceNo(c.prefix, y, Number(n), r.parent_id); }).join(" ") || r.obj || ""]);
    return { name: `xero-payments-${from}-to-${to}.csv`, body: csv(["Date", "Amount", "Payee", "Description", "Reference"], out), rows: out.length };
  });
}

/** Each teacher's lessons and gross pay for a term (from Payroll), for entering in payroll. */
export async function teacherPayCsv(termId: string): Promise<{ name: string; body: string; rows: number } | null> {
  const { termPayRows } = await import("./payroll");
  return withSchool(async (q) => {
    const t = (await q<{ id: string; number: number; name: string; year: string; run_id: string | null; status: string | null; pay_date: string }>(`select t.id, t.number, t.name, y.label as year, r.id as run_id, r.status::text,
        coalesce(r.pay_date, term_pay_date(t.id))::text as pay_date from terms t join academic_years y on y.id = t.academic_year_id left join pay_runs r on r.term_id = t.id where t.id = $1`, [termId]))[0];
    if (!t) return null;
    const rows = await termPayRows(q, t);
    const out = rows.map((r) => [r.teacher, `${t.name} ${t.year}`, ukDate(t.pay_date), r.lessons, pounds(r.lesson_pay), r.extras, pounds(r.extras_pay), pounds(r.adj), r.adj_note ?? "", pounds(r.gross), t.status ?? "not started"]);
    return { name: `teacher-pay-${t.year.replace(/\W/g, "")}-term-${t.number}.csv`,
      body: csv(["Teacher", "Term", "Pay date", "Lessons", "Lesson pay (£)", "1:1s and workshops", "1:1 and workshop pay (£)", "Adjustments (£)", "Adjustment note", "Gross pay (£)", "Pay run"], out), rows: out.length };
  });
}
