import Link from "next/link";
import { weekLessons, mondayOf, addDays, todayLondon, nextTeachingWeek, classroomUrl, type WeekLesson } from "@/lib/week-timetable";
import { joinLabel } from "@/lib/video";

export const dynamic = "force-dynamic";
const DAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const nice = (d: string, o: Intl.DateTimeFormatOptions) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { ...o, timeZone: "UTC" });

// Timetable: the week's real lessons for day-to-day use. Click a lesson to join it (to help or keep an eye on it),
// open its register or its Google Classroom. Lesson times and teachers are set in Settings → Timetable setup.
export default async function Timetable({ searchParams }: { searchParams: Promise<{ w?: string; level?: string; teacher?: string }> }) {
  const sp = await searchParams;
  const today = todayLondon(), thisWeek = mondayOf(today);
  let monday = /^\d{4}-\d{2}-\d{2}$/.test(sp.w ?? "") ? mondayOf(sp.w!) : thisWeek;
  let lessons = await weekLessons(monday);
  let skipped = false;
  if (!sp.w && lessons.length === 0) { const nx = await nextTeachingWeek(today); if (nx && nx !== monday) { monday = nx; lessons = await weekLessons(monday); skipped = true; } }
  const levels = [...new Set(lessons.map((l) => l.level))];
  const teachers = [...new Map(lessons.filter((l) => l.teacher_id).map((l) => [l.teacher_id!, l.teacher ?? ""])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const level = levels.includes(sp.level ?? "") ? sp.level! : "All", teacher = teachers.some(([id]) => id === sp.teacher) ? sp.teacher! : "";
  const shown = lessons.filter((l) => (level === "All" || l.level === level) && (!teacher || l.teacher_id === teacher));
  const days = [1, 2, 3, 4, 5, 6, 7].filter((d) => d <= 5 || lessons.some((l) => l.weekday === d));
  const times = [...new Set(shown.map((l) => l.starts))].sort();
  const now = Date.now();
  const state = (l: WeekLesson) => l.status === "cancelled" ? "cancelled" : now >= Date.parse(l.start_at) && now < Date.parse(l.end_at) ? "live" : now >= Date.parse(l.end_at) ? "done" : "soon";
  const q = (o: Record<string, string>) => { const p = Object.entries({ w: sp.w ? monday : "", level: level === "All" ? "" : level, teacher, ...o }).filter(([, v]) => v);
    return `/admin/timetable${p.length ? "?" + new URLSearchParams(p) : ""}`; };
  const live = shown.filter((l) => state(l) === "live");

  const tile = (l: WeekLesson) => { const s = state(l); return <details key={l.id} name="tt" className={`tt2 ${s}`} style={{ ["--c" as string]: l.colour }}>
    <summary><span className="tm">{l.starts}–{l.ends}{s === "live" && <i className="pulse" aria-label="Live now" />}</span>
      <b>{l.subject}</b><span>{l.level} · {l.teacher ? l.teacher.split(" ")[0] : "no teacher"}</span>
      {s === "cancelled" && <em>Cancelled</em>}</summary>
    <div className="pop" role="dialog" aria-label={`${l.name} ${l.starts}`}>
      <p className="pt"><b>{l.name}</b> <span className="muted">{l.code}</span></p>
      <p className="ps">{nice(l.date, { weekday: "long", day: "numeric", month: "long" })} · {l.starts}–{l.ends}{s === "live" ? " · live now" : s === "done" ? " · finished" : ""}</p>
      <p className="ps">{l.teacher ?? "No teacher set"} · {l.students} student{l.students === 1 ? "" : "s"}{l.away ? ` · ${l.away} away` : ""}</p>
      <div className="pa">
        {l.link && s !== "cancelled" ? <a className={`abtn sm${s === "live" || s === "soon" ? " pri" : ""}`} href={l.link} target="_blank" rel="noopener">{joinLabel(l.link)}</a> : !l.link ? <span className="pill mute">No lesson link</span> : null}
        <Link className="abtn sm" href={`/admin/register/${l.id}`}>Register</Link>
        {l.course && <a className="abtn sm" href={classroomUrl(l.course)} target="_blank" rel="noopener">Classroom</a>}
        <Link className="abtn sm" href={`/admin/timetable-setup#c-${l.group_id}`}>Lesson times</Link>
      </div>
    </div>
  </details>; };

  return <>
    <div className="top"><div><h1>Timetable</h1><div className="sub">The week’s lessons. Click a lesson to join it, open its register or its Google Classroom. Lesson times and teachers are set in <Link href="/admin/timetable-setup">Timetable setup</Link>.</div></div></div>
    <div className="tools" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
      <div className="segl" role="group" aria-label="Week">
        <Link href={q({ w: addDays(monday, -7) })} aria-label="Previous week">←</Link>
        <Link href={q({ w: thisWeek })} aria-current={monday === thisWeek ? "true" : undefined}>This week</Link>
        <Link href={q({ w: addDays(monday, 7) })} aria-label="Next week">→</Link>
      </div>
      <b style={{ fontSize: 16 }}>{nice(monday, { day: "numeric", month: "short" })} – {nice(addDays(monday, 6), { day: "numeric", month: "short", year: "numeric" })}</b>
      <span style={{ flex: 1 }} />
      {levels.length > 1 && <div className="segl" role="group" aria-label="Level">{["All", ...levels].map((l) => <Link key={l} href={q({ level: l === "All" ? "" : l })} aria-current={l === level ? "true" : undefined}>{l}</Link>)}</div>}
      {teachers.length > 1 && <form method="get" action="/admin/timetable" style={{ display: "flex", gap: 6 }}>{sp.w && <input type="hidden" name="w" value={monday} />}{level !== "All" && <input type="hidden" name="level" value={level} />}
        <select name="teacher" defaultValue={teacher} aria-label="Teacher" className="mini"><option value="">All teachers</option>{teachers.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
        <button className="abtn sm" type="submit">Show</button></form>}
    </div>
    {skipped && <p className="note msg">No lessons this week (holiday). Showing the next week with lessons.</p>}
    {live.length > 0 && <p className="note msg" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}><b>Live now:</b>{live.map((l) => l.link ? <a key={l.id} className="abtn sm pri" href={l.link} target="_blank" rel="noopener">{l.name} · {joinLabel(l.link).replace("Join ", "")}</a> : <span key={l.id}>{l.name}</span>)}</p>}
    {shown.length === 0 ? <p className="empty">No lessons this week.</p> :
    <div className="tw"><table className="ttable tt2t"><thead><tr><th>Time</th>{days.map((d) => { const date = addDays(monday, d - 1); return <th key={d} className={date === today ? "today" : undefined}>{DAYS[d]} <span className="muted">{nice(date, { day: "numeric", month: "short" })}</span>{date === today && <span className="pill info" style={{ marginLeft: 6 }}>Today</span>}</th>; })}</tr></thead><tbody>
      {times.map((tm) => <tr key={tm}><td className="mono">{tm}</td>{days.map((d) => <td key={d} className={addDays(monday, d - 1) === today ? "today" : undefined}>{shown.filter((l) => l.weekday === d && l.starts === tm).map(tile)}</td>)}</tr>)}
    </tbody></table></div>}
  </>;
}
