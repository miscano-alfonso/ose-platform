import Link from "next/link";
import { getGroups } from "@/lib/admin-data";
import { candidateCounts, candidates, pushHistory, startTicked, previewFor, DEFAULT_SUBJECT, DEFAULT_BODY, FIELDS } from "@/lib/class-push";
import { isTestMode } from "@/lib/test-mode";
import { sendPushAction } from "../../actions";
import { PushForm } from "./PushForm";

export const dynamic = "force-dynamic";

// 28 Nov (Alfonso): Marketing → Fill a class. The emptiest classes first; for one, the families who could take it and one
// email inviting them to a free taster. What each send led to (tasters booked, enrolments) shows beside it.
const dm = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export default async function FillClasses({ searchParams }: { searchParams: Promise<{ level?: string; g?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const all = (await getGroups()).filter((g) => ["open", "priority", "waitlist"].includes(g.status));
  const levels = [...new Set(all.map((g) => g.level))];
  const level = sp.level === "all" || levels.includes(sp.level ?? "") ? sp.level! : "main";
  const MAIN = ["KS3", "Pre-GCSE"];
  const shown = all.filter((g) => level === "all" ? true : level === "main" ? MAIN.includes(g.level) : g.level === level)
    .sort((a, b) => (a.capacity ? a.taken / a.capacity : 1) - (b.capacity ? b.taken / b.capacity : 1) || a.taken - b.taken);
  const [counts, history, test] = await Promise.all([candidateCounts(shown.map((g) => g.id)), pushHistory(), isTestMode().catch(() => false)]);
  const last = (id: string) => history.find((h) => h.group_id === id);
  const sel = all.find((g) => g.id === sp.g);
  const list = sel ? await candidates(sel.id) : [];
  const prev = sel ? await previewFor(sel.id, undefined, DEFAULT_SUBJECT, DEFAULT_BODY) : null;
  const mine = sel ? history.filter((h) => h.group_id === sel.id) : [];
  const href = (l: string, g?: string) => `/admin/fill-classes?${new URLSearchParams({ ...(l !== "main" ? { level: l } : {}), ...(g ? { g } : {}) })}`;
  return <>
    <div className="top"><div><h1>Fill a class</h1><div className="sub">Classes with the most places free, and the families who could take them: current students at the same level who don’t do that subject, and families on the waiting list. Invite them to a free taster in one email; the link opens the taster form with the class (and their child) already chosen.</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    {test && <p className="note">Test mode is on: invitations are held, not sent to families. “Send me a test” still comes to you.</p>}
    <div className="segl" role="group" aria-label="Level" style={{ marginBottom: 12 }}>
      {[["main", "KS3 & Pre-GCSE"], ...MAIN.filter((l) => levels.includes(l)).map((l) => [l, l]), ...levels.filter((l) => !MAIN.includes(l)).map((l) => [l, l]), ["all", "All"]].map(([k, l]) =>
        <Link key={k} href={href(k)} aria-current={level === k ? "true" : undefined}>{l}</Link>)}</div>

    <div className="tw"><table><thead><tr><th>Class</th><th>Teacher</th><th>Places</th><th>Status</th><th className="n">Could try it</th><th>Last invitation</th><th /></tr></thead><tbody>
      {shown.map((g) => { const pct = g.capacity ? Math.min(100, Math.round((g.taken / g.capacity) * 100)) : 0, h = last(g.id);
        return <tr key={g.id} className={g.id === sel?.id ? "fc-sel" : undefined}>
          <td><span className="dot" style={{ background: g.colour }} /><b>{g.level} {g.subject}</b><div className="muted" style={{ fontSize: 13 }}>{g.code}{g.slots ? ` · ${g.slots}` : ""}</div></td>
          <td>{g.teacher ?? <span className="muted">Not set</span>}</td>
          <td><div className="fill"><div className="track"><i className={g.is_full ? "full" : ""} style={{ width: `${pct}%` }} /></div><span>{g.taken}/{g.capacity ?? "∞"}</span></div></td>
          <td>{g.trial ? <span className="pill info">Trial · {g.waiting} of {g.waitlist_threshold}</span> : g.status === "open" ? <span className="pill good">Open</span> : <span className="pill info">Waiting list · {g.waiting} of {g.waitlist_threshold}</span>}</td>
          <td className="n">{(counts[g.id] ?? 0) + (g.waiting || 0)}</td>
          <td style={{ fontSize: 14 }}>{h ? <>{dm(h.created_at)} · {h.sent + h.held} invited<div className="muted" style={{ fontSize: 13 }}>{h.tasters} taster{h.tasters === 1 ? "" : "s"} booked · {h.enrolled} enrolled</div></> : <span className="muted">None yet</span>}</td>
          <td><Link className={`abtn sm${g.id === sel?.id ? "" : " pri"}`} href={href(level, g.id) + "#invite"}>Find families</Link></td></tr>; })}
      {!shown.length && <tr><td colSpan={7} className="muted">No open classes at this level.</td></tr>}
    </tbody></table></div>

    {sel && prev && <section className="card" id="invite">
      <h2>Invite families to try {sel.level} {sel.subject}</h2>
      <p className="cs">{prev.times}{prev.teacher ? ` with ${prev.teacher}` : ""} · {sel.taken} of {sel.capacity ?? "∞"} places taken. Ticked to start with: families who haven’t said no to marketing emails, whose child has nothing else at that time, hasn’t had a taster of it, and wasn’t asked in the last 30 days.</p>
      <PushForm group={sel.id} list={list} ticked={list.filter(startTicked).map((c) => c.key)} vars={{ cls: prev.cls, times: prev.times, teacher: prev.teacher ?? "one of our teachers", school: prev.school }}
        subject0={DEFAULT_SUBJECT} body0={DEFAULT_BODY} action={sendPushAction} fields={FIELDS} />
      {mine.length > 0 && <><h3 style={{ marginTop: 18 }}>Sent before</h3>
        <div className="tw" style={{ marginBottom: 0 }}><table><thead><tr><th>Sent</th><th>By</th><th className="n">Invited</th><th className="n">Tasters booked</th><th className="n">Enrolled</th></tr></thead><tbody>
          {mine.map((h) => <tr key={h.id}><td>{dm(h.created_at)}</td><td>{h.by ?? "—"}</td><td className="n">{h.sent}{h.held ? ` (+${h.held} held)` : ""}{h.failed ? ` · ${h.failed} failed` : ""}</td><td className="n">{h.tasters}</td><td className="n">{h.enrolled}</td></tr>)}
        </tbody></table></div></>}
      <p className="note">Tasters booked from these emails show in <Link href="/admin/tasters">Tasters</Link> with the rest of their journey (reminders, follow-up, enrolment).</p>
    </section>}
  </>;
}
