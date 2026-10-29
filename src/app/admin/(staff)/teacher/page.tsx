import Link from "next/link";
import { LessonClock, LessonCountdown } from "../../../LessonClock";
import { requireViewer } from "@/lib/auth";
import { myDay } from "@/lib/teacher-area";
import { Ring, Ico, IC } from "../../DashBits";
import { joinLabel } from "@/lib/video";

export const dynamic = "force-dynamic";

const DAY = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const wd = (d: string) => DAY[((new Date(d + "T12:00:00Z").getUTCDay() + 6) % 7) + 1];
const dm = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const gbp = (p: number) => "£" + (p / 100).toLocaleString("en-GB", { minimumFractionDigits: p % 100 ? 2 : 0, maximumFractionDigits: 2 });

// My day: the teacher's Bento dashboard: next lesson with Join up top, reports in lime, then the week.
export default async function MyDay() {
  const me = await requireViewer();
  const d = await myDay(me.id);
  const today = new Date().toISOString().slice(0, 10);
  const next = d.week.find((l) => l.d > today || (l.d === today && l.status === "scheduled")) ?? d.week[0];
  const done = d.reportBars.reduce((a, r) => a + r.done, 0), total = d.reportBars.reduce((a, r) => a + r.total, 0);
  const rpct = total ? Math.round(done / total * 100) : null;
  const isToday = next?.d === today;
  return <>
    <div className="fx">
      <section className={`dx-hero c8${next ? " has-clock" : ""}`} data-lesson={next ? `${next.name}, ${next.time}` : undefined}><div className="fx-main">
        <p className="fx-live" style={isToday ? undefined : { color: "#c9cdea" }}>{isToday && <i />}{next ? (isToday ? "Today" : `Next lesson · ${wd(next.d)} ${dm(next.d)}`) : d.term?.name ?? "My day"}</p>
        <h1 className="fx-hero-t"><span className="fx-hi"><span className="fx-hello">Hello</span> {me.name.split(" ")[0]}</span>{next && <><br />{next.name}</>}</h1>
        <p className="fx-hero-s">{next ? <>{next.students} student{next.students === 1 ? "" : "s"}{next.tasters.length ? ` · ${next.tasters.length} taster${next.tasters.length > 1 ? "s" : ""}` : ""}{next.absent.length ? ` · away: ${next.absent.join(", ")}` : ""}</> : "No lessons in the next 7 days."}</p>
        {!!next?.birthdays?.length && <p className="fx-bday"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c1 1.2 1.5 2.1 1.5 2.8a1.5 1.5 0 0 1-3 0c0-.7.5-1.6 1.5-2.8zM11.2 8h1.6v3h-1.6zM4 13a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2.2c-1.4 1.2-2.6 1.2-4 0-1.4 1.2-2.6 1.2-4 0-1.4 1.2-2.6 1.2-4 0-.7.6-1.3.9-2 .9zM4 17.5c.7 0 1.4-.2 2-.7 1.4 1.2 2.6 1.2 4 0 1.4 1.2 2.6 1.2 4 0 1.4 1.2 2.6 1.2 4 0 .6.5 1.3.7 2 .7V21H4z" fill="currentColor"/></svg>
          <span>{next.birthdays.map((b, i) => <span key={i}>{i ? (i === next.birthdays!.length - 1 ? " and " : ", ") : ""}<b>{b.name}</b>’s birthday {b.d === today ? "is today" : b.d === next.d ? "is on the lesson day" : `${b.d < today ? "was" : "is"} on ${wd(b.d)} ${dm(b.d)}`} (turns {b.age})</span>)}</span></p>}
        <div className="fx-btns">{next?.meet_url && <a className="go" href={next.meet_url} target="_blank" rel="noopener">{joinLabel(next.meet_url)}</a>}
          {next && <LessonCountdown date={next.d} time={next.time} />}
          {next && <Link href={`/admin/register/${next.id}`}>Register</Link>}<Link href="/admin/teacher/timetable">My timetable</Link></div>
      </div>{next && <LessonClock date={next.d} time={next.time} />}</section>
      <Link href="/admin/teacher/reports" className="dx-pop c4"><span>{d.reportCycle ?? "Reports"}</span>
        <b className="fx-big">{d.reportsLeft}</b><span>{d.reportsLeft ? `comment${d.reportsLeft === 1 ? "" : "s"} to write${d.reportsDue ? ` · due ${dm(d.reportsDue)}` : ""} →` : "Nothing to write right now →"}</span></Link>
      <div className="dx-kpi ring c3"><div><span className="k">Attendance in my classes</span><span className="v">{d.attendance == null ? "–" : `${d.attendance}%`}</span><span className="h">this term</span></div><Ring pct={d.attendance} tone={d.attendance == null ? "brand" : d.attendance < 50 ? "bad" : d.attendance < 80 ? "warn" : "good"} /></div>
      <div className="dx-kpi ring c3"><div><span className="k">Reports written</span><span className="v">{rpct == null ? "–" : `${rpct}%`}</span><span className="h">{total ? `${done} of ${total}` : "none open"}</span></div><Ring pct={rpct} /></div>
      <Link href="/admin/teacher/ones" className="dx-kpi c3"><Ico d={IC.users} /><span className="k">1:1s this week</span><span className="v">{d.onesThisWeek}</span><span className="h">See 1:1s →</span></Link>
      <Link href="/admin/teacher/pay" className="dx-kpi c3"><Ico d={IC.pound} /><span className="k">My pay this term</span><span className="v">{gbp(d.payThisTerm)}</span><span className="h">{d.term ? `paid ${dm(d.term.pay_date)}` : ""}</span></Link>
      <section className="dx-card c7 dx-tall"><header><h2>This week</h2><Link className="dx-more" href="/admin/teacher/timetable">Timetable →</Link></header>
        {d.week.length === 0 ? <p className="empty">No lessons coming up.</p> : <div className="dx-scroll">{d.week.map((l) => <div className="fx-row" key={l.id}>
          <span className="fx-when">{wd(l.d)} {dm(l.d)}</span>
          <div className="t"><b>{l.time} · {l.name}</b><span>{l.students} student{l.students === 1 ? "" : "s"}
            {l.not_in_classroom ? ` · ${l.not_in_classroom} not in Classroom yet` : ""}
            {l.tasters.length ? ` · ${l.tasters.length} taster${l.tasters.length > 1 ? "s" : ""}: ${l.tasters.join(", ")}` : ""}
            {l.absent.length ? ` · away: ${l.absent.join(", ")}` : ""}</span></div>
          {l.d < today || l.status !== "scheduled" ? <Link className="abtn sm" href={`/admin/register/${l.id}`}>Attendance</Link>
            : l.meet_url ? null // the next lesson's Join button is at the top
            : <span className="pill mute" title="The office adds the Meet link to the class">No Meet link</span>}
        </div>)}</div>}
      </section>
      <section className="dx-card c5 dx-tall"><header><h2>{d.reportCycle ?? "Reports"}</h2><Link className="dx-more" href="/admin/teacher/reports">Write →</Link></header>
        {d.reportBars.length === 0 ? <p className="empty">No reports to write right now.</p> : <div className="bars">{d.reportBars.map((r) => <div className="brow" key={r.group_id}>
          <span className="lbl">{r.name}</span><div className="track"><i style={{ width: `${r.total ? r.done / r.total * 100 : 0}%` }} /></div><span className="num">{r.done}/{r.total}</span></div>)}</div>}
      </section>
    </div>
  </>;
}
