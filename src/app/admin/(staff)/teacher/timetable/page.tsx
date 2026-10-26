import { requireViewer } from "@/lib/auth";
import { myTimetable } from "@/lib/teacher-area";
import { DAYLONG } from "../fmt";

export const dynamic = "force-dynamic";

export default async function MyTimetable() {
  const me = await requireViewer();
  const slots = await myTimetable(me.id);
  const times = [...new Set(slots.map((s) => s.time))].sort();
  const days = [1, 2, 3, 4, 5, ...(slots.some((s) => s.weekday > 5) ? [6, 7] : [])];
  return <>
    <div className="top"><div><h1>My timetable</h1><div className="sub">{slots.length} lesson{slots.length === 1 ? "" : "s"} a week</div></div></div>
    {slots.length === 0 ? <p className="empty">No lessons on your timetable yet.</p> :
    <div className="tw"><table><thead><tr><th>Time</th>{days.map((d) => <th key={d}>{DAYLONG[d]}</th>)}</tr></thead><tbody>
      {times.map((tm) => <tr key={tm}><td className="mono">{tm}</td>{days.map((d) => <td key={d}>{slots.filter((s) => s.weekday === d && s.time === tm).map((s) =>
        <div key={s.code} className="ttcell"><b>{s.subject}</b><span>{s.level} · {s.students} student{s.students === 1 ? "" : "s"}</span><span className="muted">until {s.ends}</span></div>)}</td>)}</tr>)}
    </tbody></table></div>}
  </>;
}
