import Link from "next/link";
import { getTasters } from "@/lib/ops";
import { bookTasterAction, setTasterStatusAction, setEnquiryHandledAction } from "../../actions";

const STATUS: Record<string, [string, string]> = { booked: ["Booked", "info"], attended: ["Attended", "good"], no_show: ["Didn’t come", "warn"], cancelled: ["Cancelled", "mute"], booked_course: ["Booked a course", "good"] };
const day = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

export default async function Tasters({ searchParams }: { searchParams: Promise<{ group?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { rows, requests, classes, lessons } = await getTasters(sp.group ?? null);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = rows.filter((r) => r.lesson_date >= today && r.status === "booked").reverse();
  const past = rows.filter((r) => !(r.lesson_date >= today && r.status === "booked"));
  const follow = past.filter((r) => r.status === "attended").length;
  const cls = classes.find((c) => c.id === sp.group);
  return <>
    <div className="top"><div><h1>Tasters</h1><div className="sub">{upcoming.length} upcoming · {follow} attended and not yet booked · {requests.length} new request{requests.length === 1 ? "" : "s"}</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}

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

    <h2 style={{ font: "600 18px Jost", margin: "22px 0 10px" }}>Upcoming</h2>
    {upcoming.length === 0 ? <p className="empty">No tasters booked.</p> : <List rows={upcoming} />}
    <h2 style={{ font: "600 18px Jost", margin: "22px 0 10px" }}>Recent</h2>
    {past.length === 0 ? <p className="empty">Nothing yet.</p> : <List rows={past} />}
    <p className="note">Teachers mark whether a taster came when they take the lesson’s register. Mark “Booked a course” once the family signs up, so follow-ups stop.</p>
  </>;
}

function List({ rows }: { rows: Awaited<ReturnType<typeof getTasters>>["rows"] }) {
  return <div className="tw"><table><thead><tr><th>Lesson</th><th>Child</th><th>Parent</th><th>Status</th><th></th></tr></thead>
    <tbody>{rows.map((r) => <tr key={r.id}>
      <td><b>{r.level} {r.subject}</b><div className="muted" style={{ fontSize: 12.5 }}>{day(r.lesson_date)} {r.starts_at} · <Link href={`/admin/register/${r.lesson_event_id}`}>{r.code}</Link></div></td>
      <td>{r.child_name}<div className="muted" style={{ fontSize: 12.5 }}>{r.child_email}</div></td>
      <td>{r.parent_name}<div className="muted" style={{ fontSize: 12.5 }}><a href={`mailto:${r.parent_email}`}>{r.parent_email}</a></div></td>
      <td><span className={`pill ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span></td>
      <td style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {r.status === "booked" && <Btn id={r.id} status="cancelled" label="Cancel" />}
        {(r.status === "attended" || r.status === "no_show") && <Btn id={r.id} status="booked_course" label="Booked a course" />}
        {r.status !== "booked" && r.status !== "cancelled" && <Btn id={r.id} status="booked" label="Reset" />}
      </td></tr>)}</tbody></table></div>;
}

function Btn({ id, status, label }: { id: string; status: string; label: string }) {
  return <form action={setTasterStatusAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value={status} /><button className="abtn sm" type="submit">{label}</button></form>;
}
