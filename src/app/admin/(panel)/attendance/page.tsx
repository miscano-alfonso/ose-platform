import Link from "next/link";
import { getAttendance } from "@/lib/ops";
import { makeLessonDatesAction } from "../../actions";

const fmt = (d: string, o: Intl.DateTimeFormatOptions) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", o);
const addDays = (d: string, n: number) => { const x = new Date(d + "T12:00:00"); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };

export default async function Attendance({ searchParams }: { searchParams: Promise<{ term?: string; week?: string; ok?: string }> }) {
  const sp = await searchParams;
  const { terms, term, week, lessons, classes } = await getAttendance(sp.term ?? null, sp.week ?? null);
  const today = new Date().toISOString().slice(0, 10);
  const days = [...new Set(lessons.map((l) => l.lesson_date))];
  const href = (w: string) => `/admin/attendance?term=${term?.id}&week=${w}`;
  const due = lessons.filter((l) => l.lesson_date <= today && l.status === "scheduled").length;
  return <>
    <div className="top"><div><h1>Attendance</h1><div className="sub">{term ? `${term.name} · ${fmt(term.starts_on, { day: "numeric", month: "short" })} – ${fmt(term.ends_on, { day: "numeric", month: "short" })} · ${term.lessons} lessons` : "No terms set up"}</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}
    <nav className="tabs" style={{ marginBottom: 14 }}>{terms.map((t) => <Link key={t.id} href={`/admin/attendance?term=${t.id}`} aria-current={t.id === term?.id ? "page" : undefined} className={`abtn sm${t.id === term?.id ? " pri" : ""}`}>Term {t.number}</Link>)}</nav>

    {term && term.lessons === 0 && <section className="card"><h2>No lesson dates for {term.name} yet</h2>
      <p className="cs">Lesson dates are made from the timetable, skipping holidays. Do this once the class times for the term are set; lesson times added later are filled in automatically.</p>
      <form action={makeLessonDatesAction}><input type="hidden" name="term" value={term.id} /><button className="abtn pri" type="submit">Create lesson dates for {term.name}</button></form></section>}

    {term && term.lessons > 0 && <>
      <div className="top" style={{ marginBottom: 10 }}>
        <Link className="abtn sm" href={href(addDays(week, -7))}>← Previous week</Link>
        <b>Week of {fmt(week, { day: "numeric", month: "long" })}</b>
        <Link className="abtn sm" href={href(addDays(week, 7))}>Next week →</Link>
        {due > 0 && <span className="pill warn">{due} register{due === 1 ? "" : "s"} to take</span>}
        <span className="grow" /><form action={makeLessonDatesAction}><input type="hidden" name="term" value={term.id} /><button className="abtn sm" type="submit">Refresh lesson dates</button></form>
      </div>
      {days.length === 0 && <p className="empty">No lessons this week (holiday).</p>}
      {days.map((d) => <section key={d} className="card"><h2>{fmt(d, { weekday: "long", day: "numeric", month: "long" })}</h2>
        {lessons.filter((l) => l.lesson_date === d).map((l) => <div className="li" key={l.id}>
          <span className="dot" style={{ background: l.colour }} />
          <div className="t"><b>{l.starts_at} {l.name} <span className="muted" style={{ fontWeight: 400 }}>{l.code}</span></b>
            <span>{l.teacher ?? "No teacher"} · {l.students} student{l.students === 1 ? "" : "s"}{l.tasters ? ` · ${l.tasters} taster${l.tasters === 1 ? "" : "s"}` : ""}</span></div>
          {l.status === "cancelled" ? <span className="pill bad">Cancelled</span>
            : l.status === "taught" ? <span className="pill good">{l.present}/{l.marked} present</span>
            : l.lesson_date <= today ? <span className="pill warn">Register not taken</span> : <span className="pill mute">Upcoming</span>}
          <Link className="abtn sm" href={`/admin/register/${l.id}`}>{l.status === "taught" ? "View register" : "Register"}</Link>
        </div>)}</section>)}

      <h2 style={{ font: "600 18px Jost", margin: "22px 0 10px" }}>{term.name} by class</h2>
      <div className="tw"><table><thead><tr><th>Class</th><th>Lessons taught</th><th>Registers taken</th><th>Attendance</th><th>Unexplained absences</th></tr></thead>
        <tbody>{classes.map((c) => <tr key={c.code}><td><b>{c.name}</b> <span className="muted">{c.code}</span></td><td>{c.taught}</td><td>{c.registers}</td>
          <td>{c.pct == null ? <span className="muted">—</span> : <span className={`pill ${c.pct >= 90 ? "good" : c.pct >= 80 ? "warn" : "bad"}`}>{c.pct}%</span>}</td>
          <td>{c.unexplained || <span className="muted">0</span>}</td></tr>)}</tbody></table></div>
      <p className="note">Approved absences (reported by a parent beforehand) don’t count against attendance. Teachers take registers for their own lessons from their dashboard.</p>
    </>}
  </>;
}
