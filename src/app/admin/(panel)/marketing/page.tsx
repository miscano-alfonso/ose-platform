import Link from "next/link";
import { marketingOverview } from "@/lib/funnel";

export const dynamic = "force-dynamic";
const pc = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

// Marketing overview, as in the prototype: where families drop out between enquiry and booking, ready-made audiences, and how families found the school.
export default async function Marketing() {
  const m = await marketingOverview();
  const f0 = m.stages[0].n || 1, hmax = Math.max(1, ...m.heard.map((h) => h.n));
  const worst = m.stages.slice(1).map((s, i) => ({ from: m.stages[i], to: s, rate: pc(s.n, m.stages[i].n) })).filter((x) => x.from.n > 0).sort((a, b) => a.rate - b.rate)[0];
  const tip = !worst ? null : worst.to.k === "Taster booked" ? "The biggest drop is between enquiring and booking a taster: a friendly follow-up two days after an enquiry is the quickest win."
    : worst.to.k === "Taster attended" ? "The biggest drop is tasters booked but missed: turn on the taster joining-link email under Automations."
    : "The biggest drop is after the taster: turn on the after-taster invitation under Automations, and phone families who loved it.";
  const auds: [string, string, number, string][] = [
    ["enquiries", "Enquired, not booked", m.enquiries - m.courses, "Contact and taster enquiries this school year"],
    ["waiting", "Waiting list", m.waiting, "Ready for an offer when a place opens"],
    ["twocourses", "One course away from 10% off", m.two, "Students taking 2 courses: a third gives 10% off each"],
    ["families", "All enrolled families", m.families, "For term news and re-booking for next year"]];
  return <>
    <div className="top"><div><h1>Marketing</h1><div className="sub">Find new families and bring back the ones you’ve met · since {new Date(m.start + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</div></div>
      <span className="grow" /><Link className="abtn" href="/admin/newsletter">Newsletter</Link></div>
    <div className="tiles">
      <div className="tile"><span className="k">Enquiries this year</span><span className="v">{m.enquiries}</span><span className="h">contact and taster forms</span></div>
      <div className="tile"><span className="k">Tasters booked</span><span className="v">{m.booked}</span><span className="h">{pc(m.booked, m.enquiries)}% of enquiries</span></div>
      <div className="tile"><span className="k">Enquiry to booking</span><span className="v">{pc(m.courses, m.enquiries)}%</span><span className="h">{m.courses} famil{m.courses === 1 ? "y" : "ies"} booked</span></div>
      <div className="tile"><span className="k">Waiting list</span><span className="v">{m.waiting}</span><span className="h">families waiting</span></div>
    </div>
    <div className="grid2"><div className="stack">
      <section className="card"><h2>From enquiry to booking</h2><p className="cs">Where families drop out. Each family is counted once, by email.</p>
        <div className="bars">{m.stages.map((x, i) => <div key={x.k} className="brow" style={{ gridTemplateColumns: "140px minmax(0,1fr) 90px" }}><span className="lbl">{x.k}</span>
          <div className="track" style={{ height: 18 }}><i style={{ width: `${(x.n / f0) * 100}%` }} /></div><span className="num">{x.n}{i ? ` · ${pc(x.n, m.stages[i - 1].n)}%` : ""}</span></div>)}</div>
        {m.enquiries > 0 && tip && <p className="note" style={{ marginTop: 8 }}>{tip}</p>}
        {m.enquiries === 0 && <p className="note" style={{ marginTop: 8 }}>Fills in as enquiries and taster bookings come through the website.</p>}</section>
      <section className="card"><h2>Campaigns</h2><p className="cs">Newsletters and marketing emails, with opens and clicks.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><Link className="abtn pri" href="/admin/newsletter">New newsletter</Link><Link className="abtn" href="/admin/email-stats">Email stats</Link><Link className="abtn" href="/admin/subscribers">Subscribers</Link></div></section>
    </div><div className="stack">
      <section className="card"><h2>Audiences</h2><p className="cs">Ready-made lists that keep themselves up to date.</p><div className="list">
        {auds.map(([k, n, c, d]) => <div key={n} className="li"><div className="t"><b>{n} · {c}</b><span>{d}</span></div><Link className="abtn sm" href={`/admin/email?tab=compose&audience=${k}`}>Email</Link></div>)}</div></section>
      <section className="card"><h2>How families found you</h2><p className="cs">From the booking and contact forms.</p>
        {m.heard.length === 0 ? <p className="muted">No data yet.</p> : <div className="bars">{m.heard.map((h) => <div key={h.k} className="brow"><span className="lbl">{h.k}</span>
          <div className="track"><i style={{ width: `${(h.n / hmax) * 100}%` }} /></div><span className="num">{h.n}</span></div>)}</div>}</section>
    </div></div>
  </>;
}
