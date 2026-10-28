import Link from "next/link";
import { getTutoring, openTimes } from "@/lib/tutoring";
import { money } from "@/lib/format";
import { bookTutoringAction, setTutoringStatusAction } from "../../actions";

export const dynamic = "force-dynamic";
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const PILL: Record<string, [string, string]> = { booked: ["Booked", "info"], completed: ["Done", "good"], no_show: ["Didn’t come", "warn"], cancelled: ["Cancelled", "mute"] };

// 1:1 tutoring: the booked 1:1s, upcoming and past, and booking one for a family.
// Prices and teachers' 1:1 times are set in Settings → 1:1 tutoring setup.
export default async function Tutoring({ searchParams }: { searchParams: Promise<{ level?: string; subject?: string; parent?: string; ok?: string; err?: string; show?: string; book?: string }> }) {
  const sp = await searchParams;
  const d = await getTutoring();
  const times = sp.level && sp.subject ? await openTimes(sp.level, sp.subject) : null;
  const now = new Date().toISOString();
  const upcoming = d.bookings.filter((b) => b.starts_at >= now && b.status === "booked"), past = d.bookings.filter((b) => !(b.starts_at >= now && b.status === "booked")).reverse();
  const show = sp.show === "past" ? "past" : "upcoming", rows = show === "past" ? past : upcoming;
  const booking = !!(sp.book || sp.level || times);
  return <>
    <div className="top"><div><h1>1:1 tutoring</h1><div className="sub">45-minute online 1:1s · {upcoming.length} upcoming · {past.length} past. Prices and teachers’ times are in <Link href="/admin/tutoring-setup">1:1 tutoring setup</Link>.</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}


    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
      <Link className="abtn pri" href={booking ? "/admin/tutoring" : "/admin/tutoring?book=1"}>{booking ? "Close" : "Book a 1:1"}</Link>
    <div className="segl" role="group" aria-label="Show">
      <Link href="/admin/tutoring" aria-current={show === "upcoming" ? "true" : undefined}>Upcoming ({upcoming.length})</Link>
      <Link href="/admin/tutoring?show=past" aria-current={show === "past" ? "true" : undefined}>Past ({past.length})</Link></div></div>
    {booking && <section className="card"><h2>Book a 1:1</h2>
      <form className="eform" style={{ marginBottom: 10 }}>
        <label className="fld">Level<select name="level" defaultValue={sp.level ?? ""} required><option value="" disabled>Choose</option>{d.levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        <label className="fld">Subject<select name="subject" defaultValue={sp.subject ?? ""} required><option value="" disabled>Choose</option>{d.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <button className="abtn" type="submit">Find times</button></form>
      {times && (times.length === 0 ? <p className="empty">No free times in the next 4 weeks. Check the teachers’ times in <Link href="/admin/tutoring-setup">1:1 tutoring setup</Link> and that a teacher is set up for this level and subject.</p> :
        <form action={bookTutoringAction} className="eform">
          <input type="hidden" name="level" value={sp.level} /><input type="hidden" name="subject" value={sp.subject} />
          <label className="fld">Time and teacher<select name="slot" required>{times.map((t) => <option key={t.teacher_id + t.starts_at} value={`${t.teacher_id}|${t.starts_at}`}>{when(t.starts_at)} · {t.teacher}</option>)}</select></label>
          <label className="fld">Family<select name="parent" required defaultValue={sp.parent ?? ""}><option value="" disabled>Choose a parent</option>{d.parents.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.email})</option>)}</select></label>
          <label className="fld">Student<input name="student" required maxLength={80} /></label>
          <label className="fld">Student’s Google email<input name="student_email" type="email" maxLength={120} /></label>
          <label className="fld">Help with<input name="focus" maxLength={300} /></label>
          <button className="abtn pri" type="submit">Book</button></form>)}
      <p className="cs" style={{ marginTop: 8 }}>The price comes from the rates in 1:1 tutoring setup (families with a course place pay the enrolled rate).</p></section>}
    {rows.length === 0 ? <p className="empty">{show === "past" ? "No past 1:1s yet." : "No 1:1s booked."}</p> : <Table rows={rows} />}
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
