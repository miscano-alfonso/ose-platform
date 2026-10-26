import { requireParent } from "@/lib/family-auth";
import { kids, assignments } from "@/lib/family";
import { Head } from "../../fmt";

const TABS: [string, string][] = [["due", "Due"], ["overdue", "Overdue"], ["submitted", "Submitted"]];
export default async function Assignments({ searchParams }: { searchParams: Promise<{ kid?: string; tab?: string }> }) {
  const [sp, f] = await Promise.all([searchParams, requireParent()]);
  const ks = await kids(f.id);
  const kid = ks.find((k) => k.id === sp.kid) ?? ks[0], tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : "due";
  const all = kid ? await assignments([kid.id]) : [];
  const list = all.filter((w) => w.status === tab);
  const now = Date.now();
  return <>
    <Head title="Assignments" sub="Work set in your children’s classes, updated through the day" />
    {kid?.classes.some((c) => c.invited) && <p className="note msg">{kid.first} hasn’t joined {kid.classes.filter((c) => c.invited).map((c) => c.subject).join(" and ")} yet. {kid.first} needs to accept the Google Classroom invitation sent to {kid.email ?? "their Google account"} to see the work and join lessons.</p>}
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
      {ks.length > 1 && <div className="segl">{ks.map((k) => <a key={k.id} href={`/parent/assignments?kid=${k.id}&tab=${tab}`} aria-current={k.id === kid?.id ? "true" : undefined}>{k.first}</a>)}</div>}
      <div className="segl">{TABS.map(([k, l]) => <a key={k} href={`/parent/assignments?kid=${kid?.id ?? ""}&tab=${k}`} aria-current={tab === k ? "true" : undefined}>{l} ({all.filter((w) => w.status === k).length})</a>)}</div></div>
    <section className="card">{list.length === 0 ? <p className="empty">{all.length === 0 ? "Work set in Google Classroom appears here once the school connects Classroom." : tab === "overdue" ? "Nothing overdue. Well done!" : "Nothing here."}</p>
      : list.map((w, i) => { const d = w.due_at ? Math.round((Date.parse(w.due_at) - now) / 864e5) : null;
        return <div className="li" key={i}><span className="dot" style={{ background: w.colour }} /><div className="t"><b>{w.link ? <a href={w.link} target="_blank" rel="noopener">{w.title}</a> : w.title}</b>
          <span>{w.class} · {w.status === "submitted" ? `Handed in${w.late ? " late" : ""}` : w.due_at ? (d === 0 ? "Due today" : d === 1 ? "Due tomorrow" : d! < 0 ? `${-d!} days overdue` : `Due ${new Date(w.due_at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}`) : "No due date"}</span></div>
          {w.status === "submitted" ? (w.points != null && w.max ? <span className="pill good">Marked {Math.round(w.points / w.max * 100)}%</span> : <span className="pill info">Waiting for a mark</span>) : w.status === "overdue" ? <span className="pill bad">Missing</span> : d != null && d <= 2 ? <span className="pill warn">Due soon</span> : <span className="pill mute">To do</span>}</div>; })}</section>
    <p className="note">{kid?.first ?? "Your child"} does this work in Google Classroom with their school account. This list keeps you up to date; marks also feed the Progress score on reports.</p>
  </>;
}
