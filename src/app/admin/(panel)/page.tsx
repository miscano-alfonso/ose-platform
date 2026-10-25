import Link from "next/link";
import { getDashboard } from "@/lib/admin-data";
import { money, dayMonth, yearLabel } from "@/lib/format";

const PILL: Record<string, [string, string]> = { failed: ["bad", "Payment failed"], full: ["warn", "Class full"], almost: ["warn", "Almost full"], enquiry: ["info", "New enquiry"], waitlist: ["mute", "Waiting list"] };

export default async function Dashboard() {
  const { t, attention } = await getDashboard();
  const pct = t.capacity ? Math.round((t.taken / t.capacity) * 100) : 0;
  return <>
    <div className="top"><div><h1>Dashboard</h1><div className="sub">{yearLabel(t.year_label)}{t.term_name ? ` · ${t.term_name}` : ""}</div></div><span className="grow" />
      {t.students === 0 && <span className="tag">No families imported yet</span>}</div>
    <div className="tiles">
      <div className="tile"><span className="k">Students enrolled</span><span className="v">{t.students}</span><span className="h">from {t.families} famil{t.families === 1 ? "y" : "ies"}</span></div>
      <div className="tile"><span className="k">Class places filled</span><span className="v">{pct}%</span><span className="h">{t.taken} of {t.capacity} places</span></div>
      <div className="tile"><span className="k">Collected this year</span><span className="v">{money(t.collected)}</span><span className="h">paid instalments</span></div>
      <div className="tile"><span className="k">Next charge{t.next_bills_on ? ` · ${dayMonth(t.next_bills_on)}` : ""}</span><span className="v">{money(t.next_amount)}</span><span className="h">{t.next_families} families{t.next_term ? ` · ${t.next_term}` : ""}</span></div>
      <div className="tile"><span className="k">Enquiries to answer</span><span className="v">{t.enquiries_open}</span><span className="h">{t.waiting} on waiting lists</span></div>
      <div className={`tile${t.failed_count ? " alert" : ""}`}><span className="k">Failed payments</span><span className="v">{t.failed_count}</span><span className="h">{money(t.failed_amount)} to recover</span></div>
    </div>
    <section className="card"><h2>Needs attention</h2><p className="cs">Failed payments first, then full classes, enquiries and waiting lists.</p>
      {attention.length === 0 ? <p className="empty">Nothing needs attention right now.</p> :
        attention.map((a, i) => <div className="li" key={i}><span className={`pill ${PILL[a.kind][0]}`}>{PILL[a.kind][1]}</span>
          <div className="t"><b>{a.title}</b><span>{a.detail}</span></div><Link className="abtn sm" href={a.href}>Open</Link></div>)}
    </section>
  </>;
}
