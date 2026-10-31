import { requireViewer } from "@/lib/auth";
import { classesForPoints } from "@/lib/community";
import { givePointsAction, undoPointsAction } from "../../actions";
import { pointsGiven } from "@/lib/teacher-area";

const REASONS = ["Great work", "Excellent effort", "Brilliant contribution", "Homework on time", "Helping others", "Big improvement"];

export default async function Points({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const [sp, me] = await Promise.all([searchParams, requireViewer()]);
  const [classes, given] = await Promise.all([classesForPoints(me.id, me.role === "school_admin"), me.role === "school_admin" ? Promise.resolve([]) : pointsGiven(me.id)]);
  return <>
    {me.role === "school_admin" && <p className="backlink"><a className="abtn sm" href="/admin/rewards">← Back</a></p>}
    <div className="top"><div><h1>Reward points</h1><div className="sub">1–10 points with a short reason. The top 3 students in the school each term win a gift. Points given in the holidays don’t count towards a term.</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    <datalist id="reasons">{REASONS.map((r) => <option key={r} value={r} />)}</datalist>
    {classes.length === 0 && <p className="empty">No classes with students yet.</p>}
    {classes.map((c) => <section className="card" key={c.group_id}><h2>{c.class}</h2>
      {c.students.map((s) => <form key={s.id} action={givePointsAction} className="li eform" style={{ gap: 8 }}>
        <input type="hidden" name="group" value={c.group_id} /><input type="hidden" name="student" value={s.id} />
        <div className="t"><b>{s.name}</b><span>{s.term_points} point{s.term_points === 1 ? "" : "s"} this term</span></div>
        <select name="points" className="mini" defaultValue="1">{Array.from({ length: 10 }, (_, i) => <option key={i + 1} value={i + 1}>+{i + 1}</option>)}</select>
        <input name="reason" className="mini" list="reasons" required maxLength={80} placeholder="Why?" style={{ width: 200 }} />
        <button className="abtn sm pri" type="submit">Give</button></form>)}</section>)}
    {given.length > 0 && <section className="card"><h2>Points you’ve given</h2>
      {given.map((p) => <div className="li" key={p.id}><span className="pill good">+{p.points}</span><div className="t"><b>{p.student} · {p.reason}</b><span>{p.class} · {new Date(p.awarded_on + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span></div>
        {p.today && <form action={undoPointsAction}><input type="hidden" name="id" value={p.id} /><button className="abtn sm" type="submit" title="Take these points back">Undo</button></form>}</div>)}</section>}
  </>;
}
