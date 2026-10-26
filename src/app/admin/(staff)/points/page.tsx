import { requireViewer } from "@/lib/auth";
import { classesForPoints } from "@/lib/community";
import { givePointsAction } from "../../actions";

const REASONS = ["Great work", "Excellent effort", "Brilliant contribution", "Homework on time", "Helping others", "Big improvement"];

export default async function Points({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const [sp, me] = await Promise.all([searchParams, requireViewer()]);
  const classes = await classesForPoints(me.id, me.role === "school_admin");
  return <>
    <p><a href={me.role === "school_admin" ? "/admin/rewards" : "/admin/teacher"}>← Back</a></p>
    <div className="top"><div><h1>Give reward points</h1><div className="sub">1–10 points with a short reason. The top 3 students in the school each term win a gift. Points given in the holidays don’t count towards a term.</div></div></div>
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
  </>;
}
