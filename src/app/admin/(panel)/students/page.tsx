import Link from "next/link";
import LiveSearch from "../../LiveSearch";
import { studentOverview, type StudentRow } from "@/lib/student-overview";
import { readClassroomAction, linkClassroomAction } from "../../actions";
import { StudentsTabs } from "../../StudentsTabs";
import { RowLink } from "../../RowLink";
import { withSchool } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Students" };
const day = (d: string) => new Date(d.length > 10 ? d : d + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
const ago = (iso: string) => { const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
const attTone = (p: number | null) => p == null ? "mute" : p >= 90 ? "good" : p >= 85 ? "info" : p >= 70 ? "warn" : "bad";

// Admin → Students (5 Nov): every enrolled student this term, with attendance, Classroom work and reward points in one list.
export default async function Students({ searchParams }: { searchParams: Promise<{ show?: string; q?: string; sort?: string; dir?: string; level?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const [o, joinsN] = await Promise.all([studentOverview(), withSchool((q) => q<{ n: number }>(`select coalesce((value->>'people')::int, (value->>'unmatched')::int, 0) as n from meet_kv where key = 'sync'`)).then((r) => r[0]?.n ?? 0).catch(() => 0)]);
  const show = ["missing", "attendance", "send", "points"].includes(sp.show ?? "") ? sp.show! : "all";
  const q = (sp.q ?? "").toLowerCase().trim();
  const levels = [...new Set(o.rows.flatMap((r) => r.levels.split(", ")))].filter(Boolean).sort();
  const SORTS: Record<string, (a: StudentRow, b: StudentRow) => number> = {
    name: (a, b) => a.name.localeCompare(b.name), missing: (a, b) => b.missing - a.missing || b.due - a.due,
    att: (a, b) => (a.att ?? 999) - (b.att ?? 999), work: (a, b) => (a.due ? a.handed / a.due : 2) - (b.due ? b.handed / b.due : 2), points: (a, b) => b.points - a.points };
  const sort = sp.sort && SORTS[sp.sort] ? sp.sort : show === "missing" ? "missing" : show === "attendance" ? "att" : show === "points" ? "points" : "name";
  const dir = sp.dir === "desc" ? -1 : 1;
  const list = o.rows.filter((r) => (!q || [r.name, r.family, ...r.classes.map((c) => c.code)].some((x) => x.toLowerCase().includes(q)))
    && (!sp.level || r.levels.split(", ").includes(sp.level))
    && (show === "all" || (show === "missing" && r.missing > 0) || (show === "attendance" && r.att != null && r.held >= 3 && r.att < 85) || (show === "send" && r.send.length > 0) || (show === "points" && r.points > 0)))
    .sort((a, b) => SORTS[sort](a, b) * dir || a.name.localeCompare(b.name));
  const href = (x: Record<string, string | undefined>) => "/admin/students?" + new URLSearchParams(Object.entries({ show: show !== "all" ? show : undefined, q: sp.q, level: sp.level, sort: sp.sort, dir: sp.dir, ...x })
    .filter(([, v]) => v) as [string, string][]).toString();
  const th = (label: string, k: string, cls?: string) => { const on = sort === k; return <th className={cls} aria-sort={on ? (dir === 1 ? "ascending" : "descending") : undefined}>
    <Link scroll={false} className="thsort" href={href({ sort: k, dir: on && dir === 1 ? "desc" : undefined })}>{label}{on ? (dir === 1 ? " ↓" : " ↑") : ""}</Link></th>; };
  // Classroom accounts nobody matched, once each (the same person can be in several classes)
  const unmatched = [...(o.classroom.unmatched ?? []).reduce((m, u) => { const x = m.get(u.userId) ?? { userId: u.userId, name: u.name, email: u.email, gids: [] as string[], codes: [] as string[] };
    x.gids.push(u.gid); x.codes.push(u.code); return m.set(u.userId, x); }, new Map<string, { userId: string; name: string; email: string | null; gids: string[]; codes: string[] }>()).values()];
  const t = o.totals, rate = t.due ? Math.round((t.handed / t.due) * 100) : null;
  return <>
    <div className="top"><div><h1>Students</h1><div className="sub">{o.term ? `${o.term.name}` : "The last six weeks"} · attendance from Google Meet, work from Google Classroom, reward points. Work due since {day(o.since)}.</div></div>
      <span className="grow" /><Link className="abtn" href="/admin/rewards">Rewards</Link></div>
    <StudentsTabs current="overview" counts={{ joins: joinsN }} />
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    <div className="tiles">
      <div className="tile"><span className="k">Students</span><span className="v">{t.students}</span><span className="h">enrolled this year</span></div>
      <div className="tile"><span className="k">Work handed in</span><span className="v">{rate == null ? "–" : `${rate}%`}</span><span className="h">{t.handed} of {t.due} pieces due{t.late ? ` · ${t.late} late` : ""}</span></div>
      <Link href={href({ show: "missing", sort: undefined, dir: undefined })} className={`tile${t.missing ? " alert" : ""}`} style={{ textDecoration: "none", color: "inherit" }}><span className="k">Missing work</span><span className="v">{t.missing}</span><span className="h">{t.withMissing ? `from ${t.withMissing} student${t.withMissing === 1 ? "" : "s"}` : "nothing missing"}</span></Link>
      <Link href={href({ show: "attendance", sort: undefined, dir: undefined })} className={`tile${t.lowAtt ? " alert" : ""}`} style={{ textDecoration: "none", color: "inherit" }}><span className="k">Attendance under 85%</span><span className="v">{t.lowAtt}</span><span className="h">students, 3+ lessons</span></Link>
      <Link href={href({ show: "points", sort: undefined, dir: undefined })} className="tile" style={{ textDecoration: "none", color: "inherit" }}><span className="k">Reward points</span><span className="v">{t.points}</span><span className="h">given this term</span></Link>
    </div>
    <div className="st-sync">
      {o.classroom.granted !== true ? <div className="note msg bad" style={{ margin: 0 }}>{o.classroom.granted === null
        ? <>Google isn’t connected, so there’s no Classroom work to show. Connect it under <Link href="/admin/attendance?tab=google">Students → Google Meet &amp; Classroom</Link>.</>
        : <>The API being on isn’t enough: the school’s Google connection was made without permission to read Classroom, so the site can’t {o.classroom.missing!.join(", ")}.
          Press <b>Connect Google again</b>, choose the Google Workspace super admin account used before{o.classroom.by ? ` (it was connected from ${o.classroom.by}’s login)` : ""}, and tick <b>every</b> box on Google’s screen. The site checks that account can still read the Meet log before switching, so attendance can’t break; it stays read-only.
          <div style={{ marginTop: 8 }}><a className="abtn pri sm" href="/admin/meet-api?action=login">Connect Google again</a></div></>}</div>
      : <><span className="muted">{o.classroom.linked === 0 ? "No classes are linked to a Google Classroom yet (Classes → Classroom link)." : o.classroom.error ? `Classroom couldn’t be read: ${o.classroom.error}` : o.classroom.at ? `Classroom last read ${ago(o.classroom.at)} (every 2 hours).` : "Classroom hasn’t been read yet."}</span>
      <form action={readClassroomAction}><input type="hidden" name="back" value="/admin/students" /><button className="abtn sm" type="submit">Read Classroom now</button></form></>}
    </div>
    {o.classroom.at && <p className="muted" style={{ fontSize: 13.5, margin: "6px 0 0" }}>Last Classroom read {ago(o.classroom.at)}: {o.classroom.classes ?? 0} class{o.classroom.classes === 1 ? "" : "es"} read, {o.classroom.work ?? 0} pieces of work, {o.classroom.submissions ?? 0} hand-ins · {o.classroom.linked} class{o.classroom.linked === 1 ? "" : "es"} this year {o.classroom.linked === 1 ? "has" : "have"} a Classroom link{o.classroom.error ? ` · error: ${o.classroom.error}` : ""}.
      {!!o.classroom.problems?.length && <> Couldn’t read: {o.classroom.problems.slice(0, 5).join("; ")}{o.classroom.problems.length > 5 ? "…" : ""}</>}</p>}
    {unmatched.length > 0 && <details className="card st-unm" open={unmatched.length <= 6}><summary><b>Classroom accounts to match ({unmatched.length})</b> <span className="muted">· in a Google Classroom, but their name and email don’t match a student here, so their work isn’t counted</span></summary>
      {unmatched.map((u) => { const inClass = o.rows.filter((r) => r.classes.some((c) => u.gids.includes(c.id)));
        return <form key={u.userId} action={linkClassroomAction} className="st-unm-row"><input type="hidden" name="user" value={u.userId} /><input type="hidden" name="name" value={u.name} /><input type="hidden" name="email" value={u.email ?? ""} />
          <div className="t"><b>{u.name}</b><span className="muted">{u.email ?? "no email shared"} · in {u.codes.join(", ")}</span></div>
          <select name="student" required defaultValue="" className="mini" aria-label={`Who is ${u.name}?`}><option value="" disabled>Who is it?</option>
            {inClass.length > 0 && <optgroup label="Booked on that class">{inClass.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</optgroup>}
            <optgroup label="Everyone">{o.rows.filter((r) => !inClass.includes(r)).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</optgroup></select>
          <button className="abtn sm pri" type="submit">Match</button></form>; })}
      <p className="note" style={{ margin: "10px 0 0" }}>Matching remembers that Classroom account for every class, then reads Classroom again. Teachers or other adults in the class can be left.</p></details>}
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", margin: "14px 0" }}>
      <LiveSearch placeholder="Search student, parent or class" label="Search students" />
      <div className="segl" role="group" aria-label="Show">{[["all", "All"], ["missing", `Missing work (${t.withMissing})`], ["attendance", `Low attendance (${t.lowAtt})`], ["send", "SEND"], ["points", "Points"]].map(([k, l]) =>
        <Link key={k} scroll={false} href={href({ show: k === "all" ? undefined : k, sort: undefined, dir: undefined })} aria-current={show === k ? "true" : undefined}>{l}</Link>)}</div>
      {levels.length > 1 && <div className="segl" role="group" aria-label="Level"><Link scroll={false} href={href({ level: undefined })} aria-current={!sp.level ? "true" : undefined}>All levels</Link>
        {levels.map((l) => <Link key={l} scroll={false} href={href({ level: l })} aria-current={sp.level === l ? "true" : undefined}>{l}</Link>)}</div>}
    </div>
    {list.length === 0 ? <p className="empty">{o.rows.length ? "No students match." : "No students enrolled this year yet."}</p> :
    <div className="tw"><table className="st-table">
      <thead><tr>{th("Student", "name")}<th>Classes</th>{th("Attendance", "att")}{th("Work handed in", "work")}{th("Missing", "missing", "n")}{th("Points", "points", "n")}<th>SEND</th></tr></thead>
      {list.map((r) => <tbody key={r.id} id={`s-${r.id}`}><RowLink href={`/admin/students/${r.id}`}>
        <td><Link href={`/admin/students/${r.id}`} className="row-main"><b>{r.name}</b></Link><div className="muted" style={{ fontSize: 14 }}><Link href={`/admin/families/${r.parent_id}`}>{r.family}</Link></div></td>
        <td style={{ fontSize: 14 }}>{r.classes.map((c) => <div key={c.id} title={c.code}>{c.name}</div>)}</td>
        <td>{r.att == null ? <span className="muted">No lessons marked</span> : <><span className={`pill ${attTone(r.att)}`}>{r.att}%</span> <span className="muted" style={{ fontSize: 13 }}>{r.attended} of {r.held}</span></>}</td>
        <td>{r.due === 0 ? <span className="muted">Nothing due yet</span> : <>
          <span style={{ fontSize: 13.5 }}>{r.handed} of {r.due}{r.late ? ` · ${r.late} late` : ""}{r.marked ? ` · ${r.marked} marked` : ""}</span>
          <div className="st-meter" role="img" aria-label={`${r.handed} of ${r.due} handed in`}><i style={{ width: `${(r.handed / r.due) * 100}%` }} /></div></>}
          {r.missing > 0 && <details className="st-mdet"><summary className="abtn sm">Missing work ({r.missing})</summary>
            <ul className="st-miss">{r.missingList.map((m, i) => <li key={i}><span><b>{m.title}</b><span className="muted"> · {r.classes.find((c) => c.id === m.gid)?.name ?? m.code} · due {day(m.due_at)}</span></span>
              {m.link && <a className="abtn sm" href={m.link} target="_blank" rel="noopener">Open in Classroom</a>}</li>)}
              {r.missing > r.missingList.length && <li className="muted">and {r.missing - r.missingList.length} more (see their page)</li>}</ul>
            {r.notInClassroom > 0 && <p className="note" style={{ margin: "8px 0 0" }}>{r.notInClassroom === r.missing ? "They haven’t joined" : "For some of these they haven’t joined"} the class’s Google Classroom yet, so they may not have seen the work.</p>}
          </details>}</td>
        <td className="n">{r.missing ? <span className="pill bad">{r.missing}</span> : <span className="muted">0</span>}</td>
        <td className="n">{r.points || <span className="muted">0</span>}</td>
        <td>{r.send.map((x) => <span key={x} className="pill warn" style={{ marginRight: 4 }}>{x}</span>)}</td>
      </RowLink>
      </tbody>)}
    </table></div>}
    <p className="note">Work counts once its due date has passed: handed in (or marked) in Google Classroom, or missing. Work without a due date isn’t counted. Attendance is this term’s lessons from Google Meet (approved absences don’t count against it).</p>
  </>;
}
