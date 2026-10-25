import { getTutoring, openTimes } from "@/lib/tutoring";
import { DAY } from "@/lib/ops";
import { money } from "@/lib/format";
import { setTutorRateAction, addAvailabilityAction, removeAvailabilityAction, bookTutoringAction, setTutoringStatusAction } from "../../actions";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const PILL: Record<string, [string, string]> = { booked: ["Booked", "info"], completed: ["Done", "good"], no_show: ["Didn’t come", "warn"], cancelled: ["Cancelled", "mute"] };

export default async function Tutoring({ searchParams }: { searchParams: Promise<{ level?: string; subject?: string; parent?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const d = await getTutoring();
  const times = sp.level && sp.subject ? await openTimes(sp.level, sp.subject) : null;
  const now = new Date().toISOString();
  const upcoming = d.bookings.filter((b) => b.starts_at >= now && b.status === "booked"), past = d.bookings.filter((b) => !(b.starts_at >= now && b.status === "booked")).reverse();
  return <>
    <div className="top"><div><h1>1:1 tutoring</h1><div className="sub">45-minute online 1:1s · {upcoming.length} upcoming</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}

    <h2 style={{ font: "600 20px Jost", margin: "4px 0 10px" }}>Upcoming</h2>
    {upcoming.length === 0 ? <p className="empty">No 1:1s booked.</p> : <Table rows={upcoming} />}

    <section className="card"><h2>Book a 1:1</h2>
      <form className="eform" style={{ marginBottom: 10 }}>
        <label className="fld">Level<select name="level" defaultValue={sp.level ?? ""} required><option value="" disabled>Choose</option>{d.levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        <label className="fld">Subject<select name="subject" defaultValue={sp.subject ?? ""} required><option value="" disabled>Choose</option>{d.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <button className="abtn" type="submit">Find times</button></form>
      {times && (times.length === 0 ? <p className="empty">No free times in the next 4 weeks. Check the teachers’ availability below and that a teacher is set up for this level and subject.</p> :
        <form action={bookTutoringAction} className="eform">
          <input type="hidden" name="level" value={sp.level} /><input type="hidden" name="subject" value={sp.subject} />
          <label className="fld">Time and teacher<select name="slot" required>{times.map((t) => <option key={t.teacher_id + t.starts_at} value={`${t.teacher_id}|${t.starts_at}`}>{when(t.starts_at)} · {t.teacher}</option>)}</select></label>
          <label className="fld">Family<select name="parent" required defaultValue={sp.parent ?? ""}><option value="" disabled>Choose a parent</option>{d.parents.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.email})</option>)}</select></label>
          <label className="fld">Student<input name="student" required maxLength={80} /></label>
          <label className="fld">Student’s Google email<input name="student_email" type="email" maxLength={120} /></label>
          <label className="fld">Help with<input name="focus" maxLength={300} /></label>
          <button className="abtn pri" type="submit">Book</button></form>)}
      <p className="cs" style={{ marginTop: 8 }}>The price comes from the rates below (families with a course place pay the enrolled rate). Online booking and card payment for 1:1s come with the parent area.</p></section>

    <section className="card"><h2>Prices per 45-minute 1:1</h2>
      <div className="tw"><table><thead><tr><th>Level</th><th>Families</th><th>Price</th><th>Teacher is paid</th><th></th></tr></thead>
        <tbody>{d.rates.map((r) => <tr key={r.level_id + r.audience}><td><b>{r.level}</b></td><td>{r.audience === "public" ? "New families" : "Enrolled families"}</td>
          <td colSpan={3}><form action={setTutorRateAction} className="eform" style={{ gap: 6 }}><input type="hidden" name="level" value={r.level_id} /><input type="hidden" name="audience" value={r.audience} />
            <input name="price" className="mini" inputMode="decimal" defaultValue={r.price != null ? (r.price / 100).toFixed(2) : ""} placeholder="£" style={{ width: 90 }} />
            <input name="pay" className="mini" inputMode="decimal" defaultValue={r.pay != null ? (r.pay / 100).toFixed(2) : ""} placeholder="£" style={{ width: 90 }} />
            <button className="abtn sm" type="submit">Save</button></form></td></tr>)}</tbody></table></div></section>

    <section className="card"><h2>When teachers offer 1:1s</h2>
      {d.teachers.map((t) => <div className="li" key={t.id}><div className="t"><b>{t.name}</b>
        <span style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>{d.availability.filter((a) => a.teacher_id === t.id).map((a) => <form key={a.id} action={removeAvailabilityAction} className="slotchip">
          <input type="hidden" name="id" value={a.id} /><span>{DAY[a.weekday]} {a.starts_at}–{a.ends_at}</span><button className="abtn sm" type="submit">Remove</button></form>)}
          {!d.availability.some((a) => a.teacher_id === t.id) && <span className="muted">No 1:1 times</span>}</span></div>
        <form action={addAvailabilityAction} className="eform" style={{ gap: 6 }}><input type="hidden" name="teacher" value={t.id} />
          <select name="weekday" className="mini" defaultValue="1">{[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{DAY[n]}</option>)}</select>
          <input type="time" name="start" className="mini" required defaultValue="16:00" step={900} /><input type="time" name="end" className="mini" required defaultValue="18:00" step={900} />
          <button className="abtn sm" type="submit">Add</button></form></div>)}
      <p className="cs" style={{ marginTop: 8 }}>Lessons, workshops and other 1:1s are taken out automatically, and 1:1s can’t be booked less than 24 hours ahead.</p></section>

    <h2 style={{ font: "600 20px Jost", margin: "22px 0 10px" }}>Recent</h2>
    {past.length === 0 ? <p className="empty">Nothing yet.</p> : <Table rows={past} />}
  </>;
}

function Table({ rows }: { rows: Awaited<ReturnType<typeof getTutoring>>["bookings"] }) {
  return <div className="tw"><table><thead><tr><th>When</th><th>Student</th><th>Family</th><th>Teacher</th><th>Price</th><th>Status</th><th></th></tr></thead>
    <tbody>{rows.map((b) => <tr key={b.id}><td><b>{when(b.starts_at)}</b><div className="muted" style={{ fontSize: 15.5 }}>{b.level} {b.subject}</div></td>
      <td>{b.student}{b.focus && <div className="muted" style={{ fontSize: 15.5 }}>{b.focus}</div>}</td><td>{b.parent}<div className="muted" style={{ fontSize: 15.5 }}>{b.parent_email}</div></td>
      <td>{b.teacher}</td><td>{money(b.price)}</td><td><span className={`pill ${PILL[b.status]?.[1] ?? "mute"}`}>{PILL[b.status]?.[0] ?? b.status}</span></td>
      <td><div className="acts">{b.status === "booked" && <><SBtn id={b.id} s="completed" l="Done" /><SBtn id={b.id} s="no_show" l="Didn’t come" /><SBtn id={b.id} s="cancelled" l="Cancel" /></>}
        {b.status !== "booked" && <SBtn id={b.id} s="booked" l="Undo" />}</div></td></tr>)}</tbody></table></div>;
}
function SBtn({ id, s, l }: { id: string; s: string; l: string }) {
  return <form action={setTutoringStatusAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value={s} /><button className="abtn sm" type="submit">{l}</button></form>;
}
