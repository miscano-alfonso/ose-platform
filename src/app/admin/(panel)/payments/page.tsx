import { getPayments } from "@/lib/payments";
import { buildSchedulesAction, setFamilyTermAction } from "../../actions";
import { money } from "@/lib/format";
import { yearLabel } from "@/lib/format";

const STATE: Record<string, string> = { paid: "Paid", scheduled: "To collect", failed: "Failed", part: "Part paid", waived: "Waived", none: "" };
const day = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export default async function Payments({ searchParams }: { searchParams: Promise<{ built?: string; show?: string; q?: string }> }) {
  const sp = await searchParams;
  const { year, terms, families, unscheduled } = await getPayments();
  const [bp, bi, bm] = (sp.built ?? "").split("-").map(Number);
  const q = (sp.q ?? "").toLowerCase().trim();
  const diff = (f: (typeof families)[number]) => f.techsaga_next != null && f.next_due > 0 && Math.abs(f.next_due - f.techsaga_next) > 2;
  const list = families.filter((f) => (!q || `${f.name} ${f.email}`.toLowerCase().includes(q)) &&
    (sp.show !== "attention" || f.overdue > 0 || diff(f) || f.unscheduled > 0));
  const yearTotal = terms.reduce((n, t) => n + t.due, 0), yearPaid = terms.reduce((n, t) => n + t.paid, 0);
  return <>
    <div className="top"><div><h1>Payments</h1><div className="sub">{year ? `${yearLabel(year)} · ${money(yearPaid)} paid of ${money(yearTotal)} for the year` : "No school year set up"}</div></div>
      <span className="grow" />
      {unscheduled > 0 && <form action={buildSchedulesAction}><button className="abtn pri" type="submit">Create payment schedules ({unscheduled} places)</button></form>}</div>

    {sp.built && <p className="note msg">Payment schedules created for {bp} course places: {bi} termly payments, {bm} of them already paid in TechSaga.</p>}
    {unscheduled > 0 && <p className="note msg">{unscheduled} course places have no payment schedule yet. “Create payment schedules” sets one payment per term at the same price TechSaga charged
      (the whole course split evenly over its terms, less the 3- or 5-course discount), and marks the terms TechSaga recorded as paid. Nothing is charged.</p>}

    <div className="tw"><table>
      <thead><tr><th>Term</th><th>Charged on</th><th>Places</th><th>Due</th><th>Paid</th><th>To collect</th><th>Failed</th></tr></thead>
      <tbody>{terms.map((t) => <tr key={t.number}>
        <td><b>Term {t.number}</b></td><td>{day(t.bills_on)}</td><td>{t.places}</td><td>{money(t.due)}</td>
        <td>{t.paid ? money(t.paid) : <span className="muted">—</span>}</td><td>{t.scheduled ? money(t.scheduled) : <span className="muted">—</span>}</td>
        <td>{t.failed ? <span className="pill warn">{money(t.failed)}</span> : <span className="muted">—</span>}</td></tr>)}</tbody>
    </table></div>

    <h2 style={{ font: "600 18px Jost", margin: "22px 0 10px" }}>Families</h2>
    <form className="eform" style={{ marginBottom: 14 }}>
      <label className="fld">Search<input name="q" defaultValue={sp.q} placeholder="Parent or email" /></label>
      <label className="fld">Show<select name="show" defaultValue={sp.show ?? ""}><option value="">All families</option><option value="attention">Needs attention</option></select></label>
      <button className="abtn" type="submit">Filter</button>
    </form>
    {list.length === 0 ? <p className="empty">{families.length ? "No families match." : "No families yet. Import them under Families first."}</p> :
    <div className="tw"><table>
      <thead><tr><th>Family</th><th>Places</th><th>Paid this year</th><th>Year total</th><th>Next payment</th><th>Check</th></tr></thead>
      {list.map((f) => <tbody key={f.id}><tr>
        <td><b>{f.name}</b><div className="muted" style={{ fontSize: 12.5 }}>{f.email}</div></td>
        <td>{f.places}</td><td>{money(f.paid)}</td><td>{money(f.total)}</td>
        <td>{f.next_on ? <>{money(f.next_due)} <span className="muted">on {day(f.next_on)}</span></> : <span className="muted">None scheduled</span>}</td>
        <td>{f.unscheduled > 0 ? <span className="pill info">No schedule yet</span>
          : f.overdue > 0 ? <span className="pill warn">{money(f.overdue)} not recorded as paid</span>
          : diff(f) ? <span className="pill warn" title="TechSaga's next payment for this family">TechSaga said {money(f.techsaga_next!)}</span>
          : f.techsaga_next != null ? <span className="pill good">Matches TechSaga</span> : <span className="muted">—</span>}</td>
      </tr>
      {f.grid.length > 0 && <tr className="editrow"><td colSpan={6} style={{ paddingTop: 0 }}>
        <details className="edit"><summary className="abtn sm">Terms</summary>
          <div className="termgrid">{f.grid.map((t) => <div key={t.n} className={`tg tg-${t.status}`}>
            <b>Term {t.n}</b><span>{t.status === "none" ? "—" : money(t.amount)}</span><small>{STATE[t.status]}</small>
            {t.status !== "none" && <form action={setFamilyTermAction} className="tgbtns">
              <input type="hidden" name="parent" value={f.id} /><input type="hidden" name="term" value={t.n} />
              {(t.status === "scheduled" || t.status === "failed" || t.status === "part") && <><button className="abtn sm" name="to" value="paid">Mark paid</button><button className="abtn sm" name="to" value="waived">Waive</button></>}
              {(t.status === "paid" || t.status === "waived") && <button className="abtn sm" name="to" value="scheduled">Undo</button>}
            </form>}
          </div>)}</div>
        </details></td></tr>}
      </tbody>)}
    </table></div>}
    <p className="note">Card payments through OH-SO ED’s Stripe account come next: once connected, each term’s payments are charged on the date shown, and failed or overdue payments are listed here. “Not recorded as paid” means a term whose charge date has passed but TechSaga’s export (taken on 12 October, before Term 2 was charged on 19 October) didn’t show it as paid. Open “Terms” on a family to mark a term paid or waive it. Card payments never touch terms marked here.</p>
  </>;
}
