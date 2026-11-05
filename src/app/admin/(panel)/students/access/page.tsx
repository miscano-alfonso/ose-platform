import Link from "next/link";
import { StudentsTabs } from "../../../StudentsTabs";
import { accessSettings, meetAccess, strangers, type MeetAccessType } from "@/lib/lesson-access";
import { testMode } from "@/lib/test-mode";
import { saveLessonAccessAction, checkMeetAccessAction } from "../../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lesson access" };
const day = (d: string) => new Date(d.slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London" });
const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const ago = (iso: string) => { const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
const ACCESS: Record<MeetAccessType, [string, string, string]> = {
  RESTRICTED: ["good", "Restricted", "Only people invited go straight in"],
  TRUSTED: ["warn", "Trusted", "Anyone with a school Google account goes straight in"],
  OPEN: ["bad", "Open", "Anyone with the link goes straight in"] };
const RANK = (a: MeetAccessType | null) => a === "OPEN" ? 0 : a === "TRUSTED" ? 1 : a ? 3 : 2;   // the ones to fix first
const KIND: Record<string, [string, string]> = { unknown: ["warn", "Not identified"], not_student: ["bad", "Not a student"], other_class: ["info", "Student from another class"] };

// Students → Lesson access (5 Nov): who can get into lessons, and who did.
export default async function LessonAccess({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const [set, acc, list, tm] = await Promise.all([accessSettings(), meetAccess(false), strangers(14).catch(() => []), testMode().catch(() => ({ on: true }))]);
  const open = acc.rows.filter((r) => r.access === "OPEN").length, notRestricted = acc.rows.filter((r) => r.access && r.access !== "RESTRICTED").length;
  const week = list.filter((s) => Date.parse(s.joined) > Date.now() - 7 * 864e5);
  return <>
    <div className="top"><div><h1>Students</h1><div className="sub">Lesson access · who can get into lessons, and anyone who was in one but isn’t on that class’s register.</div></div></div>
    <StudentsTabs current="access" />
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    <div className="tiles">
      <div className={`tile${week.length ? " alert" : ""}`}><span className="k">Not on the register</span><span className="v">{week.length}</span><span className="h">in lessons this week</span></div>
      <div className={`tile${open ? " alert" : ""}`}><span className="k">Meet links left open</span><span className="v">{acc.at ? open : "–"}</span><span className="h">{acc.at ? (notRestricted ? `${notRestricted} of ${acc.rows.length} not restricted` : `all ${acc.rows.length} restricted`) : "not checked yet"}</span></div>
      <div className="tile"><span className="k">Join through the dashboard</span><span className="v" style={{ fontSize: 20 }}>{set.viaDashboard ? "On" : "Off"}</span><span className="h">{set.viaDashboard ? "students must be signed in" : "join links work for anyone"}</span></div>
    </div>

    <section className="card la-sec">
      <h2>Not on the register <span className="muted" style={{ fontWeight: 400, fontSize: 15 }}>· last 14 days</span></h2>
      <p className="muted" style={{ marginTop: 0 }}>People in a lesson’s Google Meet who aren’t one of that class’s students. Staff, the school’s own Google accounts and taster children aren’t listed. It updates when attendance is synced from Google Meet.</p>
      {list.length === 0 ? <p className="empty" style={{ margin: 0 }}>Nobody. Everyone in lessons in the last 14 days was on the class’s register.</p> :
      <div className="tw"><table className="la-table"><thead><tr><th>Lesson</th><th>Who joined</th><th>What it is</th><th>In the call</th></tr></thead>
        <tbody>{list.map((s, i) => <tr key={i}>
          <td><b>{s.cls}</b><div className="muted">{day(s.date)}{s.teacher ? ` · ${s.teacher}` : ""}</div></td>
          <td><b>{s.who}</b>{s.email && s.email !== s.who && <div className="muted">{s.email}</div>}{!s.email && <div className="muted">signed out of Google</div>}</td>
          <td><span className={`pill ${KIND[s.kind][0]}`}>{KIND[s.kind][1]}</span>
            {s.kind === "other_class" && s.student && <div className="muted">{s.student}, booked on a different class</div>}
            {s.kind === "not_student" && <div className="muted">the office marked them “Not a student”</div>}
            {s.kind === "unknown" && <div className="muted">{s.maybe ? <>Probably: {s.maybe}. </> : null}<Link href="/admin/attendance?tab=joins">Check Meet joins</Link></div>}</td>
          <td style={{ whiteSpace: "nowrap" }}>{hm(s.joined)}{s.left ? `–${hm(s.left)}` : ""}</td></tr>)}</tbody></table></div>}
    </section>

    <section className="card la-sec" id="meet">
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}><h2 style={{ margin: 0 }}>Each class’s Google Meet setting</h2><span className="grow" />
        {acc.can === "ok" && <form action={checkMeetAccessAction}><button className="abtn sm" type="submit">Check now</button></form>}</div>
      <p className="muted">{acc.can !== "ok" ? <>The site reads these with the school account that hosts lessons (ose@). {acc.can === "reconnect" ? "Connect it again" : "Connect it"} under <Link href="/admin/attendance?tab=google">Google Meet &amp; Classroom</Link> first.</>
        : acc.at ? `Checked with Google ${ago(acc.at)} (every 6 hours when this page is opened).` : "Not checked yet."}</p>
      <div className="la-how"><b>What every class should be:</b> <span className="pill good">Restricted</span>, with <b>“Anyone with the meeting link can ask to join”</b> unticked. In the Meet, open <b>Host controls</b> (the lock) → <b>Meeting access</b>. With both, only the class’s invited students go straight in and nobody else can ask. Google doesn’t let the site see that second box, so it can’t be checked here.
        <div className="muted" style={{ marginTop: 6 }}>Once it’s on: a student who opens Meet in the wrong Google account (a parent’s or a sibling’s) can’t get in at all. Joining through the dashboard helps, because it opens Meet in their own account.</div></div>
      {acc.rows.length === 0 ? <p className="empty">No classes this year have a Google Meet link.</p> :
      <div className="tw"><table className="la-table"><thead><tr><th>Class</th><th>Meet</th><th>Access</th></tr></thead>
        <tbody>{[...acc.rows].sort((a, b) => RANK(a.access) - RANK(b.access)).map((r) => <tr key={r.gid}><td><b>{r.cls}</b>{r.teacher && <div className="muted">{r.teacher}</div>}</td>
          <td>{r.meet ? <a href={r.link} target="_blank" rel="noopener">{r.meet}</a> : <span className="muted">not Google Meet</span>}</td>
          <td>{r.access ? <><span className={`pill ${ACCESS[r.access][0]}`}>{ACCESS[r.access][1]}</span><div className="muted">{ACCESS[r.access][2]}</div></> : <span className="muted">{r.problem ?? (acc.at ? "not known" : "not checked yet")}</span>}</td></tr>)}</tbody></table></div>}
    </section>

    <section className="card la-sec" id="dashboard">
      <h2>Join lessons through the dashboard</h2>
      <p className="muted" style={{ marginTop: 0 }}>When this is on, lesson reminders link to the student’s dashboard instead of the lesson. To get in, the student has to be signed in to <b>their own</b> account (a sign-in link goes to their own email), and booked on that class. Meet then opens in their own Google account. Parents and anyone with a forwarded reminder are asked to sign in or turned away, and old reminder links stop working. Taster lessons and 1:1s aren’t affected.</p>
      {tm.on && <p className="note" style={{ margin: "0 0 10px" }}>Test mode is on, so reminders only go to admins and the test list. You can switch this on and try it as a test student without families seeing anything.</p>}
      <form action={saveLessonAccessAction} className="la-set"><label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><input type="checkbox" name="dash" defaultChecked={set.viaDashboard} /> Students join lessons through their dashboard</label>
        <button className="abtn sm pri" type="submit">Save</button></form>
    </section>
  </>;
}
