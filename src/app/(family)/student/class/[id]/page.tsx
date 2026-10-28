import { notFound } from "next/navigation";
import { requireStudent } from "@/lib/family-auth";
import { studentClass } from "@/lib/family";
import { Head, dlong, MARK } from "../../../fmt";
import { joinLabel, toolOf } from "@/lib/video";

export default async function StudentClass({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, f] = await Promise.all([params, requireStudent()]);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const c = await studentClass(f.id, id);
  if (!c) notFound();
  const today = new Date().toISOString().slice(0, 10);
  const next = c.lessons.filter((l) => l.date >= today && l.status === "scheduled").slice(0, 4), past = c.lessons.filter((l) => l.date < today).reverse().slice(0, 8);
  return <>
    <Head title={`${c.g.level} ${c.g.subject}`} sub={`${c.g.slots ?? ""}${c.g.teacher ? ` · ${c.g.teacher}` : ""}`}>{c.g.meet && <a className="abtn pri" href={`/join/${id}`} target="_blank" rel="noopener">{joinLabel(c.g.meet)}</a>}</Head>
    <div className="dgrid"><div className="dstack">
      <section className="card" style={{ margin: 0 }}><h2>Coming up</h2>{next.length === 0 ? <p className="empty">No lessons coming up this term.</p> : next.map((l, i) => <div className="li" key={i}><div className="t"><b>{dlong(l.date)} {l.time}</b><span>{c.g.meet ? toolOf(c.g.meet).id === "other" ? "Live lesson" : toolOf(c.g.meet).name : "Live lesson"}</span></div></div>)}</section>
      <section className="card" style={{ margin: 0 }}><h2>Work</h2>{c.work.length === 0 ? <p className="empty">Your work is in Google Classroom; it shows here once the school connects it.</p> : c.work.map((w, i) => <div className="li" key={i}>
        <div className="t"><b>{w.link ? <a href={w.link} target="_blank" rel="noopener">{w.title}</a> : w.title}</b><span>{w.due_at ? `Due ${dlong(w.due_at)}` : "No due date"}</span></div>
        {w.status === "submitted" ? (w.points != null && w.max ? <span className="pill good">{Math.round(w.points / w.max * 100)}%</span> : <span className="pill info">Handed in</span>) : w.status === "overdue" ? <span className="pill bad">Missing</span> : <span className="pill mute">To do</span>}</div>)}</section>
    </div><div className="dstack">
      <section className="card" style={{ margin: 0 }}><h2>Your attendance</h2>{past.length === 0 ? <p className="empty">No lessons yet.</p> : past.map((l, i) => <div className="li" key={i}>
        {l.mark ? <span className={`mark ${MARK[l.mark]?.[1]}`}>{MARK[l.mark]?.[2]}</span> : <span className="mark">–</span>}<div className="t"><b>{dlong(l.date)} {l.time}</b><span>{l.mark ? MARK[l.mark]?.[0] : "Not recorded"}</span></div></div>)}</section>
      <section className="card" style={{ margin: 0 }}><h2>Classmates</h2><p className="cs">{c.classmates.length ? c.classmates.join(", ") : "Just you so far."}</p></section>
    </div></div>
  </>;
}
