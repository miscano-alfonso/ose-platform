import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { myDay } from "@/lib/teacher-area";

export const dynamic = "force-dynamic";

const DAY = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const wd = (d: string) => DAY[((new Date(d + "T12:00:00Z").getUTCDay() + 6) % 7) + 1];
const dm = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const gbp = (p: number) => "£" + (p / 100).toLocaleString("en-GB", { minimumFractionDigits: p % 100 ? 2 : 0, maximumFractionDigits: 2 });

// My day: the teacher's dashboard, as in the prototype.
export default async function MyDay() {
  const me = await requireViewer();
  const d = await myDay(me.id);
  const today = new Date().toISOString().slice(0, 10);
  const next = d.week.find((l) => l.d > today || (l.d === today && l.status === "scheduled")) ?? d.week[0];
  return <>
    <div className="top"><div><h1>Hello {me.name.split(" ")[0]}</h1><div className="sub">{d.term ? `${d.term.name} · ` : ""}{d.classes} class{d.classes === 1 ? "" : "es"}</div></div></div>
    <div className="tiles">
      <div className="tile"><span className="k">Next lesson</span><span className="v" style={{ fontSize: 20 }}>{next ? `${wd(next.d)} ${next.time}` : "—"}</span><span className="h">{next?.name ?? ""}</span></div>
      <div className={`tile${d.reportsLeft ? " alert" : ""}`}><span className="k">Report comments to write</span><span className="v">{d.reportsLeft}</span><span className="h">{d.reportsDue ? `due ${dm(d.reportsDue)}` : "none open"}</span></div>
      <div className="tile"><span className="k">Attendance in my classes</span><span className="v">{d.attendance == null ? "—" : `${d.attendance}%`}</span><span className="h">this term</span></div>
      <div className="tile"><span className="k">1:1s this week</span><span className="v">{d.onesThisWeek}</span><span className="h"><Link className="abtn sm" href="/admin/teacher/ones">See 1:1s</Link></span></div>
      <div className="tile"><span className="k">My pay this term</span><span className="v">{gbp(d.payThisTerm)}</span><span className="h">{d.term ? `paid ${dm(d.term.pay_date)}` : ""}</span></div>
    </div>
    <div className="dgrid">
      <section className="card"><h2>This week</h2><p className="cs">Join links open the class’s Google Meet.</p>
        {d.week.length === 0 ? <p className="empty">No lessons in the next 7 days.</p> : d.week.slice(0, 12).map((l) => <div className="li" key={l.id}>
          <span className="mono" style={{ width: 92, flex: "none" }}>{wd(l.d)} {dm(l.d)}</span>
          <div className="t"><b>{l.time} · {l.name}</b><span>{l.students} student{l.students === 1 ? "" : "s"}
            {l.not_in_classroom ? ` · ${l.not_in_classroom} not in Classroom yet` : ""}
            {l.tasters.length ? <> · <b style={{ display: "inline" }}>{l.tasters.length} taster{l.tasters.length > 1 ? "s" : ""}: {l.tasters.join(", ")}</b></> : null}
            {l.absent.length ? ` · away: ${l.absent.join(", ")}` : ""}</span></div>
          {l.d < today || l.status !== "scheduled" ? <Link className="abtn sm" href={`/admin/register/${l.id}`}>Attendance</Link>
            : l.meet_url ? <a className="abtn sm pri" href={l.meet_url} target="_blank" rel="noopener">Join</a>
            : <span className="pill mute" title="The office adds the Meet link to the class">No Meet link</span>}
        </div>)}
      </section>
      <section className="card"><h2>{d.reportCycle ?? "Reports"}</h2><p className="cs">Write a comment for every child in each class.</p>
        {d.reportBars.length === 0 ? <p className="empty">No reports to write right now.</p> : <div className="bars">{d.reportBars.map((r) => <div className="brow" key={r.group_id}>
          <span className="lbl">{r.name}</span><div className="track"><i style={{ width: `${r.total ? r.done / r.total * 100 : 0}%` }} /></div><span className="num">{r.done}/{r.total}</span></div>)}</div>}
        <div style={{ marginTop: 12 }}><Link className="abtn pri" href="/admin/teacher/reports">Write reports</Link></div>
      </section>
    </div>
  </>;
}
