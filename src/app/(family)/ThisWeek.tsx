import Link from "next/link";
import type { WeekLesson } from "@/lib/family";

// 27 Nov (Alfonso): "This week" module for the student and parent dashboards: the week's lessons, day by day.
// Once this week has no lessons left it shows next week's ("Next week").
const day = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", timeZone: "Europe/London" });

export function ThisWeek({ rows, parent, more, next }: { rows: WeekLesson[]; parent?: boolean; more: { href: string; label: string }; next?: boolean }) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const days = [...new Set(rows.map((r) => r.date))];
  const left = rows.filter((r) => r.status === "on" || r.status === "moved").length;
  return <section className="dx-card c6 fx-week">
    <header><h2>{next ? "Next week" : "This week"}</h2><span className="dx-sub">{rows.length === 0 || next ? "" : left === 0 ? "All done" : `${left} to go`}</span><Link className="dx-more" href={more.href}>{more.label} →</Link></header>
    {rows.length === 0 ? <p className="muted">No lessons this week.</p> : <div className="dx-scroll">
      {days.map((d) => <div key={d} className={`fx-wk${d === today ? " is-today" : ""}`}>
        <div className="fx-wk-day">{d === today ? `Today · ${day(d)}` : day(d)}</div>
        {rows.filter((r) => r.date === d).map((r) => {
          const what = parent ? `${r.first}: ${r.class}` : r.class;
          const body = <><span className="dot" style={{ background: r.colour }} /><div className="t"><b>{what}</b><span>{r.time}–{r.ends}{r.teacher ? ` · ${r.teacher}` : ""}</span></div>
            {r.status === "cancelled" ? <span className="pill bad">Cancelled</span> : r.status === "moved" ? <span className="pill warn">Moved</span> : r.status === "done" ? <span className="pill mute">Done</span> : null}
            {r.absent && r.status !== "cancelled" && <span className="pill mute">Away</span>}</>;
          const cls = `fx-row${r.status === "done" || r.status === "cancelled" ? " past" : ""}`;
          return !parent && r.group_id && !r.taster ? <Link key={r.key} href={`/student/class/${r.group_id}`} className={cls}>{body}</Link> : <div key={r.key} className={cls}>{body}</div>;
        })}
      </div>)}
    </div>}
  </section>;
}
