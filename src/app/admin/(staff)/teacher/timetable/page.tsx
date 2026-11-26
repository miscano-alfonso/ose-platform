import { requireViewer } from "@/lib/auth";
import { myTimetable } from "@/lib/teacher-area";
import { DAYLONG } from "../fmt";
import Link from "next/link";
import { teacherUpcoming } from "@/lib/lesson-changes";

export const dynamic = "force-dynamic";

export default async function MyTimetable() {
  const me = await requireViewer();
  const [slots, coming] = await Promise.all([myTimetable(me.id), teacherUpcoming(me.id)]);
  const day = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const times = [...new Set(slots.map((s) => s.time))].sort();
  const days = [1, 2, 3, 4, 5, ...(slots.some((s) => s.weekday > 5) ? [6, 7] : [])];
  return <>
    <div className="top"><div><h1>My timetable</h1><div className="sub">{slots.length} lesson{slots.length === 1 ? "" : "s"} a week</div></div></div>
    {slots.length === 0 ? <p className="empty">No lessons on your timetable yet.</p> :
    <div className="tw"><table><thead><tr><th>Time</th>{days.map((d) => <th key={d}>{DAYLONG[d]}</th>)}</tr></thead><tbody>
      {times.map((tm) => <tr key={tm}><td className="mono">{tm}</td>{days.map((d) => <td key={d}>{slots.filter((s) => s.weekday === d && s.time === tm).map((s) =>
        <div key={s.code} className="ttcell"><b>{s.subject}</b><span>{s.level} · {s.students} student{s.students === 1 ? "" : "s"}</span><span className="muted">until {s.ends}</span></div>)}</td>)}</tr>)}
    </tbody></table></div>}
    {/* 26 Nov: each lesson in the next three weeks, to ask the office to cancel or move it */}
    <section className="card tt-coming" id="coming"><h2>Coming up</h2>
      <p className="cs">Your lessons in the next three weeks. Need to cancel or move one? Ask the office from here: you’ll only be offered times that don’t clash.</p>
      {coming.length === 0 ? <p className="empty">No lessons in the next three weeks.</p> : coming.map((l) => <div className="li" key={l.id}>
        <div className="t"><b>{day(l.date)} · {l.start}–{l.end}</b><span>{l.cls}{l.moved_from ? " · moved here" : ""}{l.status === "cancelled" && l.note ? ` · ${l.note}` : ""}</span></div>
        {l.status === "cancelled" ? <span className="pill mute">Cancelled</span>
          : l.pending ? <span className="pill warn">{l.pending === "move" ? "Move asked for" : "Cancel asked for"}</span>
          : l.status === "scheduled" && <Link className="abtn sm" href={`/admin/register/${l.id}?back=/admin/teacher/timetable#change`}>Cancel or move</Link>}
      </div>)}</section>
  </>;
}
