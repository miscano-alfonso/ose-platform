import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { studentProfile } from "@/lib/student-overview";
import { sendLabels } from "@/lib/send";

export const dynamic = "force-dynamic";
const day = (d: string) => new Date(d.length > 10 ? d : d + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London" });
const MARK: Record<string, [string, string]> = { present: ["good", "Present"], late: ["warn", "Late"], absent: ["bad", "Absent"], approved_absence: ["info", "Approved absence"] };
const WORK: Record<string, [string, string]> = { missing: ["bad", "Missing"], handed: ["info", "Handed in"], marked: ["good", "Marked"], due: ["mute", "Not due yet"], nodate: ["mute", "No due date"] };
const tone = (p: number | null) => p == null ? "mute" : p >= 90 ? "good" : p >= 85 ? "info" : p >= 70 ? "warn" : "bad";
const age = (dob: string) => { const b = new Date(dob + "T12:00:00Z"), n = new Date(); let a = n.getUTCFullYear() - b.getUTCFullYear(); if (n.getUTCMonth() < b.getUTCMonth() || (n.getUTCMonth() === b.getUTCMonth() && n.getUTCDate() < b.getUTCDate())) a--; return a; };

// Admin → Students → one student (5 Nov): classes and attendance, Classroom work, reward points and SEND in one place.
export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }] = await Promise.all([params, requireStaff()]);
  const p = await studentProfile(id);
  if (!p) notFound();
  const { s } = p;
  const active = p.classes.filter((c) => c.status === "active" && !c.taster);
  const att = active.reduce((a, c) => a + c.attended, 0), held = active.reduce((a, c) => a + c.held, 0), pct = held ? Math.round((att / held) * 100) : null;
  const missing = p.work.filter((w) => w.status === "missing"), past = p.work.filter((w) => w.status !== "due" && w.status !== "nodate");
  const handed = past.filter((w) => w.status !== "missing").length;
  const termPts = p.points.reduce((a, x) => a + x.points, 0);
  const send = s.has_send === "yes" ? sendLabels(s.needs, s.details) : [];
  return <>
    <p className="backlink"><Link className="abtn sm" href="/admin/students">← Students</Link></p>
    <div className="top"><div><h1>{s.name}{s.known_as && s.known_as !== s.name.split(" ")[0] ? <span className="h1-code">“{s.known_as}”</span> : null}</h1>
      <div className="sub">{s.dob ? `${age(s.dob)} years old · ` : ""}{s.year_group ? `Year ${s.year_group} · ` : ""}Family: <Link href={`/admin/families/${s.parent_id}`}>{s.family}</Link></div></div>
      <span className="grow" /><Link className="abtn" href={`/admin/messages/write?aud=student&target=${s.id}`}>Message {s.name.split(" ")[0]}</Link>
      <Link className="abtn" href={`/admin/messages/write?aud=parent&target=${s.parent_id}`}>Message the parent</Link></div>
    <div className="tiles">
      <div className="tile"><span className="k">Attendance {p.term ? `· ${p.term.name}` : ""}</span><span className="v">{pct == null ? "–" : `${pct}%`}</span><span className="h">{held ? `${att} of ${held} lessons` : "no lessons marked yet"}</span></div>
      <div className="tile"><span className="k">Work handed in</span><span className="v">{past.length ? `${Math.round((handed / past.length) * 100)}%` : "–"}</span><span className="h">{handed} of {past.length} due this year</span></div>
      <div className={`tile${missing.length ? " alert" : ""}`}><span className="k">Missing work</span><span className="v">{missing.length}</span><span className="h">{missing.length ? "past the due date" : "nothing missing"}</span></div>
      <div className="tile"><span className="k">Reward points</span><span className="v">{termPts}</span><span className="h">this year</span></div>
    </div>
    <div className="dgrid">
      <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
        <section className="card" style={{ margin: 0 }}><h2>Classes</h2>
          {p.classes.length === 0 ? <p className="empty">No classes this year.</p> : <div className="tw" style={{ border: 0, margin: 0 }}><table><thead><tr><th>Class</th><th>Teacher</th><th>Attendance</th><th>Classroom</th></tr></thead><tbody>
            {p.classes.map((c) => <tr key={c.id}><td><b>{c.name}</b> <span className="muted" style={{ fontSize: 13 }}>{c.code}</span>{c.taster ? <> <span className="pill info">Taster</span></> : c.status !== "active" ? <> <span className="pill mute">{c.status}</span></> : null}</td>
              <td>{c.teacher ?? <span className="muted">—</span>}</td>
              <td>{c.held ? <><span className={`pill ${tone(Math.round((c.attended / c.held) * 100))}`}>{Math.round((c.attended / c.held) * 100)}%</span> <span className="muted" style={{ fontSize: 13 }}>{c.attended} of {c.held}</span></> : <span className="muted">—</span>}</td>
              <td>{c.in_classroom == null ? <span className="muted">—</span> : c.in_classroom ? <span className="pill good">In Classroom</span> : <span className="pill warn">Invited</span>}</td></tr>)}
          </tbody></table></div>}</section>
        <section className="card" style={{ margin: 0 }}><h2>Classroom work</h2>
          {p.work.length === 0 ? <p className="empty">No work from Google Classroom yet.</p> : <ul className="st-work">{p.work.map((w) => <li key={w.id}>
            <span className={`pill ${WORK[w.status][0]}`}>{WORK[w.status][1]}</span>
            <span className="t"><b>{w.title}</b><span>{w.class}{w.due_at ? ` · due ${day(w.due_at)}` : ""}{w.late ? " · late" : ""}{w.points != null ? ` · ${w.points}${w.max ? `/${w.max}` : ""}` : ""}</span></span>
            {w.link ? <a className="abtn sm" href={w.link} target="_blank" rel="noopener">Open in Classroom</a> : <span />}</li>)}</ul>}</section>
      </div>
      <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
        {(s.has_send === "yes" || s.has_send === "discuss") && <section className="card" style={{ margin: 0 }}><h2>SEND</h2>
          {s.has_send === "discuss" ? <p>The parent would like to talk about support.</p> : <>
            <p style={{ margin: "0 0 8px" }}>{send.map((x) => <span key={x} className="pill warn" style={{ marginRight: 4 }}>{x}</span>)}</p>
            {s.details && <p style={{ margin: "0 0 6px" }}>{s.details}</p>}{s.adjustments && <p style={{ margin: "0 0 6px" }}><b>What helps:</b> {s.adjustments}</p>}
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>{s.share ? "Shared with teachers." : "Not shared with teachers."}</p></>}
          <p style={{ margin: "8px 0 0" }}><Link href={`/admin/families/${s.parent_id}`}>Edit on the family page</Link></p></section>}
        <section className="card" style={{ margin: 0 }}><h2>Recent lessons</h2>
          {p.marks.length === 0 ? <p className="empty">No attendance marked yet.</p> : p.marks.map((m, i) => <div key={i} className="li">
            <span className={`pill ${MARK[m.mark]?.[0] ?? "mute"}`}>{MARK[m.mark]?.[1] ?? m.mark}</span><div className="t"><b>{m.class}</b><span>{day(m.date)}{m.minutes != null ? ` · ${m.minutes} min` : ""}</span></div></div>)}</section>
        <section className="card" style={{ margin: 0 }}><h2>Reward points</h2>
          {p.points.length === 0 ? <p className="empty">No points yet.</p> : p.points.map((x, i) => <div key={i} className="li">
            <span className="pill good">+{x.points}</span><div className="t"><b>{x.reason}</b><span>{x.class} · {x.teacher} · {day(x.on)}</span></div></div>)}</section>
        <section className="card" style={{ margin: 0 }}><h2>Accounts</h2>
          <p style={{ margin: "0 0 4px" }}><b>Google account:</b> {s.email ?? <span className="muted">not given</span>}</p>
          <p style={{ margin: 0 }}><b>Parent:</b> {s.family} · {s.parent_email}</p></section>
      </div>
    </div>
  </>;
}
