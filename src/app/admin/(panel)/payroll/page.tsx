import Link from "next/link";
import { getPayroll, payrollTerm } from "@/lib/payroll";
import { money } from "@/lib/format";
import { setLevelRateAction, buildPayRunAction, setAdjustmentAction, setRunStatusAction } from "../../actions";

export const dynamic = "force-dynamic";
const dm = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
// England and Wales bank holidays this school year (pay day moves to the working day before)
const BANK_HOLS: Record<string, string> = { "2026-12-25": "Christmas Day", "2026-12-28": "Boxing Day (substitute)", "2027-01-01": "New Year’s Day", "2027-03-26": "Good Friday",
  "2027-03-29": "Easter Monday", "2027-05-03": "Early May bank holiday", "2027-05-31": "Spring bank holiday", "2027-08-30": "Summer bank holiday" };

export default async function Payroll({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; term?: string }> }) {
  const sp = await searchParams;
  const [{ rates }, d] = await Promise.all([getPayroll(), payrollTerm(Number(sp.term) || null)]);
  const t = d.term;
  const today = new Date().toISOString().slice(0, 10);
  if (!t) return <><div className="top"><div><h1>Payroll</h1><div className="sub">No terms set up yet.</div></div></div></>;
  const hol = BANK_HOLS[t.pay_date], done = t.ends_on < today, st = t.status ?? "none";
  const total = d.rows.reduce((a, r) => a + r.gross, 0);
  return <>
    <div className="top"><div><h1>Payroll</h1><div className="sub">Teachers are paid per lesson taught, plus 1:1s and workshops · pay day is the Friday after the last day of term</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    <div className="segl" role="tablist" aria-label="Term" style={{ marginBottom: 14 }}>{d.terms.map((x) => <Link key={x.id} href={`/admin/payroll?term=${x.number}`} aria-current={x.id === t.id ? "true" : undefined}>{x.name}</Link>)}</div>
    <div className="tiles">
      <div className={`tile${hol ? " alert" : ""}`}><span className="k">Pay day</span><span className="v" style={{ fontSize: 22 }}>{new Date(t.pay_date + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</span>
        <span className="h">{hol ? `${hol}: banks are closed` : `term ends ${dm(t.ends_on)}`}</span></div>
      <div className="tile"><span className="k">{done ? "Total pay" : "Expected pay"}</span><span className="v">{money(total)}</span><span className="h">{d.rows.length} teachers · gross</span></div>
      <div className="tile"><span className="k">Lessons</span><span className="v">{d.counts.all}</span><span className="h">{d.counts.taught} taught · {d.counts.toCome} still to come</span></div>
      <div className="tile"><span className="k">Pay run</span><span className="v" style={{ fontSize: 20 }}>{{ none: "Not started", draft: "Draft", approved: "Approved", paid: "Paid" }[st]}</span>
        <span className="h">{st === "approved" ? "locked; send to your payroll provider" : st === "paid" ? `paid ${dm(t.pay_date)}` : done ? "ready to approve" : "updates as lessons are taught"}</span></div>
    </div>
    {hol && <p className="note msg">{dm(t.pay_date)} is {hol}. Pay on the working day before instead.</p>}
    <div className="pgrid2" style={{ gridTemplateColumns: "minmax(0,2.3fr) minmax(250px,1fr)", marginTop: 0 }}><div className="dstack">
      <div className="tw" style={{ marginBottom: 0 }}><table><thead><tr><th>Teacher</th>{d.levels.map((l) => <th key={l} className="n">{l}</th>)}<th className="n">1:1s &amp; workshops</th><th className="n">Other</th><th className="n">Gross pay</th><th /></tr></thead><tbody>
        {d.rows.length === 0 ? <tr><td colSpan={d.levels.length + 5} className="muted" style={{ textAlign: "center", padding: 20 }}>No lessons this term.</td></tr> : d.rows.map((r) => <tr key={r.teacher_id}>
          <td style={{ minWidth: 150 }}><b>{r.teacher}</b><br /><span className="muted">{r.taught} of {r.lessons} lessons taught</span></td>
          {d.levels.map((l) => <td key={l} className="n">{r.by_level[l] ?? 0}</td>)}
          <td className="n">{r.extras ? <>{money(r.extras_pay)}<br /><span className="muted">{r.extras} session{r.extras === 1 ? "" : "s"}</span></> : "—"}</td>
          <td className="n">{st === "draft" && r.line_id ? <form action={setAdjustmentAction} style={{ display: "grid", gap: 4, justifyItems: "end" }}><input type="hidden" name="id" value={r.line_id} />
            <input name="amount" inputMode="decimal" defaultValue={r.adj ? (r.adj / 100).toFixed(2) : ""} placeholder="£ (− deducts)" className="mini" style={{ width: 100, textAlign: "right" }} />
            <input name="note" defaultValue={r.adj_note ?? ""} placeholder="Reason" maxLength={120} className="mini" style={{ width: 100 }} /><button className="abtn sm" type="submit">Save</button></form>
            : r.adj ? <span title={r.adj_note ?? ""}>{money(r.adj)}</span> : "—"}</td>
          <td className="n"><b>{money(r.gross)}</b></td>
          <td><a className="abtn sm" href={`/admin/payroll-file?term=${t.number}&teacher=${r.teacher_id}`} target="_blank" rel="noopener">Payslip</a></td></tr>)}
        {d.rows.length > 0 && <tr><td><b>Total</b></td>{d.levels.map((l) => <td key={l} className="n">{d.rows.reduce((a, r) => a + (r.by_level[l] ?? 0), 0)}</td>)}
          <td className="n">{money(d.rows.reduce((a, r) => a + r.extras_pay, 0))}</td><td className="n">{money(d.rows.reduce((a, r) => a + r.adj, 0))}</td><td className="n"><b>{money(total)}</b></td><td /></tr>}
      </tbody></table></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(st === "none" || st === "draft") && <form action={buildPayRunAction}><input type="hidden" name="term" value={t.id} /><button className={`abtn${st === "none" ? " pri" : ""}`} type="submit">{st === "none" ? "Start the pay run" : "Refresh from lessons taught"}</button></form>}
        {st === "draft" && <RunBtn id={t.run_id!} to="approved" label="Approve pay run" pri />}
        {st === "approved" && <><RunBtn id={t.run_id!} to="paid" label="Mark as paid" pri /><RunBtn id={t.run_id!} to="draft" label="Reopen" /></>}
        <a className="abtn" href={`/admin/payroll-file?term=${t.number}`}>Export for payroll</a></div>
      <p className="note">Gross pay only. Your payroll provider works out tax, National Insurance and pension as usual. {done ? "" : "Lessons after today are counted as scheduled, so this figure updates if a lesson is cancelled or covered. "}Lessons count as taught when anyone joins the class’s Google Meet. Start the pay run to add one-off adjustments.</p>
    </div><div className="dstack">
      <section className="card"><h2>Pay per lesson</h2><p className="cs">The same for every teacher at each level. A new rate applies to lessons from today.</p>
        {rates.map((r) => <form key={r.level_id} action={setLevelRateAction} className="li"><input type="hidden" name="level" value={r.level_id} />
          <div className="t"><b>{r.level}</b><span>per lesson taught</span></div>
          <label style={{ display: "flex", alignItems: "center", gap: 4 }}>£<input name="rate" inputMode="decimal" defaultValue={r.rate != null ? (r.rate / 100).toFixed(2) : ""} className="mini" style={{ width: 80, textAlign: "right" }} aria-label={`${r.level} pay per lesson`} /></label>
          <button className="abtn sm" type="submit">Save</button></form>)}</section>
      <section className="card"><h2>Cover and cancellations</h2><p className="cs">Pay follows whoever taught the lesson. Cancelled lessons aren’t paid.</p>
        {d.changes.length === 0 ? <p className="empty">None this term.</p> : d.changes.map((c, i) => <div className="li" key={i}><span className={`pill ${c.kind === "cancelled" ? "bad" : "info"}`}>{c.kind === "cancelled" ? "Cancelled" : "Cover"}</span>
          <div className="t"><b>{c.class} · {dm(c.date)} {c.time}</b><span>{c.note ?? ""}{c.kind === "cover" && c.teacher ? `${c.note ? " · " : ""}paid to ${c.teacher}` : ""}</span></div></div>)}</section>
    </div></div>
  </>;
}

function RunBtn({ id, to, label, pri }: { id: string; to: string; label: string; pri?: boolean }) {
  return <form action={setRunStatusAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="to" value={to} /><button className={`abtn${pri ? " pri" : ""}`} type="submit">{label}</button></form>;
}
