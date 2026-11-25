import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { markingQueue, markingSubmissions, countdown, tone, TURNAROUND_DAYS, type MarkItem, type MarkSub } from "@/lib/marking";
import { dm } from "../fmt";

export const dynamic = "force-dynamic";
export const metadata = { title: "Marking" };
const PILL = { ok: "good", warn: "warn", bad: "bad" } as const;
const Pill = ({ m }: { m: MarkItem }) => <span className={`pill ${PILL[tone(m.daysLeft)]}`}>{countdown(m.daysLeft)}</span>;

// Teacher → Marking (25 Nov): work handed in and waiting to be marked and returned in Google Classroom, from the last
// Classroom read. "Each piece of work" lists them soonest deadline first; "By class" groups them under each class.
// Each piece opens to the students who handed it in, each linking to their hand-in in Classroom, where marking stays.
function Piece({ m, subs, showClass }: { m: MarkItem; subs: MarkSub[]; showClass: boolean }) {
  return <details className="mk-piece">
    <summary><div className="t"><b>{m.title}</b><span>{showClass ? `${m.cls} · ` : ""}{m.toMark} to mark · return by {dm(m.deadline)}</span></div><Pill m={m} /></summary>
    <ul className="mk-subs">{subs.map((s) => <li key={s.sid}>
      <span className="mk-who"><b>{s.student}</b><span>{s.turnedIn ? `Handed in ${dm(s.turnedIn)}` : "Handed in"}</span>{s.late && <span className="pill warn">Late</span>}</span>
      {s.link ? <a className="abtn sm" href={s.link} target="_blank" rel="noopener">Open in Classroom</a> : m.link && <a className="abtn sm" href={m.link} target="_blank" rel="noopener">Open in Classroom</a>}
    </li>)}</ul>
    {m.link && <p className="mk-all"><a href={m.link} target="_blank" rel="noopener">All hand-ins for this work in Classroom ↗</a></p>}
  </details>;
}

export default async function Marking({ searchParams }: { searchParams: Promise<{ by?: string }> }) {
  const [me, sp] = await Promise.all([requireViewer(), searchParams]);
  const [queue, subs] = await Promise.all([markingQueue(me.id), markingSubmissions(me.id)]);
  const byClass = sp.by === "class", total = subs.length;
  const classes = [...new Map(queue.map((m) => [m.gid, m.cls])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const subsOf = (cw: string) => subs.filter((s) => s.cw === cw);
  return <>
    <div className="top"><div><h1>Marking</h1>
      <div className="sub">{total ? `${total} hand-in${total === 1 ? "" : "s"} to mark in ${queue.length} piece${queue.length === 1 ? "" : "s"} of work` : "Nothing waiting"} · mark and return work in Google Classroom within {TURNAROUND_DAYS} days of its due date</div></div>
      <div className="segl"><Link href="/admin/teacher/marking" aria-current={!byClass ? "true" : undefined}>Each piece of work</Link><Link href="/admin/teacher/marking?by=class" aria-current={byClass ? "true" : undefined}>By class</Link></div></div>
    {queue.length === 0 ? <section className="card"><p className="empty">All marked. Nothing handed in is waiting to be returned. Work shows here once students hand it in to Google Classroom (read every 2 hours).</p></section>
    : byClass ? classes.map(([gid, cls]) => { const items = queue.filter((m) => m.gid === gid);
        return <section className="card mk-card" key={gid}><h2>{cls} <span className="muted">· {items.reduce((a, m) => a + m.toMark, 0)} to mark</span></h2>
          {items.map((m) => <Piece key={m.cw} m={m} subs={subsOf(m.cw)} showClass={false} />)}</section>; })
    : <section className="card mk-card">{queue.map((m) => <Piece key={m.cw} m={m} subs={subsOf(m.cw)} showClass />)}</section>}
    <p className="note">Marked work counts as done once you return it to the student in Classroom. The list updates each time Classroom is read.</p>
  </>;
}
