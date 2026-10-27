import Link from "next/link";
import { getDashboard, getDashboardMore } from "@/lib/admin-data";
import { requireStaff } from "@/lib/auth";
import { money, dayMonth, yearLabel } from "@/lib/format";

const PILL: Record<string, [string, string]> = { failed: ["bad", "Payment failed"], full: ["warn", "Class full"], almost: ["warn", "Almost full"], enquiry: ["info", "New enquiry"], waitlist: ["mute", "Waiting list"],
  clash: ["bad", "Timetable clash"], low: ["warn", "Low attendance"] };
const LOW = 50;
const DAY = (d: string, o: Intl.DateTimeFormatOptions) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { ...o, timeZone: "UTC" });
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase();

/** A small ring gauge, 0–100. */
function Ring({ pct, tone = "brand" }: { pct: number | null; tone?: "brand" | "good" | "warn" | "bad" }) {
  const r = 26, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, pct ?? 0));
  return <svg className={`dx-ring ${tone}`} viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r={r} className="trk" />
    <circle cx="32" cy="32" r={r} className="val" strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 32 32)" /></svg>;
}

const Ico = ({ d }: { d: string }) => <span className="dx-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg></span>;
const I = {
  users: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3 3-5 6-5s6 2 6 5M17 11a3 3 0 1 0 0-6M22 20c0-3-2-5-4-5",
  seat: "M5 11V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v5M3 11h18v5H3zM6 16v4M18 16v4",
  pound: "M16 6a4 4 0 0 0-7 2v4H6M6 12h8M9 12v3c0 2-1 4-3 5h12",
  cal: "M4 6h16v14H4zM4 10h16M9 3v5M15 3v5",
  check: "M4 12l5 5L20 6",
  alert: "M12 3l10 18H2zM12 10v5M12 18h.01",
  meet: "M3 7h12v10H3zM15 11l6-4v10l-6-4",
};

