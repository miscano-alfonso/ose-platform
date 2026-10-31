import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { myClasses } from "@/lib/teacher-area";
import { joinLabel } from "@/lib/video";
import { DAY, dm } from "../fmt";
import { ViewSwitch } from "../StudentRows";
import type { MyClass } from "@/lib/teacher-area";

export const dynamic = "force-dynamic";

// My classes (31 Oct): each class the teacher takes this year as a tile, with its times, students, attendance, SEND count,
// the next lesson's register, and the class's Meet and Classroom links. A list by default; tiles with ?view=cards.
const nextOf = (c: MyClass) => c.next ? `${DAY[new Date(c.next.d + "T12:00:00Z").getUTCDay() || 7]} ${dm(c.next.d)}, ${c.next.t}` : null;
const Acts = ({ c }: { c: MyClass }) => <>
  <Link className="abtn sm pri" href={`/admin/teacher/classes/${c.id}`}>Students</Link>
  <Link className="abtn sm" href={`/admin/teacher/classes/${c.id}#assignments`}>Assignments</Link>
  {c.next && <Link className="abtn sm" href={`/admin/register/${c.next.id}`}>Register</Link>}
  {c.meet_url && <a className="abtn sm" href={c.meet_url} target="_blank" rel="noopener">{joinLabel(c.meet_url)}</a>}
  {c.classroom && <a className="abtn sm" href={c.classroom} target="_blank" rel="noopener">Classroom</a>}</>;
const attPill = (p: number | null) => p === null ? <span className="muted">—</span> : <span className={`pill ${p >= 90 ? "good" : p >= 75 ? "warn" : "bad"}`}>{p}%</span>;

export default async function MyClasses({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const view = (await searchParams).view === "cards" ? "cards" : "list";
  const me = await requireViewer();
  const cs = await myClasses(me.id);
  const students = cs.reduce((n, c) => n + c.students, 0);
  return <>
    <div className="top"><div><h1>My classes</h1><div className="sub">{cs.length} class{cs.length === 1 ? "" : "es"} · {students} students this year</div></div>
      <span className="grow" /><div className="acts">{cs.length > 0 && <ViewSwitch view={view} href={(w) => `/admin/teacher/classes${w === "cards" ? "?view=cards" : ""}`} />}
        <Link className="abtn" href="/admin/teacher/students">All my students</Link></div></div>
    {cs.length === 0 ? <p className="empty">You don’t have any classes this year yet.</p> : view === "list" ?
    <div className="tw"><table className="ms-table mc-table"><thead><tr><th>Class</th><th>Times</th><th className="n">Students</th><th className="n">Attendance</th><th className="n">SEND</th><th>Next lesson</th><th /></tr></thead>
      <tbody>{cs.map((c) => <tr key={c.id} style={{ ["--c" as string]: c.colour }}>
        <td><Link className="mc-name" href={`/admin/teacher/classes/${c.id}`}><b>{c.level} {c.subject}</b></Link><div className="muted mc-code">{c.code}</div></td>
        <td>{(c.slots ?? []).map((s, i) => <div key={i} className="ms-line">{DAY[s.d]} {s.t}–{s.e}</div>)}</td>
        <td className="n">{c.students}{c.capacity ? <span className="muted"> / {c.capacity}</span> : ""}</td>
        <td className="n">{attPill(c.att)}</td>
        <td className="n">{c.send > 0 ? <span className="pill warn">{c.send}</span> : <span className="muted">—</span>}</td>
        <td>{nextOf(c) ?? <span className="muted">—</span>}</td>
        <td><div className="mc-acts"><Acts c={c} /></div></td></tr>)}</tbody></table></div> :
    <div className="mc-grid">{cs.map((c) => <article key={c.id} className="mcls" style={{ ["--c" as string]: c.colour }}>
      <header><span className="mcls-lv">{c.level}</span><span className="mcls-code">{c.code}</span></header>
      <h2><Link href={`/admin/teacher/classes/${c.id}`}>{c.subject}</Link></h2>
      <p className="mcls-times">{(c.slots ?? []).map((s, i) => <span key={i}>{DAY[s.d]} {s.t}–{s.e}</span>)}</p>
      <div className="mcls-stats">
        <div><b>{c.students}</b><span>student{c.students === 1 ? "" : "s"}{c.capacity ? ` of ${c.capacity}` : ""}</span></div>
        <div><b>{c.att === null ? "—" : `${c.att}%`}</b><span>attendance</span></div>
        {c.send > 0 && <div className="send"><b>{c.send}</b><span>SEND</span></div>}
      </div>
      {c.next && <p className="mcls-next">Next lesson: <b>{nextOf(c)}</b></p>}
      <div className="acts"><Acts c={c} /></div>
    </article>)}</div>}
  </>;
}
