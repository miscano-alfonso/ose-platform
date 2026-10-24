import Link from "next/link";
import type { Metadata } from "next";
import { getCourses } from "@/lib/data";
import { DAYS } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Timetable", description: "Weekly lesson times for every course. All times are UK time; each lesson is 45 minutes." };

export default async function Timetable({ searchParams }: { searchParams: Promise<{ level?: string }> }) {
  const sp = await searchParams;
  const all = (await getCourses()).filter((c) => !c.is_next);
  const levels = [...new Set(all.map((c) => c.level))];
  const lv = levels.includes(sp.level || "") ? sp.level! : levels[0];
  const rows = all.filter((c) => c.level === lv && c.shows_times).flatMap((c) => (c.slots || []).map((s) => ({ c, ...s })))
    .sort((a, b) => a.d - b.d || a.t.localeCompare(b.t));
  const soon = all.filter((c) => c.level === lv && !c.shows_times);
  return (<>
    <section className="s-phead"><div className="wrap"><h1>Timetable</h1><p>Live lessons each week. All times are UK time.</p></div></section>
    <section className="s-sec"><div className="wrap">
      <nav className="tabs" aria-label="Level">{levels.map((l) => <Link key={l} href={`/timetable?level=${encodeURIComponent(l)}`} className={l === lv ? "on" : ""}>{l}</Link>)}</nav>
      <div className="ptab-wrap"><table className="ptab"><thead><tr><th>Day</th><th>Time</th><th>Subject</th><th>Teacher</th></tr></thead><tbody>
        {rows.map((r, i) => <tr key={i}><td>{i && rows[i - 1].d === r.d ? "" : <b>{DAYS[r.d]}</b>}</td><td>{r.t}</td>
          <td><span className="dot" style={{ background: r.c.colour }} />{r.c.subject}</td><td>{r.c.teacher}</td></tr>)}
      </tbody></table></div>
      {soon.length > 0 && <p className="ttnote">Times to be announced (waiting list or full): {soon.map((c) => c.subject).join(", ")}.</p>}
    </div></section>
  </>);
}
