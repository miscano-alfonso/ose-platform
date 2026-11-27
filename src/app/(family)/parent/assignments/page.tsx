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
    <section className="card">{list.length === 0 ? <p className="empty">{all.length === 0 ? "No work from Google Classroom shows here yet. If your child has joined their classes in Classroom with the email you gave us, we’ll link their account; message the office if it doesn’t appear." : tab === "overdue" ? "Nothing overdue. Well done!" : "Nothing here."}</p>
      : list.map((w, i) => { const d = w.due_at ? Math.round((Date.parse(w.due_at) - now) / 864e5) : null;
        // 27 Nov (Alfonso): parents can't open Classroom (they aren't signed in as their child), so each piece of work opens
        // here to show the teacher's post: the instructions, what's attached, when it was set and when it's due
        const when = w.status === "submitted" ? `Handed in${w.late ? " late" : ""}` : w.due_at ? (d === 0 ? "Due today" : d === 1 ? "Due tomorrow" : d! < 0 ? `${-d!} days overdue` : `Due ${new Date(w.due_at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}`) : "No due date";
        const mats = Array.isArray(w.materials) ? w.materials : [];
        return <details className="li as-item" key={i}><summary><span className="dot" style={{ background: w.colour }} /><div className="t"><b>{w.title}</b><span>{w.class} · {when}</span></div>
          {w.status === "submitted" ? (w.points != null && w.max ? <span className="pill good">Marked {Math.round(w.points / w.max * 100)}%</span> : <span className="pill info">Waiting for a mark</span>) : w.sent_back ? <span className="pill warn" title="The teacher returned it to be done again">Sent back to redo</span> : w.status === "overdue" ? <span className="pill bad">Missing</span> : d != null && d <= 2 ? <span className="pill warn">Due soon</span> : <span className="pill mute">To do</span>}
          <svg className="as-chev" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M6 8l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></summary>
          <div className="as-post">
            <p className="as-meta">{w.teacher ? <><b>{w.teacher}</b> posted this</> : "Posted"}{w.posted_at ? ` on ${new Date(w.posted_at).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}` : ""}{w.due_at ? ` · due ${new Date(w.due_at).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}${/[T ](00:00|23:59)/.test(w.due_at) ? "" : ` at ${new Date(w.due_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })}`}` : ""}{w.max ? ` · out of ${w.max}` : ""}</p>
            {w.description ? <div className="as-text">{w.description}</div> : <p className="muted" style={{ margin: 0 }}>The teacher didn’t add instructions to this one{mats.length ? "; it’s in what’s attached below" : ""}.</p>}
            {mats.length > 0 && <ul className="as-mats">{mats.map((m, k) => <li key={k}><span className="pill mute">{m.kind === "video" ? "Video" : m.kind === "link" ? "Link" : m.kind === "form" ? "Form" : "File"}</span> {m.url ? <a href={m.url} target="_blank" rel="noopener">{m.title}</a> : <span>{m.title}</span>}</li>)}</ul>}
            {mats.some((m) => !m.url) && <p className="cs" style={{ margin: 0 }}>Files and forms open in Google Classroom with {kid?.first ?? "your child"}’s school account.</p>}
          </div></details>; })}</section>
    <p className="note">{kid?.first ?? "Your child"} does this work in Google Classroom with their school account. This list keeps you up to date; marks also feed the Progress score on reports.</p>
  </>;
}
