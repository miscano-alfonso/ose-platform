import Link from "next/link";
import { markingOverview, markingCounts, countdown, tone, TURNAROUND_DAYS, REMIND_DAYS, type MarkItem } from "@/lib/marking";
import { dayMonth } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Marking" };
const PILL = { ok: "good", warn: "warn", bad: "bad" } as const;

// Admin → Marking (27 Nov, Alfonso: "like teachers, admin needs an overview of all markings, so we can keep tabs"):
// every teacher's hand-ins still to mark and return in Google Classroom, most behind first, with what each has marked
// in the last 30 days and how much of it inside the 7-day turnaround. Marking itself stays in Classroom.
export default async function AdminMarking({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const sp = await searchParams;
  const { teachers, queue, resolved } = await markingOverview();
  const counts = await markingCounts(queue.map((m) => m.cw));
  const toMark = queue.reduce((a, m) => a + m.toMark, 0), overdue = queue.filter((m) => m.daysLeft < 0).length;
  const soon = queue.filter((m) => m.daysLeft >= 0 && m.daysLeft <= REMIND_DAYS).length;
  const marked = teachers.reduce((a, t) => a + t.marked30, 0), onTime = teachers.reduce((a, t) => a + t.onTime30, 0);
  const pct = (a: number, b: number) => b ? `${Math.round((a / b) * 100)}%` : "–";
  const pick = sp.t ? teachers.find((t) => t.userId === sp.t) : undefined;
  const shown = pick ? [pick] : teachers.filter((t) => t.items.length);
  const Row = ({ m }: { m: MarkItem }) => { const c = counts.get(m.cw);
    return <li className={`am-piece ${tone(m.daysLeft)}`}>
      <span className="t"><b>{m.link ? <a href={m.link} target="_blank" rel="noopener">{m.title}</a> : m.title}</b>
        <span>{m.cls} · {m.toMark} to mark{m.late ? <> (<b className="mk-late">{m.late} late</b>)</> : ""} · return by {dayMonth(m.deadline.slice(0, 10))}</span></span>
      {c && c.total > 0 && <span className="mk-count">{c.handed}/{c.total} handed in</span>}
      <span className={`pill ${PILL[tone(m.daysLeft)]}`}>{countdown(m.daysLeft)}</span></li>; };
  return <>
    <div className="top"><div><h1>Marking</h1>
      <div className="sub">Every teacher’s work still to mark · teachers mark and return it in Google Classroom within {TURNAROUND_DAYS} days of its due date</div></div></div>

    <div className="dx-mini am-tiles">
      <a href="#teachers"><b>{toMark}</b><span>hand-ins to mark, in {queue.length} piece{queue.length === 1 ? "" : "s"} of work</span></a>
      <a href="#teachers" className={overdue ? "bad" : undefined}><b>{overdue}</b><span>piece{overdue === 1 ? "" : "s"} overdue</span></a>
      <a href="#teachers" className={soon ? "warn" : undefined}><b>{soon}</b><span>due in the next {REMIND_DAYS} days</span></a>
      <a href="#teachers"><b>{pct(onTime, marked)}</b><span>marked on time in the last 30 days ({marked} hand-ins)</span></a>
    </div>

    <section className="card" id="teachers"><h2>By teacher</h2>
      {teachers.length === 0 ? <p className="empty">No teachers with classes yet.</p> :
      <div className="tw"><table className="am-table"><thead><tr><th>Teacher</th><th>To mark</th><th>Overdue</th><th>Due soon</th><th>Late hand-ins</th><th title="Hand-ins returned in Classroom in the last 30 days">Marked, 30 days</th><th title="Of those, returned within the turnaround">On time</th><th title="Pieces the teacher chose not to mark, in the last 60 days">Not marking</th></tr></thead>
        <tbody>{teachers.map((t) => <tr key={t.userId || "none"} className={t.overdue ? "am-bad" : undefined}>
          <td><Link href={`/admin/marking?t=${t.userId}#work`}><b>{t.name}</b></Link></td>
          <td>{t.toMark ? <>{t.toMark} <span className="muted">in {t.pieces}</span></> : <span className="pill good">All marked</span>}</td>
          <td>{t.overdue ? <span className="pill bad">{t.overdue}{t.worst != null && t.worst < 0 ? ` · oldest ${-t.worst} day${t.worst === -1 ? "" : "s"}` : ""}</span> : <span className="muted">0</span>}</td>
          <td>{t.soon ? <span className="pill warn">{t.soon}</span> : <span className="muted">0</span>}</td>
          <td>{t.late || <span className="muted">0</span>}</td>
          <td>{t.marked30 || <span className="muted">0</span>}</td>
          <td>{t.marked30 ? <span className={`pill ${t.onTime30 / t.marked30 >= 0.9 ? "good" : t.onTime30 / t.marked30 >= 0.7 ? "warn" : "bad"}`}>{pct(t.onTime30, t.marked30)}</span> : <span className="muted">–</span>}</td>
          <td>{t.resolved || <span className="muted">0</span>}</td></tr>)}</tbody></table></div>}
    </section>

    <section className="card" id="work"><h2>Work to mark{pick ? `: ${pick.name}` : ""}{pick && <Link className="dx-more" href="/admin/marking#work" style={{ marginLeft: 12, fontSize: 15, fontWeight: 400 }}>Everyone</Link>}</h2>
      {shown.every((t) => !t.items.length) ? <p className="empty">{pick ? `${pick.name} has nothing waiting to be marked.` : "Nothing waiting to be marked."}</p>
        : shown.filter((t) => t.items.length).map((t) => <details key={t.userId || "none"} className="am-teacher" open={!!pick || t.overdue > 0}>
          <summary><b>{t.name}</b><span className="muted">{t.toMark} to mark in {t.pieces} piece{t.pieces === 1 ? "" : "s"}</span>
            {t.overdue > 0 && <span className="pill bad">{t.overdue} overdue</span>}{t.soon > 0 && <span className="pill warn">{t.soon} due soon</span>}</summary>
          <ul className="am-list">{t.items.map((m) => <Row key={m.cw} m={m} />)}</ul></details>)}
      <p className="muted" style={{ fontSize: 14, margin: "12px 0 0" }}>From the last Classroom read. Work counts as marked once the teacher returns it in Classroom; work from an earlier term that’s still not marked is archived and left off.</p>
    </section>

    {resolved.length > 0 && <section className="card"><h2>Not being marked <span className="muted" style={{ fontWeight: 400, fontSize: 15 }}>· last 60 days</span></h2>
      <p className="muted" style={{ marginTop: 0, fontSize: 14.5 }}>Work a teacher took off their list, with their reason.</p>
      <ul className="am-list">{resolved.filter((r) => !pick || r.teacher === pick.name).map((r) => <li key={r.cw} className="am-piece">
        <span className="t"><b>{r.title}</b><span>{r.cls} · {r.teacher ?? "No teacher"} · {dayMonth(r.at.slice(0, 10))}{r.toMark ? ` · ${r.toMark} hand-in${r.toMark === 1 ? "" : "s"} unmarked` : ""}</span></span>
        <span className="am-note">{r.note || "No reason given"}</span></li>)}</ul></section>}
  </>;
}
