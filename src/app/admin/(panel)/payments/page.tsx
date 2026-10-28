import Link from "next/link";
import LiveSearch from "../../LiveSearch";
import { getPayments, getPaymentLists } from "@/lib/payments";
import { buildSchedulesAction, setFamilyTermAction } from "../../actions";
import { money } from "@/lib/format";
import { yearLabel } from "@/lib/format";

const STATE: Record<string, string> = { paid: "Paid", scheduled: "To collect", failed: "Failed", part: "Part paid", waived: "Waived", none: "" };
const day = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const termsLabel = (f: { overdue_terms: { n: number }[] }) => { const ns = [...new Set(f.overdue_terms.map((t) => t.n))].sort((a, b) => a - b); return ns.length ? (ns.length === 1 ? `Term ${ns[0]}` : `Terms ${ns.join(", ")}`) : "Earlier term"; };

export default async function Payments({ searchParams }: { searchParams: Promise<{ built?: string; show?: string; q?: string }> }) {
  const sp = await searchParams;
  const [{ year, terms, families, unscheduled }, lists] = await Promise.all([getPayments(), getPaymentLists()]);
  const [bp, bi, bm] = (sp.built ?? "").split("-").map(Number);
  const q = (sp.q ?? "").toLowerCase().trim();
  const diff = (f: (typeof families)[number]) => f.techsaga_next != null && f.next_due > 0 && Math.abs(f.next_due - f.techsaga_next) > 2;
  const list = families.filter((f) => (!q || `${f.name} ${f.email} ${f.kids ?? ""}`.toLowerCase().includes(q)) &&
    (sp.show !== "attention" || f.overdue > 0 || diff(f) || f.unscheduled > 0));
  const yearTotal = terms.reduce((n, t) => n + t.due, 0), yearPaid = terms.reduce((n, t) => n + t.paid, 0);
  return <>
    <div className="top"><div><h1>Payments</h1><div className="sub">{year ? `${yearLabel(year)} · ${money(yearPaid)} paid of ${money(yearTotal)} for the year` : "No school year set up"}</div></div>
      <span className="grow" /><Link className="abtn" href="/admin/payments/stripe">Stripe payments</Link>
      {unscheduled > 0 && <form action={buildSchedulesAction}><button className="abtn pri" type="submit">Create payment schedules ({unscheduled} places)</button></form>}</div>

    {sp.built && <p className="note msg">Payment schedules created for {bp} course places: {bi} termly payments, {bm} of them already paid in TechSaga.</p>}
    {unscheduled > 0 && <p className="note msg">{unscheduled} course places have no payment schedule yet. “Create payment schedules” sets one payment per term at the same price TechSaga charged
      (the whole course split evenly over its terms, less the 3- or 5-course discount), and marks the terms TechSaga recorded as paid. Nothing is charged.</p>}

    <div className="pgrid2"><div className="dstack" style={{ display: "contents" }}>
      <section className="card" style={{ margin: 0 }}><h2>Failed payments</h2><p className="cs">Stripe retries automatically after 3 days. You can also contact the family.</p>
        {lists.failed.length === 0 ? <p className="empty">No failed payments.</p> : lists.failed.map((i) => <div className="li" key={i.id}>
          <span className="pill bad">Failed</span><div className="t"><b>{i.family} · {money(i.amount)}</b><span>{i.student}, {i.course} · Term {i.term} · due {day(i.due_on)}</span></div>
          <Link className="abtn sm" href={`/admin/families?q=${encodeURIComponent(i.family)}`}>Family</Link></div>)}</section>
      <section className="card" style={{ margin: 0 }}><h2>Next 60 days</h2><p className="cs">{lists.upcomingCount} instalment{lists.upcomingCount === 1 ? "" : "s"} scheduled.</p>
        {lists.upcomingCount === 0 ? <p className="empty">{unscheduled ? "Create the payment schedules to see what’s coming." : "Nothing due in the next 60 days."}</p> :
        <div className="tw" style={{ border: 0, marginBottom: 0 }}><table><thead><tr><th>Date</th><th>Family</th><th>Course</th><th className="n">Amount</th></tr></thead><tbody>
          {lists.upcoming.map((i) => <tr key={i.id}><td>{day(i.due_on)}</td><td>{i.family}</td><td>{i.student} · {i.course}</td><td className="n">{money(i.amount)}</td></tr>)}
        </tbody></table></div>}
        {lists.upcomingCount > 12 && <p className="note">and {lists.upcomingCount - 12} more</p>}</section>
    </div></div>
    <section className="card" style={{ marginTop: 16 }}><h2>By term</h2><p className="cs">{year ? yearLabel(year) : ""} totals across every family.</p>
      <div className="tw" style={{ border: 0, marginBottom: 0 }}><table>
      <thead><tr><th>Term</th><th>Bills on</th><th className="n">Places</th><th className="n">Billed</th><th className="n">Collected</th><th className="n">Failed</th><th className="n">To come</th></tr></thead>
      <tbody>{terms.map((t) => <tr key={t.number}>
        <td style={{ whiteSpace: "nowrap" }}><b>Term {t.number}</b></td><td>{day(t.bills_on)}</td><td className="n">{t.places}</td><td className="n">{money(t.due)}</td>
        <td className="n">{t.paid ? money(t.paid) : <span className="muted">—</span>}</td>
        <td className="n" style={{ color: t.failed ? "var(--bad)" : undefined }}>{t.failed ? money(t.failed) : <span className="muted">—</span>}</td>
        <td className="n">{t.scheduled ? money(t.scheduled) : <span className="muted">—</span>}</td></tr>)}
        <tr><td><b>Year</b></td><td /><td /><td className="n"><b>{money(yearTotal)}</b></td><td className="n"><b>{money(yearPaid)}</b></td>
          <td className="n"><b>{money(terms.reduce((n, t) => n + t.failed, 0))}</b></td><td className="n"><b>{money(terms.reduce((n, t) => n + t.scheduled, 0))}</b></td></tr></tbody>
      </table></div>
      <p className="note">Registration fees (£25 per student per year) are collected at checkout and not shown here.</p></section>

    <h2 style={{ font: "600 20px Jost", margin: "22px 0 10px" }}>Families</h2>
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
      <LiveSearch placeholder="Search parent, child or email" label="Search families" />
      <div className="segl" role="group" aria-label="Show">{[["", "All families"], ["attention", "Needs attention"]].map(([k, l]) =>
        <Link key={k} scroll={false} href={`/admin/payments?${new URLSearchParams({ ...(k ? { show: k } : {}), ...(sp.q ? { q: sp.q } : {}) })}`} aria-current={(sp.show ?? "") === k ? "true" : undefined}>{l}</Link>)}</div>
    </div>
    {list.length === 0 ? <p className="empty">{families.length ? "No families match." : "No families yet. Import them under Families first."}</p> :
    <div className="tw"><table>
      <thead><tr><th>Family</th><th>Places</th><th>Paid this year</th><th>Year total</th><th>Next payment</th><th>Check</th></tr></thead>
      {list.map((f) => <tbody key={f.id}><tr>
        <td><b>{f.name}</b><div className="muted" style={{ fontSize: 15.5 }}>{f.email}</div></td>
        <td>{f.places}</td><td>{money(f.paid)}</td><td>{money(f.total)}</td>
        <td>{f.next_on ? <>{money(f.next_due)} <span className="muted">on {day(f.next_on)}</span></> : <span className="muted">None scheduled</span>}</td>
        <td>{f.unscheduled > 0 ? <span className="pill info">No schedule yet</span>
          : f.overdue > 0 ? <>{f.stripe_waiting > 0
              ? <Link className="pill info" href="/admin/payments/stripe" title="A Stripe payment from this family is waiting to be confirmed">{termsLabel(f)}: paid in Stripe, confirm it</Link>
              : <span className="pill warn" title="This term's payment date has passed and no payment is recorded for it in the site yet">{termsLabel(f)}: no payment recorded</span>}
              <div className="muted" style={{ fontSize: 13.5, marginTop: 3 }}>{money(f.overdue)} · payment date {f.overdue_terms.map((t) => day(t.due_on)).filter((v, i, a) => a.indexOf(v) === i).join(", ")}</div></>
          : diff(f) ? <span className="pill warn" title="TechSaga's next payment for this family">TechSaga said {money(f.techsaga_next!)}</span>
          : f.techsaga_next != null ? <span className="pill good">Matches TechSaga</span> : <span className="muted">—</span>}</td>
      </tr>
      {f.grid.length > 0 && <tr className="editrow"><td colSpan={6} style={{ paddingTop: 0 }}>
        <details className="edit"><summary className="abtn sm">Terms</summary>
          <div className="termgrid">{f.grid.map((t) => <div key={t.n} className={`tg tg-${t.status}`}>
            <b>Term {t.n}</b><span>{t.status === "none" ? "—" : money(t.amount)}</span><small>{STATE[t.status]}</small>
            {t.status !== "none" && <div className="tgbtns">
              {(t.status === "scheduled" || t.status === "failed" || t.status === "part") && <><TermBtn parent={f.id} term={t.n} to="paid" label="Mark paid" /><TermBtn parent={f.id} term={t.n} to="waived" label="Waive" /></>}
              {(t.status === "paid" || t.status === "waived") && <TermBtn parent={f.id} term={t.n} to="scheduled" label="Undo" />}
            </div>}
          </div>)}</div>
        </details></td></tr>}
      </tbody>)}
    </table></div>}
    <p className="note">The Check column looks back, not forward: it’s about a term whose payment date has <b>already passed</b> (for example Term 2, 19 Oct), never the next payment. Invoices for the next payment aren’t involved. “Paid in Stripe, confirm it” means the family’s card payment is in <Link href="/admin/payments/stripe">Stripe payments</Link> waiting for you to press Confirm. “No payment recorded” means no Stripe payment from them matches yet (they may have paid another way, or it’s in Stripe under a different email). Open “Terms” on a family to mark a term paid or waive it.</p>
  </>;
}

function TermBtn({ parent, term, to, label }: { parent: string; term: number; to: string; label: string }) {
  return <form action={setFamilyTermAction}><input type="hidden" name="parent" value={parent} /><input type="hidden" name="term" value={term} />
    <input type="hidden" name="to" value={to} /><button className="abtn sm" type="submit">{label}</button></form>;
}
