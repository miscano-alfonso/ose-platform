import Link from "next/link";
import { attendanceOverview } from "@/lib/attendance";
import { meetStatus, unmatchedPeople, unplacedCalls, usualTimes } from "@/lib/meet";
import { classroomStatus } from "@/lib/classroom";
import { siteBase } from "@/lib/social";
import { saveGoogleAppAction, disconnectGoogleAction, syncMeetAction, saveAlertAction, matchPersonAction, notALessonAction, syncClassroomAction, assignMeetCodeAction, timesFromMeetAction } from "../../actions";

export const dynamic = "force-dynamic";
const dm = (d: string) => new Date(d.slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const wd = (d: string) => DAY[new Date(d + "T12:00:00Z").getUTCDay()];
const ago = (iso: string) => { const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 2 ? "just now" : m < 90 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} hours ago` : dm(iso); };
const MARK: Record<string, [string, string]> = { present: ["✓", "Present"], late: ["L", "Late"], absent: ["✗", "Absent"], approved_absence: ["E", "Approved absence"] };

export default async function Attendance({ searchParams }: { searchParams: Promise<{ term?: string; tab?: string; cls?: string; low?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const [d, g, joins, base, unplaced] = await Promise.all([attendanceOverview(sp.term ?? null, sp.cls ?? null), meetStatus(await siteBase()), unmatchedPeople(), siteBase(), unplacedCalls()]);
  const firstDay = d.terms[0]?.starts_on ?? "";
  const tab = ["students", "lessons", "absences", "joins", "google"].includes(sp.tab ?? "") ? sp.tab! : g.connected ? "students" : "google";
  const gc = tab === "google" && g.connected ? await classroomStatus() : null;
  const pct = g.alert.pct, low = d.students.filter((s) => s.pct != null && s.pct < pct);
  const rows = sp.low ? low : d.students;
  const upcomingAbs = d.absences.filter((a) => a.upcoming).length;
  const q = (o: Record<string, string | undefined>) => "/admin/attendance?" + new URLSearchParams(Object.entries({ term: d.term?.id, tab, cls: sp.cls, ...o }).filter(([, v]) => v) as [string, string][]);
  const TABS: [string, string][] = [["students", "Students"], ["lessons", "Lesson by lesson"], ["absences", `Reported absences${upcomingAbs ? ` (${upcomingAbs})` : ""}`],
    ["joins", `Check Meet joins${joins.people.length ? ` (${joins.people.length})` : ""}`], ["google", g.connected ? "Google Meet" : "Connect Google Meet"]];
  return <>
    <div className="top"><div><h1>Attendance</h1><div className="sub">{d.term ? `${d.term.name} · ` : ""}taken automatically from Google Meet</div></div>
      <span className="grow" />
      {g.connected && <form action={syncMeetAction}><input type="hidden" name="tab" value={tab} /><button className="abtn sm" type="submit">Sync now</button></form>}</div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    {!g.connected && tab !== "google" && <p className="note msg">Google Meet isn’t connected yet, so there are no marks to show. <Link href={q({ tab: "google" })}>Connect it</Link>.</p>}

    <nav className="tabs" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>{d.terms.map((t) => <Link key={t.id} href={q({ term: t.id })} className={`abtn sm${t.id === d.term?.id ? " pri" : ""}`}>Term {t.number}</Link>)}</nav>

    <div className="tiles">
      <div className="tile"><span className="k">Attendance this term</span><span className="v">{d.overall == null ? "—" : `${d.overall}%`}</span><span className="h">all students, all classes</span></div>
      <div className="tile"><span className="k">Lessons held this term</span><span className="v">{d.held}</span><span className="h">{d.firstHeld ? `since ${dm(d.firstHeld)}` : "none yet"}</span></div>
      <div className="tile"><span className="k">Where it comes from</span><span className="v" style={{ fontSize: 20 }}>Google Meet</span>
        <span className="h">{g.connected ? `${g.sync.at ? `synced ${ago(g.sync.at)}` : "not synced yet"} · late after 5 min` : "not connected"}</span></div>
      <div className={`tile${low.length ? " alert" : ""}`}><span className="k">Below {pct}%</span><span className="v">{low.length}</span><span className="h">students</span></div>
      <form action={saveAlertAction} className="tile"><input type="hidden" name="tab" value={tab} /><span className="k">Weekly alert email</span><span className="v" style={{ fontSize: 20 }}>{g.alert.on ? "On" : "Off"}</span>
        <span className="h" style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}><label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><input type="checkbox" name="on" defaultChecked={g.alert.on} /> Fridays 16:00 below</label>
          <input type="number" name="pct" min={10} max={95} step={5} defaultValue={pct} className="mini" style={{ width: 58 }} />% <button className="abtn sm" type="submit">Save</button></span></form>
    </div>

    <div className="segl" role="tablist" style={{ marginBottom: 14 }}>{TABS.map(([k, l]) => <Link key={k} href={q({ tab: k })} aria-current={tab === k ? "true" : undefined}>{l}</Link>)}</div>


    {tab === "students" && <>
      <p style={{ margin: "0 0 10px" }}><Link href={q({ low: sp.low ? undefined : "1" })} className="abtn sm">{sp.low ? "Show everyone" : `Only students below ${pct}%`}</Link></p>
      <div className="tw"><table><thead><tr><th>Student</th><th>Level</th><th className="n">Lessons</th><th className="n">Late</th><th className="n">Left early</th><th className="n">Absent</th><th className="n">Approved absences</th><th>Attendance</th><th>Last absence</th></tr></thead><tbody>
        {rows.length === 0 ? <tr><td colSpan={9} className="muted" style={{ textAlign: "center", padding: 20 }}>{g.connected ? "Nobody to show." : "No marks yet: connect Google Meet."}</td></tr> : rows.map((s) => <tr key={s.id}>
          <td><Link href={`/admin/families?q=${encodeURIComponent(s.name)}`}><b>{s.name}</b></Link></td><td>{s.level}</td><td className="n">{s.attended}/{s.held}</td><td className="n">{s.late}</td><td className="n">{s.left_early}</td><td className="n">{s.absent}</td><td className="n">{s.approved || "—"}</td>
          <td><div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 130 }}><div className="track"><i style={{ width: `${s.pct ?? 0}%`, background: s.pct != null && s.pct < pct ? "var(--warn)" : undefined }} /></div>
            <span style={{ fontVariantNumeric: "tabular-nums", color: s.pct != null && s.pct < pct ? "var(--warn)" : undefined, fontWeight: s.pct != null && s.pct < pct ? 600 : undefined }}>{s.pct == null ? "—" : `${s.pct}%`}</span></div></td>
          <td>{s.last_absence ? dm(s.last_absence) : "—"}</td></tr>)}
      </tbody></table></div></>}

    {tab === "lessons" && <>
      <form method="get" action="/admin/attendance" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        <input type="hidden" name="tab" value="lessons" />{d.term && <input type="hidden" name="term" value={d.term.id} />}
        <select name="cls" defaultValue={d.cls?.id} className="mini" aria-label="Class">{d.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><button className="abtn sm" type="submit">Show</button>
        <span className="note" style={{ flex: 1, minWidth: 260 }}>Nobody takes a register: each mark comes from Google Meet (who joined, when, and when they left). Late = joined more than 5 min after the start; left early = left more than 5 min before the end. Click a lesson date to correct a mark.</span></form>
      <div className="tw"><table><thead><tr><th>Student</th>{d.grid.lessons.map((l) => <th key={l.id} className="n"><Link href={`/admin/register/${l.id}`} title="Open this lesson to correct a mark">{wd(l.date)} {dm(l.date)}</Link></th>)}<th className="n">Term</th></tr></thead><tbody>
        {d.grid.rows.length === 0 ? <tr><td colSpan={d.grid.lessons.length + 2} className="muted" style={{ textAlign: "center", padding: 20 }}>No lessons yet.</td></tr> : d.grid.rows.map((r) => <tr key={r.id}><td><b>{r.name}</b></td>
          {d.grid.lessons.map((l) => { const m = r.marks[l.id]; return <td key={l.id} className="n">{m ? <span className={`mark m-${m.mark}`} title={`${MARK[m.mark]?.[1] ?? m.mark}${m.joined ? ` · joined ${m.joined}` : ""}${m.left ? `, left ${m.left}` : ""}${m.mins != null ? ` · ${m.mins} min` : ""}`}>{MARK[m.mark]?.[0] ?? "?"}{m.early ? "↘" : ""}</span> : <span className="muted">—</span>}</td>; })}
          <td className="n">{r.pct == null ? "—" : `${r.pct}%`}</td></tr>)}
      </tbody></table></div>
      <div className="legend" style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 14.5 }}>{Object.entries(MARK).map(([k, [t, l]]) => <span key={k}><span className={`mark m-${k}`}>{t}</span> {l}</span>)}<span><span className="mark m-present">✓↘</span> Left early</span></div></>}

    {tab === "absences" && <div className="tw"><table><thead><tr><th>Lesson</th><th>Student</th><th>Class</th><th>Reason</th><th>Status</th><th>Reported</th></tr></thead><tbody>
      {d.absences.length === 0 ? <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: 20 }}>No absences reported. Parents report them from their dashboard.</td></tr> : d.absences.map((a) => <tr key={a.id}>
        <td><b>{dm(a.date)}</b> {a.time}</td><td>{a.student}</td><td>{a.class}</td><td>{a.reason}{a.note && <><br /><span className="muted">{a.note}</span></>}</td>
        <td><span className={`pill ${a.upcoming ? "info" : "mute"}`}>{a.upcoming ? "Approved · coming up" : "Approved absence"}</span></td><td>{dm(a.reported)} by parent</td></tr>)}
    </tbody></table></div>}

    {tab === "joins" && <>
      <p className="note" style={{ margin: "0 0 10px" }}>{joins.people.length ? <>{joins.people.length} {joins.people.length === 1 ? "person" : "people"} joined lessons ({joins.joins} joins) without a Google account or Meet name we could tie to a student, usually a parent’s or sibling’s account. Say who each one is <b>once</b>: every lesson they joined is updated, and their email is remembered for next time. Children marked absent in those lessons are listed first.</> : null}</p>
      <section className="card">{joins.people.length === 0 ? <p className="empty">Nothing to check.</p> : joins.people.map((p) => <form key={p.key} action={matchPersonAction} className="li" style={{ flexWrap: "wrap" }}>
        <input type="hidden" name="key" value={p.key} />
        <div className="t"><b>“{p.who}”</b><span>{p.email && p.email !== p.who ? `${p.email} · ` : ""}{p.lessons} lesson{p.lessons === 1 ? "" : "s"} in {p.classes} · {dm(p.first)}{p.last !== p.first ? ` – ${dm(p.last)}` : ""}</span></div>
        {p.roster.length > 0 && <select name="student" className="mini" aria-label="Who was it?">{p.roster.map((s) => <option key={s.id + s.cls} value={s.id}>{s.name}{p.classes.includes(",") ? ` (${s.cls})` : ""}{s.absent ? ` · marked absent ${s.absent}×` : ""}</option>)}</select>}
        {p.roster.length > 0 && <button className="abtn sm pri" type="submit">This is them</button>}<button className="abtn sm" type="submit" name="ignore" value="1">Not a student</button></form>)}</section></>}

    {tab === "google" && <section className="card"><h2>Google Meet</h2>
      {g.connected ? <>
        <p className="cs">Connected by {g.by}{g.at ? ` on ${dm(g.at)}` : ""}. The site reads Google’s Meet log (who joined each lesson’s Meet, when, and for how long) every few hours and every morning. Google keeps this log for 6 months.</p>
        <p>{g.sync.at ? <>Last sync {ago(g.sync.at)}{g.sync.by && g.sync.by !== "auto" ? ` by ${g.sync.by}` : ""}: {g.sync.joins ?? 0} new joins across {g.sync.lessons ?? 0} lessons.{g.sync.error ? <span className="pill bad" style={{ marginLeft: 8 }}>{g.sync.error}</span> : null}</> : "Not synced yet."}</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
          <form action={syncMeetAction}><input type="hidden" name="tab" value="google" /><button className="abtn pri" type="submit">Sync now</button></form>
          <form action={syncMeetAction} className="eform"><input type="hidden" name="tab" value="google" /><label className="fld">Read again from<input type="date" name="from" required defaultValue={firstDay} /></label><button className="abtn" type="submit">Re-read</button></form>
          <form action={disconnectGoogleAction}><button className="abtn" type="submit">Disconnect</button></form></div>
        {g.sync.fetched != null && <p className="note" style={{ marginTop: 10 }}>In that sync Google reported {g.sync.fetched} Meet join{g.sync.fetched === 1 ? "" : "s"} (everyone leaving a call in the school’s Google Workspace); {g.sync.placed ?? 0} fitted a timetabled lesson ({g.sync.lessonsInWindow ?? 0} lessons in the period).
          {g.sync.fetched === 0 ? " Google returned nothing: check you connected with a Workspace super admin, and that lessons ran in Meet calls owned by the school’s accounts." : ""}</p>}
        {unplaced.length > 0 && (() => {
          const D = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
          const rows = unplaced.map((u) => { const url = u.code ? `https://meet.google.com/${u.code.slice(0, 3)}-${u.code.slice(3, 7)}-${u.code.slice(7)}` : null;
            const cls = url ? d.allClasses.find((c) => c.meet === url) ?? null : null; const real = usualTimes(u).map((t) => `${D[t.weekday]} ${t.time}`).join(", ");
            return { u, cls, real, differs: !!cls && !!real && real !== (cls.times ?? "") }; });
          const fixable = rows.filter((r) => r.differs);
          return <div style={{ marginTop: 14 }}><h3 style={{ margin: "0 0 6px", font: "600 17px Jost, sans-serif" }}>Meet calls not matched to a lesson ({unplaced.length})</h3>
          <p className="note" style={{ margin: "0 0 8px" }}>These calls happened but didn’t line up with a timetabled lesson. Where the Meet code already belongs to a class, the class’s timetabled times don’t match when the calls really happen: use the Meet times. Where it doesn’t, choose the class. Then press Re-read.</p>
          {fixable.length > 1 && <form action={timesFromMeetAction} style={{ margin: "0 0 10px" }}>{fixable.map((r) => <input key={r.u.code} type="hidden" name="code" value={r.u.code} />)}
            <button className="abtn pri" type="submit">Use the Meet times for all {fixable.length} classes</button></form>}
          <div className="tw" style={{ marginBottom: 0 }}><table><thead><tr><th>Meeting code</th><th>Class</th><th>Timetabled</th><th>Calls happen</th><th className="n">Joins</th><th /></tr></thead><tbody>
            {rows.map(({ u, cls, real, differs }) => <tr key={u.code || u.organizer || ""}>
              <td className="mono">{u.code ? `${u.code.slice(0, 3)}-${u.code.slice(3, 7)}-${u.code.slice(7)}` : "—"}<div className="muted" style={{ fontSize: 13 }}>{u.organizer ?? ""}</div></td>
              <td>{cls ? <b>{cls.code}</b> : <span className="muted">Not linked</span>}{cls && <div className="muted" style={{ fontSize: 13 }}>{cls.name.replace(/ \(.*\)$/, "")}</div>}</td>
              <td style={{ fontSize: 14 }}>{cls ? cls.times ?? <span className="muted">No times</span> : "—"}</td>
              <td style={{ fontSize: 14 }}><b>{real || u.when.join(", ")}</b><br /><span className="muted">{dm(u.first.slice(0, 10))} – {dm(u.last.slice(0, 10))}</span></td>
              <td className="n">{u.joins}</td>
              <td>{cls ? (differs ? <form action={timesFromMeetAction}><input type="hidden" name="code" value={u.code} /><button className="abtn sm" type="submit">Use the Meet times</button></form> : <span className="muted" style={{ fontSize: 13 }}>{real ? "Press Re-read" : "One-off, not a weekly time: nothing to change"}</span>)
                : u.code ? <form action={assignMeetCodeAction} style={{ display: "flex", gap: 4 }}><input type="hidden" name="code" value={u.code} />
                <select name="group" className="mini" defaultValue=""><option value="" disabled>Choose a class</option>{d.allClasses.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name.replace(/ \(.*\)$/, "")}{c.meet ? " · has a Meet link" : ""}</option>)}</select><button className="abtn sm" type="submit">Link</button></form> : null}
                {u.code && <form action={notALessonAction} style={{ marginTop: 4 }}><input type="hidden" name="code" value={u.code} /><button className="lnk" type="submit" title="A staff meeting, parents’ call or one-off: hide it">Not a lesson</button></form>}</td></tr>)}
          </tbody></table></div></div>; })()}
        {gc && <div style={{ marginTop: 18, borderTop: "1px solid var(--line)", paddingTop: 14 }}><h3 style={{ margin: "0 0 6px", font: "600 17px Jost, sans-serif" }}>Google Classroom</h3>
          <p className="cs" style={{ margin: "0 0 10px" }}>Read-only, with the same Google connection: who has accepted their class invitation, the work set in each class, and each student’s hand-ins and marks. Parents see it under Assignments, and report percentages come from the marks on returned work. {gc.linked} class{gc.linked === 1 ? " is" : "es are"} linked to a Classroom (Classes → Edit).</p>
          {gc.granted === false ? <><p className="note msg">To add Classroom: in Google Cloud Console turn on the <a href="https://console.cloud.google.com/apis/library/classroom.googleapis.com" target="_blank" rel="noopener"><b>Google Classroom API</b></a> for the same project, then press Connect Google again and sign in as before. Meet keeps working meanwhile.</p>
            <a className="abtn pri" href="/admin/meet-api?action=login">Connect Google again</a></>
          : <><p style={{ margin: "0 0 8px" }}>{gc.info.at ? <>Last read {ago(gc.info.at)}{gc.info.by && gc.info.by !== "auto" ? ` by ${gc.info.by}` : ""}: {gc.info.classes ?? 0} classes, {gc.info.work ?? 0} pieces of work, {gc.info.submissions ?? 0} hand-ins.{gc.info.error ? <span className="pill bad" style={{ marginLeft: 8 }}>{gc.info.error}</span> : null}</> : "Not read yet."} Reads again every 6 hours.</p>
            <form action={syncClassroomAction}><button className="abtn" type="submit">Sync Classroom</button></form>
            {!!gc.info.problems?.length && <ul className="note" style={{ margin: "10px 0 0", paddingLeft: 18 }}>{gc.info.problems.map((p) => <li key={p}>{p}</li>)}</ul>}</>}</div>}
        <p className="note" style={{ marginTop: 10 }}>Lessons are matched by each class’s Meet link (Classes → Meet link) or, if a class has none, by its teacher’s Google account and the timetabled time. Marks you correct on a lesson’s register are never overwritten.</p>
      </> : <>
        <p className="cs">Attendance comes straight from Google: no AttendList, nothing for teachers to do. A Google Workspace super admin for the school connects once; the access is read-only (the Meet log only).</p>
        <ol style={{ margin: "0 0 14px", paddingLeft: 20, lineHeight: 1.6 }}>
          <li>In <a href="https://console.cloud.google.com/" target="_blank" rel="noopener">Google Cloud Console</a>, signed in with the school’s Workspace admin: create a project (e.g. “OH-SO ED site”).</li>
          <li>APIs &amp; Services → Library → turn on <b>Admin SDK API</b>.</li>
          <li>OAuth consent screen: choose <b>Internal</b>, app name “OH-SO ED attendance”.</li>
          <li>Credentials → Create credentials → OAuth client ID → <b>Web application</b>. Under Authorised redirect URIs add:<br /><code style={{ userSelect: "all" }}>{g.redirectUri || `${base}/admin/meet-api?action=callback`}</code></li>
          <li>Paste the Client ID and Client secret below, save, then press Connect Google and sign in as the Workspace super admin.</li>
        </ol>
        {!g.fromEnv && <form action={saveGoogleAppAction} className="eform" style={{ marginBottom: 12 }}>
          <label className="fld">Client ID<input name="client_id" type="text" defaultValue={g.clientId} required style={{ width: 340 }} autoComplete="off" spellCheck={false} data-1p-ignore="" data-lpignore="true" placeholder="….apps.googleusercontent.com" /></label>
          <label className="fld">Client secret<input name="client_secret" type="text" placeholder={g.hasApp ? "Saved (leave blank to keep)" : "GOCSPX-…"} style={{ width: 240 }} autoComplete="off" spellCheck={false} data-1p-ignore="" data-lpignore="true" /></label>
          <button className="abtn" type="submit">Save</button></form>}
        {g.hasApp ? <a className="abtn pri" href="/admin/meet-api?action=login">Connect Google</a> : <p className="note">Save the Client ID and secret to continue.</p>}
        {g.hasApp && !g.fromEnv && <form action={disconnectGoogleAction} style={{ marginTop: 10 }}><input type="hidden" name="forget" value="1" /><button className="abtn sm" type="submit">Remove the saved Client ID</button></form>}
      </>}
    </section>}
  </>;
}
