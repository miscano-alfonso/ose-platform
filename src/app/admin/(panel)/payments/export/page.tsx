import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { exportCfg, exportTerms } from "@/lib/accounting-export";
import { saveExportCfgAction } from "../../../actions";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Accounting export" };
const day = (d: string) => new Date(d.slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });

// Payments → Accounting export (11 Nov): CSV files for Xero (they open in Excel or Google Sheets too).
export default async function AccountingExport({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  await requireStaff();
  const [c, terms] = await Promise.all([exportCfg(), exportTerms()]);
  const today = new Date().toISOString().slice(0, 10), monthStart = today.slice(0, 8) + "01";
  const years = [...new Set(terms.map((t) => t.year))];
  return <>
    <p className="backlink"><Link className="abtn sm" href="/admin/payments">← Payments</Link></p>
    <div className="top"><div><h1>Accounting export</h1><div className="sub">Files for your accounts in Xero: each term’s invoices, the payments received, and teacher pay. They also open in Excel or Google Sheets. Nothing is sent to Xero from here.</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}

    <section className="card ax-sec"><h2>1. Invoices for a term</h2>
      <p className="muted">One invoice per family for the term, with a line for each child’s course, in Xero’s import layout. Invoice numbers stay the same each time you download (e.g. {c.prefix}-2627-T3-4F2A9C), so importing again won’t make duplicates. In Xero: <b>Business → Invoices → Import</b>.</p>
      {terms.length === 0 ? <p className="empty">No terms yet.</p> : years.map((y) => <div key={y} className="ax-terms"><b className="ax-y">{y}</b>
        {terms.filter((t) => t.year === y).map((t) => <a key={t.id} className="ax-term" href={`/admin/payments/export/file?kind=invoices&term=${t.id}`} download>
          <b>{t.name}</b><span>{t.families} famil{t.families === 1 ? "y" : "ies"} · {money(t.total)}</span><span className="muted">bills {day(t.bills_on)}</span></a>)}</div>)}
    </section>

    <section className="card ax-sec"><h2>2. Payments received</h2>
      <p className="muted">Each term payment recorded on this site between two dates (from Stripe payments you confirmed, and termly payments the site takes), as a bank statement for Xero. The reference is the invoice number, so Xero can suggest the match. In Xero: open the bank account (or your Stripe account) → <b>Import a statement</b>.</p>
      <form method="get" action="/admin/payments/export/file" className="ax-row"><input type="hidden" name="kind" value="payments" />
        <label className="fld">From<input type="date" name="from" defaultValue={monthStart} required /></label>
        <label className="fld">To<input type="date" name="to" defaultValue={today} required /></label>
        <button className="abtn pri" type="submit">Download</button></form>
      <p className="muted" style={{ fontSize: 13.5, margin: "8px 0 0" }}>Payments TechSaga took that haven’t been confirmed under Payments → Stripe payments aren’t included yet, and refunds are left out (they’re done in Stripe). Stripe’s fees come off before money reaches the bank; Stripe’s own Xero app records those.</p>
    </section>

    <section className="card ax-sec"><h2>3. Teacher pay for a term</h2>
      <p className="muted">Each teacher’s lessons, 1:1s and workshops, adjustments and gross pay, from Payroll, to enter in your payroll.</p>
      {years.map((y) => <div key={y} className="ax-terms"><b className="ax-y">{y}</b>
        {terms.filter((t) => t.year === y).map((t) => <a key={t.id} className="ax-term" href={`/admin/payments/export/file?kind=pay&term=${t.id}`} download><b>{t.name}</b><span>teacher pay</span></a>)}</div>)}
    </section>

    <section className="card ax-sec"><h2>Settings for the invoices</h2>
      <form action={saveExportCfgAction} className="ax-row">
        <label className="fld">Sales account code<input name="salesAccount" defaultValue={c.salesAccount} maxLength={10} style={{ width: 120 }} /></label>
        <label className="fld">Tax rate (as named in Xero)<input name="taxType" defaultValue={c.taxType} maxLength={40} style={{ width: 200 }} list="ax-tax" /></label>
        <datalist id="ax-tax"><option value="No VAT" /><option value="Exempt Income" /><option value="20% (VAT on Income)" /></datalist>
        <label className="fld">Invoice number prefix<input name="prefix" defaultValue={c.prefix} maxLength={8} style={{ width: 110 }} /></label>
        <button className="abtn" type="submit">Save</button></form>
      <p className="muted" style={{ fontSize: 13.5, margin: "8px 0 0" }}>Use the account code and tax rate from your Xero chart of accounts; your accountant can confirm them (tuition is often exempt from VAT, or outside it if you aren’t VAT-registered).</p>
    </section>
  </>;
}
