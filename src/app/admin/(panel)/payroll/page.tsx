import { getPayroll } from "@/lib/payroll";
import { money } from "@/lib/format";
import { setLevelRateAction, buildPayRunAction, setAdjustmentAction, setRunStatusAction } from "../../actions";

const day = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long" });

export default async function Payroll({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { rates, terms } = await getPayroll();
  return <>
    <div className="top"><div><h1>Payroll</h1><div className="sub">Teachers are paid per lesson taught (from the registers), plus 1:1s and workshops, on the Friday a week after each term ends.</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}

    <section className="card"><h2>Pay per lesson</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>{rates.map((r) => <form key={r.level_id} action={setLevelRateAction} className="eform">
        <input type="hidden" name="level" value={r.level_id} />
        <label className="fld">{r.level}<input name="rate" inputMode="decimal" defaultValue={r.rate != null ? (r.rate / 100).toFixed(2) : ""} placeholder="£" style={{ width: 90 }} /></label>
        <button className="abtn sm" type="submit">Save</button></form>)}</div>
      <p className="cs" style={{ marginTop: 8 }}>A new rate applies to lessons from today; earlier lessons keep the rate in force on their date.</p></section>

    {terms.map((t) => <section className="card" key={t.id}>
      <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}><h2 style={{ margin: 0 }}>{t.name}</h2>
        <span className="muted">Pay day {day(t.pay_date)}</span>
        {t.status && <span className={`pill ${t.status === "paid" ? "good" : t.status === "approved" ? "info" : "warn"}`}>{t.status === "draft" ? "Draft" : t.status === "approved" ? "Approved" : "Paid"}</span>}
        <span className="grow" />
        {(!t.status || t.status === "draft") && <form action={buildPayRunAction}><input type="hidden" name="term" value={t.id} /><button className="abtn sm" type="submit">{t.run_id ? "Refresh from registers" : "Create pay run"}</button></form>}
        {t.status === "draft" && <RunBtn id={t.run_id!} to="approved" label="Approve" pri />}
        {t.status === "approved" && <><RunBtn id={t.run_id!} to="paid" label="Mark as paid" pri /><RunBtn id={t.run_id!} to="draft" label="Back to draft" /></>}
      </div>
      {!t.run_id ? (t.preview.length === 0 ? <p className="empty">No lessons marked as taught yet.</p> :
        <div className="tw" style={{ marginTop: 10 }}><table><thead><tr><th>Teacher</th><th>Lessons taught</th><th>Lesson pay</th><th>1:1s and workshops</th><th>So far</th></tr></thead>
          <tbody>{t.preview.map((p) => <tr key={p.teacher}><td>{p.teacher}</td><td>{p.lessons}</td><td>{money(p.pay)}</td><td>{p.extras ? `${p.extras} · ${money(p.extras_pay)}` : "—"}</td><td><b>{money(p.pay + p.extras_pay)}</b></td></tr>)}</tbody></table></div>)
      : <div className="tw" style={{ marginTop: 10 }}><table><thead><tr><th>Teacher</th><th>Lessons</th><th>Lesson pay</th><th>1:1s and workshops</th><th>Adjustment</th><th>Total</th></tr></thead>
          <tbody>{t.lines.map((l) => <tr key={l.id}><td>{l.teacher}</td><td>{l.lessons}</td><td>{money(l.lessons_pence)}</td><td>{l.extras ? `${l.extras} · ${money(l.extras_pence)}` : "—"}</td>
            <td>{t.status === "draft" ? <form action={setAdjustmentAction} className="eform" style={{ gap: 6 }}><input type="hidden" name="id" value={l.id} />
              <input name="amount" inputMode="decimal" defaultValue={l.adjustments_pence ? (l.adjustments_pence / 100).toFixed(2) : ""} placeholder="£ (− to deduct)" style={{ width: 110 }} className="mini" />
              <input name="note" defaultValue={l.adjustment_note ?? ""} placeholder="Reason" maxLength={120} className="mini" /><button className="abtn sm" type="submit">Save</button></form>
              : l.adjustments_pence ? `${money(l.adjustments_pence)} · ${l.adjustment_note ?? ""}` : "—"}</td>
            <td><b>{money(l.gross_pence)}</b></td></tr>)}
            <tr><td colSpan={5}><b>Total</b></td><td><b>{money(t.lines.reduce((n, l) => n + l.gross_pence, 0))}</b></td></tr></tbody></table></div>}
    </section>)}
    <p className="note">Only lessons whose register was saved as “taught” are paid. Approving locks the figures; refresh a draft after late registers come in.</p>
  </>;
}

function RunBtn({ id, to, label, pri }: { id: string; to: string; label: string; pri?: boolean }) {
  return <form action={setRunStatusAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="to" value={to} /><button className={`abtn sm${pri ? " pri" : ""}`} type="submit">{label}</button></form>;
}
