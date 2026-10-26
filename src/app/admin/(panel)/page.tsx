import Link from "next/link";
import { getDashboard, getDashboardMore } from "@/lib/admin-data";
import { money, dayMonth, yearLabel } from "@/lib/format";

const PILL: Record<string, [string, string]> = { failed: ["bad", "Payment failed"], full: ["warn", "Class full"], almost: ["warn", "Almost full"], enquiry: ["info", "New enquiry"], waitlist: ["mute", "Waiting list"],
  clash: ["bad", "Timetable clash"], low: ["warn", "Low attendance"] };
const LOW = 50;

export default async function Dashboard() {
  const [{ t, attention }, m] = await Promise.all([getDashboard(), getDashboardMore(LOW)]);
  const pct = t.capacity ? Math.round((t.taken / t.capacity) * 100) : 0;
  // same order as the prototype: failed payments, clashes, low attendance, then classes, enquiries, waiting lists
  const items = [...attention.filter((a) => a.kind === "failed"),
    ...m.clashes.map((c) => ({ kind: "clash", title: c.title, detail: c.detail, href: "/admin/timetable" })),
    ...m.att.low.map((x) => ({ kind: "low", title: `${x.name}: ${x.pct}%`, detail: `${x.level} · ${x.att} of ${x.held} lessons this term`, href: "/admin/attendance" })),
    ...attention.filter((a) => a.kind !== "failed")];
  const maxT = Math.max(1, ...m.byTerm.map((x) => x.billed));
  return <>
    <div className="top"><div><h1>Dashboard</h1><div className="sub">{yearLabel(t.year_label)}{t.term_name ? ` · ${t.term_name}` : " · Holidays"}</div></div><span className="grow" />
      {t.students === 0 && <Link className="tag" href="/admin/import">No families imported yet: import them</Link>}</div>
    <div className="tiles" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))" }}>
      <div className="tile"><span className="k">Students enrolled</span><span className="v">{t.students}</span><span className="h">from {t.families} famil{t.families === 1 ? "y" : "ies"}</span></div>
      <div className="tile"><span className="k">Class places filled</span><span className="v">{pct}%</span><span className="h">{t.taken} of {t.capacity} places</span></div>
      <div className="tile"><span className="k">Collected this year</span><span className="v">{money(t.collected)}</span><span className="h">paid instalments</span></div>
      <div className="tile"><span className="k">Next charge{t.next_bills_on ? ` · ${dayMonth(t.next_bills_on)}` : ""}</span><span className="v">{money(t.next_amount)}</span><span className="h">{t.next_families} families{t.next_term ? ` · ${t.next_term}` : ""}</span></div>
      <div className="tile"><span className="k">Attendance this term</span><span className="v">{m.att.pct == null ? "–" : `${m.att.pct}%`}</span><span className="h">{m.att.pct == null ? "no lessons marked yet" : `${m.att.low.length} below ${LOW}%`}</span></div>
      <div className={`tile${t.failed_count ? " alert" : ""}`}><span className="k">Failed payments</span><span className="v">{t.failed_count}</span><span className="h">{t.failed_count ? `${money(t.failed_amount)} to recover` : "Nothing to chase"}</span></div>
    </div>
    <div className="dgrid">
      <div className="dstack">
        <section className="card"><h2>Needs attention</h2><p className="cs">{items.length ? "Sorted with failed payments first." : "All clear."}</p>
          {items.length === 0 ? <p className="empty">Nothing needs you right now.</p> :
            items.map((a, i) => <div className="li" key={i}><span className={`pill ${PILL[a.kind][0]}`}>{PILL[a.kind][1]}</span>
              <div className="t"><b>{a.title}</b><span>{a.detail}</span></div><Link className="abtn sm" href={a.href}>Open</Link></div>)}
        </section>
        <section className="card"><h2>Collections by term</h2><p className="cs">Shaded = collected; the full bar is what each term bills.</p>
          <div className="termbars" role="img" aria-label="Collections by term">{m.byTerm.map((x) => <div className="tb" key={x.number} title={`${x.name}: billed ${money(x.billed)}, collected ${money(x.paid)}${x.failed ? `, failed ${money(x.failed)}` : ""}`}>
            <div className="col" style={{ height: `${Math.max(4, (x.billed / maxT) * 100)}%` }}><i style={{ height: `${x.billed ? (x.paid / x.billed) * 100 : 0}%` }} />
              {x.failed > 0 && <i className="bad" style={{ height: `${(x.failed / x.billed) * 100}%`, bottom: `${(x.paid / x.billed) * 100}%` }} />}</div>
            <b>{money(x.billed).replace(/\.\d+$/, "")}</b><span>T{x.number} · {dayMonth(x.bills_on)}</span></div>)}</div>
          <div className="legend"><span><i style={{ background: "var(--bar)" }} />Collected</span><span><i style={{ background: "var(--bad)" }} />Failed</span><span><i style={{ background: "var(--track)" }} />Still to bill</span></div></section>
      </div>
      <div className="dstack">
        <section className="card"><h2>Latest bookings from the website</h2><p className="cs">Parents book and pay online. You don’t need to do anything.</p>
          {m.recent.length === 0 ? <p className="empty">No bookings yet.</p> : m.recent.map((r, i) => <div className="li" key={i}><span className="pill good">Booked</span>
            <div className="t"><b>{r.student} · {r.course}</b><span>{r.parent} · {dayMonth(r.on)} · {money(r.amount)} a year</span></div><Link className="abtn sm" href={`/admin/families?q=${encodeURIComponent(r.parent)}`}>Family</Link></div>)}</section>
        <section className="card"><h2>Coming up</h2><p className="cs">What the system does on its own.</p>
          {m.coming.map((c, i) => <div className="li" key={i}><span className={`pill ${c.kind}`}>{c.kind === "mute" ? (c.title.startsWith("No ") ? "Quiet" : "Holiday") : "Scheduled"}</span>
            <div className="t"><b>{c.title}</b><span>{c.detail}</span></div>{c.href && <Link className="abtn sm" href={c.href}>Open</Link>}</div>)}</section>
        <section className="card"><h2>Fullest classes</h2><p className="cs">Students per class against its capacity.</p>
          {m.fullest.length === 0 ? <p className="empty">No open classes.</p> : <div className="bars">{m.fullest.map((g, i) => <div className="brow" key={i} title={`${g.name}: ${g.taken} of ${g.capacity}`}>
            <span className="lbl"><span className="dot" style={{ background: g.colour }} />{g.name}</span><div className="track"><i className={g.taken >= g.capacity ? "full" : ""} style={{ width: `${Math.min(100, (g.taken / g.capacity) * 100)}%` }} /></div><span className="num">{g.taken}/{g.capacity}</span></div>)}</div>}
          <div style={{ marginTop: 12 }}><Link className="abtn sm" href="/admin/classes">All classes</Link></div></section>
      </div>
    </div>
  </>;
}
