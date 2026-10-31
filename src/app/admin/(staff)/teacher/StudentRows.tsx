import Link from "next/link";
import { sendLabels } from "@/lib/send";
import type { MyStudent } from "@/lib/teacher-area";
import { dm } from "./fmt";

const age = (dob: string) => { const b = new Date(dob + "T12:00:00Z"), n = new Date(); let a = n.getUTCFullYear() - b.getUTCFullYear(); if (n < new Date(Date.UTC(n.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()))) a--; return a; };
const attPill = (p: number | null) => p === null ? <span className="muted">—</span> : <span className={`pill ${p >= 90 ? "good" : p >= 75 ? "warn" : "bad"}`}>{p}%</span>;

/** The teacher's students as cards: name, classes with attendance, SEND (shared), Google account, birthday and points. */
export function StudentRows({ list, showClasses = true }: { list: MyStudent[]; showClasses?: boolean }) {
  return <div className="ms-grid">{list.map((s) => <article key={s.id} className={`ms-card${s.send ? " has-send" : ""}`} id={`s-${s.id}`}>
    <header><div><b>{s.name}</b>{s.known_as && <span className="muted"> · likes to be called {s.known_as}</span>}</div>
      {s.send && <span className="arr-needs">{sendLabels(s.needs, s.send_details).map((n) => <span key={n} className="pill warn">{n}</span>)}</span>}</header>
    <dl className="ms-dl">
      {showClasses && <div><dt>Classes</dt><dd>{(s.classes ?? []).map((c) => <span key={c.id} className="ms-cls">{c.name} {attPill(c.lessons ? c.att : null)}</span>)}</dd></div>}
      {!showClasses && <div><dt>Attendance</dt><dd>{attPill((s.classes ?? [])[0]?.lessons ? (s.classes ?? [])[0].att : null)} <span className="muted">in this class</span></dd></div>}
      <div><dt>This term</dt><dd>{attPill(s.att)} <span className="muted">attendance in your classes</span> · {s.points} point{s.points === 1 ? "" : "s"}</dd></div>
      <div><dt>Google account</dt><dd>{s.email ?? <span className="muted">Not given</span>}{s.in_classroom === false && <span className="pill warn" style={{ marginLeft: 6 }}>Not in Classroom yet</span>}</dd></div>
      {(s.dob || s.year_group) && <div><dt>Age</dt><dd>{s.dob ? <>{age(s.dob)} · birthday {dm(s.dob)}</> : ""}{s.year_group ? `${s.dob ? " · " : ""}Year ${s.year_group}` : ""}</dd></div>}
      {s.send && <div className="ms-send"><dt>SEND</dt><dd>{s.send_details}{s.adjustments && <><br /><b>What helps:</b> {s.adjustments}</>}</dd></div>}
    </dl>
    <div className="ms-acts"><Link className="abtn sm" href={`/admin/messages/new?student=${s.id}`}>Message the family</Link></div>
  </article>)}</div>;
}

/** The same students as a table: one line each, with the Message button. */
export function StudentTable({ list, showClasses = true }: { list: MyStudent[]; showClasses?: boolean }) {
  return <div className="tw"><table className="ms-table"><thead><tr><th>Student</th>{showClasses && <th>Classes</th>}<th className="n">Attendance</th><th className="n">Points</th><th>SEND</th><th>Google account</th><th>Birthday</th><th /></tr></thead>
    <tbody>{list.map((s) => <tr key={s.id}>
      <td><b>{s.name}</b>{s.known_as && <div className="muted" style={{ fontSize: 13.5 }}>“{s.known_as}”</div>}</td>
      {showClasses && <td>{(s.classes ?? []).map((c) => <div key={c.id} className="ms-cls">{c.name} {attPill(c.lessons ? c.att : null)}</div>)}</td>}
      <td className="n">{attPill(s.att)}</td><td className="n">{s.points}</td>
      <td>{s.send ? <span className="arr-needs" style={{ justifyContent: "flex-start" }} title={`${s.send_details ?? ""}${s.adjustments ? ` · What helps: ${s.adjustments}` : ""}`}>{sendLabels(s.needs, s.send_details).map((n) => <span key={n} className="pill warn">{n}</span>)}</span> : <span className="muted">—</span>}</td>
      <td>{s.email ?? <span className="muted">Not given</span>}{s.in_classroom === false && <div><span className="pill warn">Not in Classroom</span></div>}</td>
      <td>{s.dob ? <>{dm(s.dob)} <span className="muted">({age(s.dob)})</span></> : <span className="muted">—</span>}</td>
      <td><Link className="abtn sm" href={`/admin/messages/new?student=${s.id}`}>Message</Link></td></tr>)}</tbody></table></div>;
}

/** Cards or list, remembered in the link (?view=list). */
export function ViewSwitch({ view, href }: { view: string; href: (v: string) => string }) {
  return <div className="segl" role="group" aria-label="View">{[["cards", "Cards"], ["list", "List"]].map(([k, l]) =>
    <Link key={k} scroll={false} href={href(k)} aria-current={view === k ? "true" : undefined}>{l}</Link>)}</div>;
}
