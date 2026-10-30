import { NotifyBell } from "../../NotifyBell";
import Link from "next/link";
import { openFlags, ruleLabel } from "@/lib/chat-safety";
import { getDashboard, getDashboardMore } from "@/lib/admin-data";
import { requireStaff } from "@/lib/auth";
import { inboxList, inboxStatus } from "@/lib/inbox";
import { money, dayMonth, yearLabel } from "@/lib/format";
import { getLayout, mirrorOf } from "@/lib/dashboard-layout";
import { MoreList } from "../MoreList";
import { schoolPlan, notInPlan } from "@/lib/plan";
import { BentoBoard, type BoardModule } from "../BentoBoard";

const PILL: Record<string, [string, string]> = { failed: ["bad", "Payment failed"], full: ["warn", "Class full"], almost: ["warn", "Almost full"], enquiry: ["info", "New enquiry"], waitlist: ["mute", "Waiting list"],
  clash: ["bad", "Timetable clash"], low: ["warn", "Low attendance"], chat: ["bad", "Chat alert"] };
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
  const [{ t, attention }, m, me, flags, box] = await Promise.all([getDashboard(), getDashboardMore(LOW), requireStaff(), openFlags().catch(() => []), inboxStatus().catch(() => null)]);
  const { plan } = await schoolPlan();
  const mail = box?.connected ? await inboxList("new").catch(() => ({ rows: [], unread: 0 })) : { rows: [], unread: 0 };
  const ago = (iso: string) => { const h = (Date.now() - Date.parse(iso)) / 3600e3; return h < 1 ? `${Math.max(1, Math.round(h * 60))} min ago` : h < 24 ? `${Math.round(h)} h ago` : dayMonth(iso.slice(0, 10)); };
  const pct = t.capacity ? Math.round((t.taken / t.capacity) * 100) : 0;
  const items = [...flags.slice(0, 6).map((x) => ({ kind: "chat", title: `${x.rules.includes("wellbeing") ? "Urgent: " : ""}${x.rules.map(ruleLabel).join(", ")} · ${x.sender}`,
      detail: `${x.blocked ? "Blocked: " : ""}“${x.body.length > 70 ? x.body.slice(0, 70) + "…" : x.body}” · ${x.chat}`, href: "/admin/student-chat#alerts" })),
    ...attention.filter((a) => a.kind === "failed"),
    ...m.clashes.map((c) => ({ kind: "clash", title: c.title, detail: c.detail, href: "/admin/timetable-setup#clashes" })),
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

  const tasters = attention.filter((a) => a.kind === "enquiry").length;
  const node = (n: React.ReactNode) => n;
  const kpi = {
    students: <div className="dx-kpi"><Ico d={I.users} /><span className="k">Students enrolled</span><span className="v">{t.students}</span><span className="h">from {t.families} famil{t.families === 1 ? "y" : "ies"}</span></div>,
    places: <div className="dx-kpi ring"><div><span className="k">Class places filled</span><span className="v">{pct}%</span><span className="h">{t.taken} of {t.capacity} places</span></div><Ring pct={pct} /></div>,
    attendance: <div className="dx-kpi ring"><div><span className="k">Attendance this term</span><span className="v">{m.att.pct == null ? "–" : `${m.att.pct}%`}</span><span className="h">{m.att.pct == null ? "no lessons marked yet" : m.att.low.length ? `${m.att.low.length} below ${LOW}%` : "nobody below 50%"}</span></div><Ring pct={m.att.pct} tone={attTone} /></div>,
    collected: <div className="dx-kpi"><Ico d={I.pound} /><span className="k">Collected this year</span><span className="v">{money(t.collected)}</span>
      <div className="dx-meter" role="img" aria-label={`${billed ? Math.round((t.collected / billed) * 100) : 0}% of the year's billing collected`}><i style={{ width: `${billed ? Math.min(100, (t.collected / billed) * 100) : 0}%` }} /></div>
      <span className="h">{billed ? `of ${money(billed)} billed this year` : "paid instalments"}</span></div>,
    next: <div className="dx-kpi"><Ico d={I.cal} /><span className="k">Next charge{t.next_bills_on ? ` · ${dayMonth(t.next_bills_on)}` : ""}</span><span className="v">{money(t.next_amount)}</span><span className="h">{t.next_families} families{t.next_term ? ` · ${t.next_term}` : ""}</span></div>,
    failed: <Link href="/admin/payments" className={`dx-kpi${t.failed_count ? " alert" : " ok"}`}><Ico d={t.failed_count ? I.alert : I.check} /><span className="k">Failed payments</span><span className="v">{t.failed_count}</span><span className="h">{t.failed_count ? `${money(t.failed_amount)} to recover` : "Nothing to chase"}</span></Link>,
  };
  const modules: BoardModule[] = [
    { id: "hero", title: "Greeting and today", node: <section className="dx-hero">
      <div className="dx-hi">
        <p className="dx-date">{DAY(todayIso, { weekday: "long", day: "numeric", month: "long" })} · {yearLabel(t.year_label)} <NotifyBell settingsHref="/admin/notifications" /></p>
        <h1><span className="dx-hello">{hello}{first ? "," : ""}</span>{first ? ` ${first}` : ""}</h1>
        <p className="dx-term">{termLine}</p>
        {t.term_name && <div className="dx-prog" role="img" aria-label={`${termPct}% of the term done`}><i style={{ width: `${termPct}%` }} /></div>}
      </div>
      <div className="dx-today">
        <span className="dx-big">{m.day.lessons.filter((l) => l.status !== "cancelled").length}</span>
        <span>lesson{m.day.lessons.length === 1 ? "" : "s"} {m.day.today ? "today" : `on ${DAY(m.day.date, { weekday: "long" })}`}</span>
        {nextIdx >= 0 && <small>Next: {m.day.lessons[nextIdx].starts} {m.day.lessons[nextIdx].name}</small>}
        <div className="dx-acts"><Link href="/admin/timetable">Timetable</Link><Link href="/admin/families">Families</Link><Link href="/admin/messages">Messages</Link>{!notInPlan(plan, "/admin/social") && <Link href="/admin/social">New post</Link>}</div>
      </div>
      {t.students === 0 && <Link className="dx-flag" href="/admin/import">No families imported yet: import them</Link>}
    </section> },
    { id: "k-students", title: "Students enrolled", node: kpi.students },
    { id: "k-places", title: "Class places filled", node: kpi.places },
    { id: "k-attendance", title: "Attendance", node: kpi.attendance },
    { id: "k-collected", title: "Collected this year", node: kpi.collected },
    { id: "k-next", title: "Next charge", node: kpi.next },
    { id: "k-failed", title: "Failed payments", node: kpi.failed },
    { id: "today", title: m.day.today ? "Today’s lessons" : "Next lessons", node: <section className="dx-card">
      <header><h2>{m.day.today ? "Today" : `Next lessons · ${DAY(m.day.date, { weekday: "long", day: "numeric", month: "short" })}`}</h2><Link className="dx-more" href="/admin/timetable">Timetable →</Link></header>
      {m.day.lessons.length === 0 ? <p className="empty">No lessons coming up.</p> :
        <MoreList as="ol" className="dx-tl" limit={5}>{m.day.lessons.map((l, i) => { const s = st(l); return <li key={i} data-lesson={`${l.name}, ${l.starts}`} className={`${s}${i === nextIdx ? " next" : ""}`} style={{ ["--c" as string]: l.colour }}>
          <span className="tm">{l.starts}<small>{l.ends}</small></span>
          <span className="bd"><b>{l.name}</b><span>{l.teacher ?? "No teacher set"} · {l.students} student{l.students === 1 ? "" : "s"} · {l.code}</span></span>
          <span className="ac">{s === "live" ? <span className="dx-live">Live now</span> : s === "done" ? <span className="pill mute">Done</span> : s === "cancelled" ? <span className="pill bad">Cancelled</span> : i === nextIdx ? <span className="pill info">Next</span> : null}
            {l.meet && (s === "live" || i === nextIdx) && <a className="abtn sm" href={l.meet} target="_blank" rel="noopener">Join</a>}</span>
        </li>; })}</MoreList>}
    </section> },
    { id: "attention", title: "Needs attention", node: <section className="dx-card">
      <header><h2>Needs attention</h2>{items.length > 0 && <span className="dx-count">{items.length}</span>}</header>
      {items.length > 0 && <div className="dx-chips">{Object.entries(counts).map(([k, n]) => <span key={k} className={`pill ${PILL[k][0]}`}>{n} · {PILL[k][1].toLowerCase()}</span>)}</div>}
      {items.length === 0 ? <div className="dx-clear"><Ico d={I.check} /><b>All clear</b><span>Nothing needs you right now.</span></div> :
        <MoreList className="dx-list" limit={4}>{items.map((a, i) => <Link className={`dx-item ${PILL[a.kind][0]}`} key={i} href={a.href}>
          <span className="t"><span className={`pill ${PILL[a.kind][0]}`}>{PILL[a.kind][1]}</span><b>{a.title}</b><span>{a.detail}</span></span><span className="go" aria-hidden="true">→</span></Link>)}</MoreList>}
    </section> },
    { id: "collections", title: "Collections by term", node: <section className="dx-card">
      <header><h2>Collections by term</h2><Link className="dx-more" href="/admin/payments">Payments →</Link></header>
      <div className="termbars dx-bars" role="img" aria-label="Collections by term">{m.byTerm.map((x) => <div className="tb" key={x.number} title={`${x.name}: billed ${money(x.billed)}, collected ${money(x.paid)}${x.failed ? `, failed ${money(x.failed)}` : ""}`}>
        <div className="col" style={{ height: `${Math.max(4, (x.billed / maxT) * 100)}%` }}><i style={{ height: `${x.billed ? (x.paid / x.billed) * 100 : 0}%` }} />
          {x.failed > 0 && <i className="bad" style={{ height: `${(x.failed / x.billed) * 100}%`, bottom: `${(x.paid / x.billed) * 100}%` }} />}</div>
        <b>{money(x.billed).replace(/\.\d+$/, "")}</b><span>T{x.number} · {dayMonth(x.bills_on)}</span></div>)}</div>
      <div className="legend"><span><i style={{ background: "var(--bar)" }} />Collected</span><span><i style={{ background: "var(--bad)" }} />Failed</span><span><i style={{ background: "var(--track)" }} />Still to bill</span></div>
    </section> },
    { id: "tasters", title: "Taster requests", node: <Link href="/admin/tasters" className="dx-pop"><span>{tasters ? `${tasters} new enquir${tasters === 1 ? "y" : "ies"}` : "Tasters"}</span><b>{tasters ? "Review requests →" : "See taster bookings →"}</b></Link> },
    { id: "bookings", title: "Latest bookings", node: <section className="dx-card">
      <header><h2>Latest bookings</h2><Link className="dx-more" href="/admin/families">Families →</Link></header>
      {m.recent.length === 0 ? <p className="empty">No bookings yet.</p> : <MoreList className="dx-people" limit={4}>{m.recent.map((r, i) =>
        <Link key={i} className="dx-person" href={`/admin/families?q=${encodeURIComponent(r.parent)}`}><span className="av">{initials(r.student)}</span>
          <span className="t"><b>{r.student}</b><span>{r.course} · {r.parent}</span></span><span className="amt">{money(r.amount)}<small>{dayMonth(r.on)}</small></span></Link>)}</MoreList>}
    </section> },
    { id: "coming", title: "Coming up", node: <section className="dx-card">
      <header><h2>Coming up</h2><span className="dx-sub">What the system does on its own</span></header>
      <ol className="dx-steps">{m.coming.map((c, i) => <li key={i} className={c.kind}><b>{c.href ? <Link href={c.href}>{c.title}</Link> : c.title}</b><span>{c.detail}</span></li>)}</ol>
    </section> },
    { id: "fullest", title: "Fullest classes", node: <section className="dx-card">
      <header><h2>Fullest classes</h2><Link className="dx-more" href="/admin/classes">All classes →</Link></header>
      {m.fullest.length === 0 ? <p className="empty">No open classes.</p> : <MoreList className="bars" limit={6}>{m.fullest.map((g, i) => <div className="brow" key={i} title={`${g.name}: ${g.taken} of ${g.capacity}`}>
        <span className="lbl"><span className="dot" style={{ background: g.colour }} />{g.name}</span><div className="track"><i className={g.taken >= g.capacity ? "full" : ""} style={{ width: `${Math.min(100, (g.taken / g.capacity) * 100)}%` }} /></div><span className="num">{g.taken}/{g.capacity}</span></div>)}</MoreList>}
    </section> },
    { id: "email", title: "Email", node: <section className="dx-card">
      <header><h2>Email</h2>{mail.unread > 0 && <span className="dx-count">{mail.unread}</span>}<Link className="dx-more" href="/admin/email?tab=inbox">Inbox →</Link></header>
      {!box?.connected ? <p className="empty">Connect the school inbox to see families’ emails here. <Link href="/admin/email?tab=inbox">Connect it</Link></p>
        : mail.rows.length === 0 ? <div className="dx-clear"><Ico d={I.check} /><b>All read</b><span>No new emails from families.</span></div>
        : <MoreList className="dx-list" limit={4}>{mail.rows.map((e) => <Link key={e.id} className="dx-item info" href="/admin/email?tab=inbox">
          <span className="t"><b>{e.from_name || e.from_email} · {e.subject || "(no subject)"}</b><span>{e.snippet.length > 90 ? e.snippet.slice(0, 90) + "…" : e.snippet}</span><span style={{ fontSize: 13 }}>{ago(e.received_at)}{e.family ? ` · ${e.family}` : ""}</span></span><span className="go" aria-hidden="true">→</span></Link>)}</MoreList>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}><Link className="abtn sm" href="/admin/email?tab=inbox">Reply to families</Link><Link className="abtn sm" href="/admin/email?tab=compose">Write an email</Link></div>
    </section> },
    { id: "quick", title: "Quick links", node: <section className="dx-card">
      <header><h2>Quick links</h2></header>
      <div className="dx-quick"><Link href="/admin/classes">Classes</Link><Link href="/admin/tasters">Tasters</Link><Link href="/admin/enquiries">Enquiries</Link><Link href="/admin/reports">Reports</Link><Link href="/admin/payroll">Payroll</Link><Link href="/admin/newsletter">Newsletter</Link></div>
    </section> },
  ];
  const known = modules.map((x) => x.id);
  const [saved, mirror] = await Promise.all([getLayout(me.id, "admin-home", known), mirrorOf()]);
  void node;
  return <BentoBoard page="admin-home" modules={modules} layout={saved ?? DEFAULT_LAYOUT} defaults={DEFAULT_LAYOUT} saved={!!saved} locked={!!mirror} />;
}

const DEFAULT_LAYOUT: { id: string; size: "s" | "m" | "l" | "xl" | "full" }[] = [
  { id: "hero", size: "full" },
  { id: "k-students", size: "s" }, { id: "k-places", size: "s" }, { id: "k-attendance", size: "s" }, { id: "k-collected", size: "s" }, { id: "k-next", size: "s" }, { id: "k-failed", size: "s" },
  { id: "today", size: "l" }, { id: "attention", size: "l" },
  { id: "collections", size: "m" }, { id: "bookings", size: "m" }, { id: "tasters", size: "m" },
  { id: "email", size: "l" },
  { id: "coming", size: "l" }, { id: "fullest", size: "l" },
];
