import Link from "next/link";
import { getTutoring } from "@/lib/tutoring";
import { DAY } from "@/lib/ops";
import { setTutorRateAction, addAvailabilityAction, removeAvailabilityAction, linkOneCourseAction, unlinkOneCourseAction } from "../../actions";
import { listOneCourses, oneCourseHints, oneCourseChoices } from "@/lib/one-courses";

export const dynamic = "force-dynamic";

// Settings → 1:1 tutoring setup: the prices and when each teacher offers 1:1s. Set once, changed rarely.
// The bookings themselves are on the 1:1 tutoring page.
export default async function TutoringSetup({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const [d, ones, hints, ch] = await Promise.all([getTutoring(), listOneCourses(), oneCourseHints(), oneCourseChoices().catch(() => ({ students: [], teachers: [], subjects: [] }))]);
  return <>
    <div className="top"><div><h1>1:1 tutoring setup</h1><div className="sub">Prices and the times teachers offer 1:1s. The booked 1:1s are on <Link href="/admin/tutoring">1:1 tutoring</Link>.</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
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

    <section className="card" id="one-courses"><h2>1:1 Classrooms</h2>
      <p className="cs">Each 1:1 student’s own Google Classroom course with their teacher. Once linked, its work, hand-ins and marks show on the teacher’s 1:1s page, the student’s dashboard and the parent’s Assignments, updated with the Classroom sync. Marking and comments stay in Classroom; each piece of work opens there.</p>
      {ones.length === 0 ? <p className="empty" style={{ textAlign: "left" }}>No 1:1 Classrooms linked yet.</p>
        : ones.map((o) => <div className="li" key={o.id}><div className="t"><b>{o.student}</b><span>{o.subject ? `${o.subject} · ` : ""}with {o.teacher} · {o.name ?? `Classroom ${o.course}`} · {o.work} piece{o.work === 1 ? "" : "s"} of work</span></div>
          {o.link && <a className="abtn sm" href={o.link} target="_blank" rel="noopener">Open in Classroom</a>}
          <form action={unlinkOneCourseAction}><input type="hidden" name="id" value={o.id} /><button className="abtn sm" type="submit">Unlink</button></form></div>)}
      <form action={linkOneCourseAction} className="eform" style={{ marginTop: 14, gap: 8, alignItems: "flex-end" }}>
        <label className="fld">Student<select name="student" required defaultValue=""><option value="" disabled>Choose…</option>
          {ch.students.some((s) => s.ones) && <optgroup label="Has 1:1s">{ch.students.filter((s) => s.ones).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>}
          <optgroup label="Everyone">{ch.students.filter((s) => !s.ones).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup></select></label>
        <label className="fld">Teacher<select name="teacher" required defaultValue=""><option value="" disabled>Choose…</option>{ch.teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label className="fld">Subject<select name="subject" defaultValue=""><option value="">—</option>{ch.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="fld" style={{ flex: "1 1 320px" }}>Classroom link<input name="course" required placeholder="https://classroom.google.com/c/…" list="one-hints" /></label>
        <datalist id="one-hints">{hints.map((h) => <option key={h.course} value={h.course}>{h.name}</option>)}</datalist>
        <button className="abtn pri" type="submit">Link</button></form>
      {hints.length > 0 && <p className="cs" style={{ marginTop: 8 }}>Set up in Recordings and not linked yet: {hints.map((h) => `${h.name} (${h.course})`).join(" · ")}</p>}
    </section>
  </>;
}
