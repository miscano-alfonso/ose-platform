import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { myClasses } from "@/lib/teacher-area";
import { joinLabel } from "@/lib/video";
import { DAY, dm } from "../fmt";

export const dynamic = "force-dynamic";

// My classes (31 Oct): each class the teacher takes this year as a tile, with its times, students, attendance, SEND count,
// the next lesson's register, and the class's Meet and Classroom links.
export default async function MyClasses() {
  const me = await requireViewer();
  const cs = await myClasses(me.id);
  const students = cs.reduce((n, c) => n + c.students, 0);
  return <>
    <div className="top"><div><h1>My classes</h1><div className="sub">{cs.length} class{cs.length === 1 ? "" : "es"} · {students} students this year</div></div>
      <span className="grow" /><Link className="abtn" href="/admin/teacher/students">All my students</Link></div>
    {cs.length === 0 ? <p className="empty">You don’t have any classes this year yet.</p> :
    <div className="mc-grid">{cs.map((c) => <article key={c.id} className="mcls" style={{ ["--c" as string]: c.colour }}>
      <header><span className="mcls-lv">{c.level}</span><span className="mcls-code">{c.code}</span></header>
      <h2><Link href={`/admin/teacher/classes/${c.id}`}>{c.subject}</Link></h2>
      <p className="mcls-times">{(c.slots ?? []).map((s, i) => <span key={i}>{DAY[s.d]} {s.t}–{s.e}</span>)}</p>
      <div className="mcls-stats">
        <div><b>{c.students}</b><span>student{c.students === 1 ? "" : "s"}{c.capacity ? ` of ${c.capacity}` : ""}</span></div>
        <div><b>{c.att === null ? "—" : `${c.att}%`}</b><span>attendance</span></div>
        {c.send > 0 && <div className="send"><b>{c.send}</b><span>SEND</span></div>}
      </div>
      {c.next && <p className="mcls-next">Next lesson: <b>{DAY[new Date(c.next.d + "T12:00:00Z").getUTCDay() || 7]} {dm(c.next.d)}, {c.next.t}</b></p>}
      <div className="acts">
        <Link className="abtn sm pri" href={`/admin/teacher/classes/${c.id}`}>Students</Link>
        {c.next && <Link className="abtn sm" href={`/admin/register/${c.next.id}`}>Register</Link>}
        {c.meet_url && <a className="abtn sm" href={c.meet_url} target="_blank" rel="noopener">{joinLabel(c.meet_url)}</a>}
        {c.classroom && <a className="abtn sm" href={c.classroom} target="_blank" rel="noopener">Classroom</a>}
      </div>
    </article>)}</div>}
  </>;
}