export default async function Dashboard() {
  const [{ t, attention }, m, me] = await Promise.all([getDashboard(), getDashboardMore(LOW), requireStaff()]);
  const pct = t.capacity ? Math.round((t.taken / t.capacity) * 100) : 0;
  const items = [...attention.filter((a) => a.kind === "failed"),
    ...m.clashes.map((c) => ({ kind: "clash", title: c.title, detail: c.detail, href: "/admin/timetable" })),
    ...m.att.low.map((x) => ({ kind: "low", title: `${x.name}: ${x.pct}%`, detail: `${x.level} · ${x.att} of ${x.held} lessons this term`, href: "/admin/attendance" })),
    ...attention.filter((a) => a.kind !== "failed")];
  const counts = items.reduce<Record<string, number>>((a, x) => ({ ...a, [x.kind]: (a[x.kind] ?? 0) + 1 }), {});
  const maxT = Math.max(1, ...m.byTerm.map((x) => x.billed));
  const billed = m.byTerm.reduce((a, x) => a + x.billed, 0);

  // greeting, date and how far through the term we are (London time)
  const hour = Number(m.day.now.slice(0, 2));
  const hello = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const first = (me.name || "").split(" ")[0];
  const todayIso = m.day.today ? m.day.date : new Date().toISOString().slice(0, 10);
  let termLine = "Holidays", termPct = 0;
  if (m.term && t.term_name) {
    const s = Date.parse(m.term.starts_on), e = Date.parse(m.term.ends_on), n = Date.parse(todayIso);
    const weeks = Math.max(1, Math.ceil((e - s + 864e5) / (7 * 864e5))), week = Math.min(weeks, Math.floor((n - s) / (7 * 864e5)) + 1);
    const left = Math.max(0, Math.round((e - n) / 864e5));
    termPct = Math.round(Math.min(1, Math.max(0, (n - s) / (e - s || 1))) * 100);
    termLine = `${t.term_name} · week ${week} of ${weeks} · ${left} day${left === 1 ? "" : "s"} to the end of term`;
  }
  const attTone = m.att.pct == null ? "brand" : m.att.pct >= 90 ? "good" : m.att.pct >= 75 ? "brand" : m.att.pct >= LOW ? "warn" : "bad";

  // lesson status for the timeline
  const st = (l: (typeof m.day.lessons)[number]) => l.status === "cancelled" ? "cancelled" : !m.day.today ? "later" : m.day.now >= l.ends ? "done" : m.day.now >= l.starts ? "live" : "later";
  const nextIdx = m.day.lessons.findIndex((l) => st(l) === "later");

  return <div className="dx">
    <section className="dx-hero">
      <div className="dx-hi">
        <p className="dx-date">{DAY(todayIso, { weekday: "long", day: "numeric", month: "long" })} · {yearLabel(t.year_label)}</p>
        <h1>{hello}{first ? `, ${first}` : ""}</h1>
        <p className="dx-term">{termLine}</p>
        {t.term_name && <div className="dx-prog" role="img" aria-label={`${termPct}% of the term done`}><i style={{ width: `${termPct}%` }} /></div>}
      </div>
      <div className="dx-today">
        <span className="dx-big">{m.day.lessons.filter((l) => l.status !== "cancelled").length}</span>
        <span>lesson{m.day.lessons.length === 1 ? "" : "s"} {m.day.today ? "today" : `on ${DAY(m.day.date, { weekday: "long" })}`}</span>
        {nextIdx >= 0 && <small>Next: {m.day.lessons[nextIdx].starts} {m.day.lessons[nextIdx].name}</small>}
        <div className="dx-acts">
          <Link href="/admin/timetable">Timetable</Link><Link href="/admin/families">Families</Link><Link href="/admin/messages">Messages</Link><Link href="/admin/social">New post</Link>
        </div>
      </div>
      {t.students === 0 && <Link className="dx-flag" href="/admin/import">No families imported yet: import them</Link>}
    </section>

    <div className="dx-kpis">
      <div className="dx-kpi"><Ico d={I.users} /><span className="k">Students enrolled</span><span className="v">{t.students}</span><span className="h">from {t.families} famil{t.families === 1 ? "y" : "ies"}</span></div>
      <div className="dx-kpi ring"><div><span className="k">Class places filled</span><span className="v">{pct}%</span><span className="h">{t.taken} of {t.capacity} places</span></div><Ring pct={pct} /></div>
      <div className="dx-kpi ring"><div><span className="k">Attendance this term</span><span className="v">{m.att.pct == null ? "–" : `${m.att.pct}%`}</span><span className="h">{m.att.pct == null ? "no lessons marked yet" : m.att.low.length ? `${m.att.low.length} below ${LOW}%` : "nobody below 50%"}</span></div><Ring pct={m.att.pct} tone={attTone} /></div>
      <div className="dx-kpi"><Ico d={I.pound} /><span className="k">Collected this year</span><span className="v">{money(t.collected)}</span>
        <div className="dx-meter" role="img" aria-label={`${billed ? Math.round((t.collected / billed) * 100) : 0}% of the year's billing collected`}><i style={{ width: `${billed ? Math.min(100, (t.collected / billed) * 100) : 0}%` }} /></div>
        <span className="h">{billed ? `of ${money(billed)} billed this year` : "paid instalments"}</span></div>
      <div className="dx-kpi"><Ico d={I.cal} /><span className="k">Next charge{t.next_bills_on ? ` · ${dayMonth(t.next_bills_on)}` : ""}</span><span className="v">{money(t.next_amount)}</span><span className="h">{t.next_families} families{t.next_term ? ` · ${t.next_term}` : ""}</span></div>
      <Link href="/admin/payments" className={`dx-kpi${t.failed_count ? " alert" : " ok"}`}><Ico d={t.failed_count ? I.alert : I.check} /><span className="k">Failed payments</span><span className="v">{t.failed_count}</span><span className="h">{t.failed_count ? `${money(t.failed_amount)} to recover` : "Nothing to chase"}</span></Link>
    </div>

    <div className="dx-grid">
      <div className="dx-col">
        <section className="dx-card">
          <header><h2>{m.day.today ? "Today" : `Next lessons · ${DAY(m.day.date, { weekday: "long", day: "numeric", month: "short" })}`}</h2>
            <Link className="dx-more" href="/admin/timetable">Timetable →</Link></header>
          {m.day.lessons.length === 0 ? <p className="empty">No lessons coming up.</p> :
            <ol className="dx-tl">{m.day.lessons.map((l, i) => { const s = st(l); return <li key={i} className={`${s}${i === nextIdx ? " next" : ""}`} style={{ ["--c" as string]: l.colour }}>
              <span className="tm">{l.starts}<small>{l.ends}</small></span>
              <span className="bd"><b>{l.name}</b><span>{l.teacher ?? "No teacher set"} · {l.students} student{l.students === 1 ? "" : "s"} · {l.code}</span></span>
              <span className="ac">{s === "live" ? <span className="dx-live">Live now</span> : s === "done" ? <span className="pill mute">Done</span> : s === "cancelled" ? <span className="pill bad">Cancelled</span> : i === nextIdx ? <span className="pill info">Next</span> : null}
                {l.meet && (s === "live" || i === nextIdx) && <a className="abtn sm" href={l.meet} target="_blank" rel="noopener">Join</a>}</span>
            </li>; })}</ol>}
        </section>

        <section className="dx-card">
          <header><h2>Needs attention</h2>{items.length > 0 && <span className="dx-count">{items.length}</span>}</header>
          {items.length > 0 && <div className="dx-chips">{Object.entries(counts).map(([k, n]) => <span key={k} className={`pill ${PILL[k][0]}`}>{n} · {PILL[k][1].toLowerCase()}</span>)}</div>}
          {items.length === 0 ? <div className="dx-clear"><Ico d={I.check} /><b>All clear</b><span>Nothing needs you right now.</span></div> :
            <div className="dx-list">{items.map((a, i) => <Link className={`dx-item ${PILL[a.kind][0]}`} key={i} href={a.href}>
              <span className="t"><span className={`pill ${PILL[a.kind][0]}`}>{PILL[a.kind][1]}</span><b>{a.title}</b><span>{a.detail}</span></span><span className="go" aria-hidden="true">→</span></Link>)}</div>}
        </section>
      </div>

      <div className="dx-col">
        <section className="dx-card">
          <header><h2>Collections by term</h2><Link className="dx-more" href="/admin/payments">Payments →</Link></header>
          <div className="termbars dx-bars" role="img" aria-label="Collections by term">{m.byTerm.map((x) => <div className="tb" key={x.number} title={`${x.name}: billed ${money(x.billed)}, collected ${money(x.paid)}${x.failed ? `, failed ${money(x.failed)}` : ""}`}>
            <div className="col" style={{ height: `${Math.max(4, (x.billed / maxT) * 100)}%` }}><i style={{ height: `${x.billed ? (x.paid / x.billed) * 100 : 0}%` }} />
              {x.failed > 0 && <i className="bad" style={{ height: `${(x.failed / x.billed) * 100}%`, bottom: `${(x.paid / x.billed) * 100}%` }} />}</div>
            <b>{money(x.billed).replace(/\.\d+$/, "")}</b><span>T{x.number} · {dayMonth(x.bills_on)}</span></div>)}</div>
          <div className="legend"><span><i style={{ background: "var(--bar)" }} />Collected</span><span><i style={{ background: "var(--bad)" }} />Failed</span><span><i style={{ background: "var(--track)" }} />Still to bill</span></div>
        </section>

        <section className="dx-card">
          <header><h2>Latest bookings</h2><Link className="dx-more" href="/admin/families">Families →</Link></header>
          {m.recent.length === 0 ? <p className="empty">No bookings yet.</p> : <div className="dx-people">{m.recent.map((r, i) =>
            <Link key={i} className="dx-person" href={`/admin/families?q=${encodeURIComponent(r.parent)}`}><span className="av">{initials(r.student)}</span>
              <span className="t"><b>{r.student}</b><span>{r.course} · {r.parent}</span></span><span className="amt">{money(r.amount)}<small>{dayMonth(r.on)}</small></span></Link>)}</div>}
        </section>

        <section className="dx-card">
          <header><h2>Coming up</h2><span className="dx-sub">What the system does on its own</span></header>
          <ol className="dx-steps">{m.coming.map((c, i) => <li key={i} className={c.kind}><b>{c.href ? <Link href={c.href}>{c.title}</Link> : c.title}</b><span>{c.detail}</span></li>)}</ol>
        </section>

        <section className="dx-card">
          <header><h2>Fullest classes</h2><Link className="dx-more" href="/admin/classes">All classes →</Link></header>
          {m.fullest.length === 0 ? <p className="empty">No open classes.</p> : <div className="bars">{m.fullest.map((g, i) => <div className="brow" key={i} title={`${g.name}: ${g.taken} of ${g.capacity}`}>
            <span className="lbl"><span className="dot" style={{ background: g.colour }} />{g.name}</span><div className="track"><i className={g.taken >= g.capacity ? "full" : ""} style={{ width: `${Math.min(100, (g.taken / g.capacity) * 100)}%` }} /></div><span className="num">{g.taken}/{g.capacity}</span></div>)}</div>}
        </section>
      </div>
    </div>
  </div>;
}
