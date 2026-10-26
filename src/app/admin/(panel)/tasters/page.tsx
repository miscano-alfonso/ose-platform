import Link from "next/link";
import { getTasters, tasterPlaces } from "@/lib/ops";
import { bookTasterAction, setTasterStatusAction, setEnquiryHandledAction, tasterFollowUpAction } from "../../actions";

const STATUS: Record<string, [string, string]> = { booked: ["Booked", "info"], attended: ["Attended", "good"], no_show: ["Didn’t come", "warn"], cancelled: ["Cancelled", "mute"], booked_course: ["Booked a course", "good"] };
const day = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

export default async function Tasters({ searchParams }: { searchParams: Promise<{ group?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const [{ rows, requests, classes, lessons }, places] = await Promise.all([getTasters(sp.group ?? null), tasterPlaces()]);
  const today = new Date().toISOString().slice(0, 10), week = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const upcoming = rows.filter((r) => r.lesson_date >= today).reverse();
  const past = rows.filter((r) => r.lesson_date < today);
  const cls = classes.find((c) => c.id === sp.group);
  const booked = upcoming.filter((r) => r.status === "booked");
  const termStart = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
  const fams = new Set(rows.filter((r) => r.lesson_date >= termStart).map((r) => r.parent_email.toLowerCase()));
  const conv = new Set(rows.filter((r) => r.lesson_date >= termStart && r.status === "booked_course").map((r) => r.parent_email.toLowerCase()));
  return <>
    <div className="top"><div><h1>Tasters</h1><div className="sub">Free taster lessons booked on the website’s taster page: each child joins a real lesson from the timetable</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    <div className="tiles">
      <div className="tile"><span className="k">Coming up</span><span className="v">{booked.length}</span><span className="h">{booked.filter((r) => r.lesson_date <= week).length} in the next 7 days</span></div>
      <div className="tile"><span className="k">Families</span><span className="v">{fams.size}</span><span className="h">this term</span></div>
      <div className="tile"><span className="k">Booked a course after</span><span className="v">{conv.size}</span><span className="h">of {fams.size} families</span></div>
      <div className="tile"><span className="k">Places per lesson</span><span className="v">{places}</span><span className="h">taster places in each lesson</span></div>
    </div>

    <section className="card"><h2>All tasters</h2><p className="cs">Parents can book several tasters at once (one per subject). Up to {places} taster places per lesson.</p>
      <div className="tw" style={{ border: 0, marginBottom: 0 }}><table><thead><tr><th>Lesson</th><th>Child</th><th>Class</th><th>Status</th><th /></tr></thead><tbody>
        <tr><td colSpan={5} style={{ background: "var(--soft)", fontWeight: 600 }}>Coming up · {upcoming.length}</td></tr>
        {upcoming.length === 0 ? <tr><td colSpan={5} className="muted">None booked.</td></tr> : upcoming.map((r) => <Row key={r.id} r={r} today={today} />)}
        <tr><td colSpan={5} style={{ background: "var(--soft)", fontWeight: 600 }}>Earlier</td></tr>
        {past.length === 0 ? <tr><td colSpan={5} className="muted">Nothing yet.</td></tr> : past.map((r) => <Row key={r.id} r={r} today={today} />)}
      </tbody></table></div>
      <p className="note">The child gets the Google Meet invitation for that one lesson by email; the teacher sees the taster on their day. A taster who joins the Meet with the Google account given when booking is marked attended automatically. After the lesson, the follow-up email invites the family to book.</p></section>

    {requests.length > 0 && <section className="card"><h2>Taster requests from the website</h2>
      {requests.map((r) => <div className="li" key={r.id}><div className="t"><b>{r.name} <a className="muted" href={`mailto:${r.email}`} style={{ fontWeight: 400 }}>{r.email}</a></b>
        <span>{r.levels.join(", ")}{r.message ? ` · ${r.message}` : ""}</span></div>
        <form action={setEnquiryHandledAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="handled" value="1" /><button className="abtn sm" type="submit">Done</button></form></div>)}</section>}

    <section className="card"><h2>Book a taster</h2>
      <p className="cs">A taster is a free place in a real upcoming lesson. Each lesson takes up to 2 tasters, and a child can try each class once.</p>
      <form className="eform" style={{ marginBottom: 12 }}>
        <label className="fld">Class<select name="group" defaultValue={sp.group ?? ""}><option value="" disabled>Choose a class</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}</select></label>
        <button className="abtn" type="submit">Show dates</button>
      </form>
      {cls && (lessons.length === 0 ? <p className="empty">No upcoming lessons with taster places in the next 6 weeks for {cls.name}. Lesson dates are made under Attendance.</p> :
      <form action={bookTasterAction} className="eform">
        <input type="hidden" name="group" value={cls.id} />
        <label className="fld">Lesson<select name="lesson" required>{lessons.map((l) => <option key={l.lesson_event_id} value={l.lesson_event_id}>{day(l.lesson_date)} {l.starts_at} ({l.places_left} place{l.places_left === 1 ? "" : "s"})</option>)}</select></label>
        <label className="fld">Child’s name<input name="child" required maxLength={80} /></label>
        <label className="fld">Child’s Google email<input name="child_email" type="email" required maxLength={120} /></label>
        <label className="fld">Parent first name<input name="pfirst" required maxLength={60} /></label>
        <label className="fld">Parent last name<input name="plast" required maxLength={60} /></label>
        <label className="fld">Parent email<input name="pemail" type="email" required maxLength={120} /></label>
        <label className="fld">Note<input name="message" maxLength={300} /></label>
        <button className="abtn pri" type="submit">Book taster</button>
      </form>)}
    </section>

  </>;
}

function Row({ r, today }: { r: Awaited<ReturnType<typeof getTasters>>["rows"][number]; today: string }) {
  return <tr>
    <td><b>{day(r.lesson_date)}</b> {r.starts_at}<div className="muted" style={{ fontSize: 14.5 }}><Link href={`/admin/register/${r.lesson_event_id}`}>{r.code}</Link></div></td>
    <td><b>{r.child_name}</b>{r.together > 1 && <> <span className="pill mute">{r.together} tasters booked together</span></>}
      <div className="muted" style={{ fontSize: 14.5 }}>{r.parent_name} · <a href={`mailto:${r.parent_email}`}>{r.parent_email}</a></div>{r.message && <div className="muted" style={{ fontSize: 14.5 }}>“{r.message}”</div>}</td>
    <td>{r.level} {r.subject}<div className="muted" style={{ fontSize: 14.5 }}>{r.teacher ?? "No teacher"}</div></td>
    <td><span className={`pill ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span></td>
    <td><div className="acts" style={{ whiteSpace: "nowrap" }}>
      {r.status === "booked" && r.lesson_date < today && <><Btn id={r.id} status="attended" label="Attended" /><Btn id={r.id} status="no_show" label="Didn’t come" /></>}
      {r.status === "booked" && r.lesson_date >= today && <Btn id={r.id} status="cancelled" label="Cancel" />}
      {r.status === "attended" && <form action={tasterFollowUpAction}><input type="hidden" name="id" value={r.id} /><button className="abtn sm" type="submit">{r.followed_up_at ? "Followed up · send again" : "Send follow-up"}</button></form>}
      {(r.status === "attended" || r.status === "no_show") && <Btn id={r.id} status="booked_course" label="Booked a course" />}
    </div></td></tr>;
}

function Btn({ id, status, label }: { id: string; status: string; label: string }) {
  return <form action={setTasterStatusAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value={status} /><button className="abtn sm" type="submit">{label}</button></form>;
}
