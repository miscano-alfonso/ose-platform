import { requireViewer } from "@/lib/auth";
import { myOnes } from "@/lib/teacher-area";
import { teacherOneWork, type OneWork } from "@/lib/one-courses";
import { markOneTaughtAction, addMyHoursAction, removeMyHoursAction, saveIdeaAction, deleteIdeaAction } from "../../../actions";
import { myIdeas, IDEA_STATUS, type Idea } from "@/lib/workshop-ideas";
import { DAYLONG, dlong, hm, gbp } from "../fmt";
import { GuideSlides } from "../../../GuideSlides";
import { TEACHER_GUIDES } from "../../../guides";

export const dynamic = "force-dynamic";

export default async function Ones({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const [sp, me] = await Promise.all([searchParams, requireViewer()]);
  const [d, work, ideas] = await Promise.all([myOnes(me.id), teacherOneWork(me.id), myIdeas(me.id)]);
  return <>
    <div className="top"><div><h1>1:1s and workshops</h1><div className="sub">Your bookings, and the hours you offer for 1:1s</div></div><span className="grow" /><GuideSlides slides={TEACHER_GUIDES.ones.slides} title={TEACHER_GUIDES.ones.title} /></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    <div className="dgrid"><div className="dstack">
      <section className="card"><h2>Booked 1:1s</h2><p className="cs">Teach each 1:1 from its own Meet link (in your Google Calendar and on My day), signed in with your school account: Google Meet’s log then marks it taught, and it goes into your pay, within a couple of hours.</p>
        {d.bookings.length === 0 ? <p className="empty">No 1:1s booked.</p> : d.bookings.map((b) => <div className="li" key={b.id}>
          <span className="on-when"><span>{dlong(b.at)}</span><b>{hm(b.at)}</b></span>
          <div className="t on-lines"><b>{b.child}</b><span>{b.level} {b.subject}</span><span>{b.minutes} min{b.audience === "public" ? " · new family" : ""}</span>{b.focus && <span>“{b.focus}”</span>}</div>
          {b.past ? <form action={markOneTaughtAction}><input type="hidden" name="id" value={b.id} /><span className="pill mute" title="Meet’s log marks it taught within a couple of hours">Logging from Meet</span> <button className="abtn sm" type="submit" title="Only if Meet hasn’t logged it, for example you joined with another account">Mark taught</button></form>
            : <span className="pill info" title="The Meet invitation is in your Google Calendar">Meet in your calendar</span>}
        </div>)}</section>
      <section className="card"><h2>Workshops</h2>
        {d.workshops.length === 0 ? <p className="empty">None coming up.</p> : d.workshops.map((w) => <div className="li" key={w.id}>
          <span className="on-when"><span>{dlong(w.at)}</span><b>{hm(w.at)}</b></span>
          <div className="t on-lines"><b>{w.title}</b><span>{w.minutes} min</span><span>{w.booked} booked</span></div></div>)}
        {/* 27 Nov (Alfonso): teachers suggest workshop ideas; the office sees them on Workshops */}
        <details className="wi-new"><summary className="abtn sm pri">Suggest a workshop</summary>
          <IdeaForm subjects={ideas.subjects} /></details>
        {ideas.ideas.length > 0 && <div className="wi-list"><h3>Your ideas</h3>{ideas.ideas.map((i) => <details key={i.id} className="wi-item">
          <summary><span className="t"><b>{i.title}</b><span>{i.subject} · sent {dlong(i.created_at)}{i.slides_url ? " · slides added" : " · no slides yet"}</span></span>
            <span className={`pill ${IDEA_STATUS[i.status][1]}`}>{IDEA_STATUS[i.status][0]}</span></summary>
          {i.office_note && <p className="wi-note"><b>The office:</b> {i.office_note}</p>}
          {i.status === "scheduled" ? <p className="cs">It’s been set up as a workshop. Thank you!</p> : <IdeaForm subjects={ideas.subjects} idea={i} />}
          {(i.status === "new" || i.status === "not_now") && <form action={deleteIdeaAction} className="wi-del"><input type="hidden" name="id" value={i.id} /><button className="lnk" type="submit">Remove this idea</button></form>}
        </details>)}</div>}
      </section>
    </div>
    {work.length > 0 && <section className="card ow"><h2>1:1 work</h2><p className="cs">From each student’s 1:1 Classroom. Mark and comment in Classroom: each piece of work opens there, on the student’s own work and its private comments.</p>
      <div className="ow-grid">{work.map((c) => <div key={c.id} className="ow-col"><div className="ow-head"><b>{c.student}</b><span className="muted">{c.subject ?? c.name ?? "1:1"}</span>
          {c.link && <a className="abtn sm" href={c.link} target="_blank" rel="noopener">Classroom</a>}</div>
        {c.items.length === 0 ? <p className="empty" style={{ textAlign: "left" }}>No work set yet.</p>
          : c.items.map((w) => <a key={w.id} className="ow-item" href={w.link ?? c.link ?? "#"} target="_blank" rel="noopener" title="Opens in Google Classroom, with the private comments">
            <span className="t"><b>{w.title}</b><span>{w.due_at ? `Due ${dlong(w.due_at)}` : "No due date"}</span></span><WorkPill w={w} /></a>)}</div>)}</div></section>}
    <section className="card"><h2>My 1:1 hours</h2><p className="cs">Parents can book you in these hours, except when you’re teaching. Changes don’t affect 1:1s already booked.</p>
      {d.hours.length === 0 ? <p className="empty">You don’t offer any 1:1 hours yet.</p> : d.hours.map((h) => <div className="li" key={h.id}>
        <div className="t"><b>{DAYLONG[h.weekday]}</b><span>{h.from}–{h.to}</span></div>
        <form action={removeMyHoursAction}><input type="hidden" name="id" value={h.id} /><button className="abtn sm" type="submit">Remove</button></form></div>)}
      {d.teacherId && <form action={addMyHoursAction} className="eform" style={{ marginTop: 12, alignItems: "end" }}>
        <label className="fld">Day<select name="weekday" defaultValue="5">{DAYLONG.slice(1).map((n, i) => <option key={n} value={i + 1}>{n}</option>)}</select></label>
        <label className="fld">From<input type="time" name="from" defaultValue="16:00" required /></label>
        <label className="fld">To<input type="time" name="to" defaultValue="17:00" required /></label>
        <button className="abtn sm pri" type="submit">Add hours</button></form>}
      <p className="note" style={{ marginTop: 10 }}>1:1s are paid with your lessons once marked as taught{d.bookings.length ? "" : ""}.</p>
    </section></div>
  </>;
}

/** How a piece of 1:1 work stands, for the teacher. */
function WorkPill({ w }: { w: OneWork }) {
  if (w.status === "returned") return <span className="pill good">{w.points != null && w.max ? `${w.points}/${w.max}` : "Returned"}</span>;
  if (w.status === "handed_in") return <span className="pill warn">{w.late ? "Handed in late · to mark" : "Handed in · to mark"}</span>;
  if (w.status === "missing") return <span className="pill bad">Missing</span>;
  return <span className="pill mute">{w.status === "due" ? "Not handed in yet" : "Set"}</span>;
}

/** 27 Nov: suggest a workshop (or change one already sent): title, subject, overview, and slides (optional, can be added later). */
function IdeaForm({ subjects, idea }: { subjects: string[]; idea?: Idea }) {
  const list = `wi-subjects-${idea?.id ?? "new"}`;
  return <form action={saveIdeaAction} className="wi-form">{idea && <input type="hidden" name="id" value={idea.id} />}
    <label className="fld">Title<input name="title" required minLength={3} maxLength={120} defaultValue={idea?.title} placeholder="e.g. A Christmas Carol: the ghosts up close" /></label>
    <label className="fld">Subject<input name="subject" required minLength={2} maxLength={80} list={list} defaultValue={idea?.subject} placeholder="Choose or type" />
      <datalist id={list}>{subjects.map((n) => <option key={n} value={n} />)}</datalist></label>
    <label className="fld">Overview<textarea name="overview" required minLength={20} maxLength={3000} rows={5} defaultValue={idea?.overview} placeholder="What it covers, who it’s for (level or age), roughly how long, and what students will take away." /></label>
    <label className="fld">Slides (optional)<input name="slides" type="url" maxLength={500} defaultValue={idea?.slides_url ?? ""} placeholder="Link to your Google Slides: you can add it later" /></label>
    <button className="abtn sm pri" type="submit">{idea ? "Save changes" : "Send to the office"}</button>
  </form>;
}
