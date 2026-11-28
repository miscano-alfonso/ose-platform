import Link from "next/link";
import { getTasters, tasterPlaces } from "@/lib/ops";
import { tasterJourneys, tasterFunnel, type Journey } from "@/lib/taster-journey";
import { settleTasters } from "@/lib/automations";
import { bookTasterAction, setTasterStatusAction, setEnquiryHandledAction, setTasterPlacesAction } from "../../actions";

const day = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

export default async function Tasters({ searchParams }: { searchParams: Promise<{ group?: string; ok?: string; err?: string; f?: string }> }) {
  const sp = await searchParams;
  await settleTasters();
  const [{ requests, classes, lessons }, places, list] = await Promise.all([getTasters(sp.group ?? null), tasterPlaces(), tasterJourneys(120)]);
  const cls = classes.find((c) => c.id === sp.group);
  const fn = tasterFunnel(list, 90);
  // 28 Nov: one row per taster with its journey; filters for what's coming, what's waiting on the family, and how it ended
  const FILTERS: [string, string, (j: Journey) => boolean][] = [
    ["all", "All", () => true],
    ["coming", "Coming up", (j) => j.outcome === "upcoming"],
    ["waiting", "Waiting for the family", (j) => j.outcome === "waiting"],
    ["enrolled", "Enrolled", (j) => j.outcome === "enrolled"],
    ["other", "Re-booked, waiting list or replied", (j) => ["rebooked", "waitlist", "replied"].includes(j.outcome)],
    ["lost", "No reply or cancelled", (j) => j.outcome === "no_reply" || j.outcome === "cancelled"],
  ];
  const f = FILTERS.find((x) => x[0] === sp.f) ?? FILTERS[0];
  const shown = list.filter(f[2]);
  return <>
    <div className="top"><div><h1>Tasters</h1><div className="sub">Free taster lessons, booked by families on the website’s taster page or by the office here. Everything after booking happens by itself: confirmation emails, the Classroom invitation, a reminder before the lesson, attendance from Google Meet, a follow-up, and a last reminder a week later if the family hasn’t replied.</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    <div className="tiles">
      <div className="tile"><span className="k">Came to their taster</span><span className="v">{fn.came}<small style={{ fontSize: 18, fontWeight: 500 }}> of {fn.booked}</small></span><span className="h">lessons in the last 90 days</span></div>
      <div className="tile"><span className="k">Enrolled after</span><span className="v">{fn.enrolled}</span><span className="h">{fn.rate == null ? "no tasters yet" : `${fn.rate}% of those who came`}</span></div>
      <div className="tile"><span className="k">Coming up</span><span className="v">{fn.upcoming}</span><span className="h">{fn.waiting ? `${fn.waiting} waiting for the family to reply` : "taster lessons booked"}</span></div>
      <div className="tile"><span className="k">Places per lesson</span>
        <span className="v tj-places"><form action={setTasterPlacesAction}><input type="hidden" name="n" value={places - 1} /><button className="abtn sm" type="submit" disabled={places <= 0} aria-label="One place fewer">−</button></form>
          {places}<form action={setTasterPlacesAction}><input type="hidden" name="n" value={places + 1} /><button className="abtn sm" type="submit" disabled={places >= 10} aria-label="One place more">+</button></form></span>
        <span className="h">{places === 0 ? "taster booking is closed" : "taster places in each lesson"}</span></div>
    </div>

    <section className="card"><h2>Taster journeys</h2>
      <p className="cs">Each taster from booking to enrolment. The emails are under <Link href="/admin/automations">Automations</Link> (the “Taster” ones); a grey step is still to come.</p>
      <div className="segl" role="tablist" style={{ marginBottom: 14 }}>{FILTERS.map(([k, l, fx]) => <Link key={k} href={`/admin/tasters${k === "all" ? "" : `?f=${k}`}`} aria-current={f[0] === k ? "true" : undefined}>{l} ({list.filter(fx).length})</Link>)}</div>
      {shown.length === 0 ? <p className="empty">None.</p> : <ol className="tj-list">{shown.map((j) => <JourneyRow key={j.id} j={j} />)}</ol>}
    </section>

    {requests.length > 0 && <section className="card"><h2>Taster requests from the website</h2>
      {requests.map((r) => <div className="li" key={r.id}><div className="t"><b>{r.name} <a className="muted" href={`mailto:${r.email}`} style={{ fontWeight: 400 }}>{r.email}</a></b>
        <span>{r.levels.join(", ")}{r.message ? ` · ${r.message}` : ""}</span></div>
        <form action={setEnquiryHandledAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="handled" value="1" /><button className="abtn sm" type="submit">Done</button></form></div>)}</section>}

    <section className="card"><h2>Book a taster</h2>
      <p className="cs">A taster is a free place in a real upcoming lesson. Each lesson takes up to {places} taster{places === 1 ? "" : "s"}, and a child can try each class once.</p>
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

const OUT: Record<string, string> = { enrolled: "good", waitlist: "good", rebooked: "info", replied: "info", waiting: "warn", no_reply: "bad", upcoming: "info", cancelled: "mute" };
const STATE_WORD: Record<string, string> = { done: "Done", wait: "To come", held: "Held by test mode", bad: "Problem", off: "Switched off", skip: "Not needed", now: "On now" };

function JourneyRow({ j }: { j: Journey }) {
  const past = Date.parse(j.ends) < Date.now();
  return <li className="tj">
    <div className="tj-who">
      <b>{j.child}</b> <span className="muted">· {j.cls}</span>
      <div className="muted">{when(j.starts)} · <Link href={`/admin/register/${j.lesson_event_id}?back=%2Fadmin%2Ftasters`}>{j.code}</Link>{j.teacher ? ` · ${j.teacher}` : ""}</div>
      <div className="muted">{j.parent} · <a href={`mailto:${j.parent_email}`}>{j.parent_email}</a></div>
    </div>
    <ol className="tj-steps" aria-label={`${j.child}’s taster journey`}>{j.steps.map((s) => <li key={s.key} className={`tj-s st-${s.state}`} title={`${s.label}: ${STATE_WORD[s.state]}${s.note ? ` · ${s.note}` : ""}`}>
      <i aria-hidden="true" /><b>{s.label}</b><span>{s.note || STATE_WORD[s.state]}</span></li>)}</ol>
    <div className="tj-end"><span className={`pill ${OUT[j.outcome]}`}>{j.outcome_text}</span>
      {j.outcome !== "cancelled" && <details className="tj-fix"><summary>Change</summary><div>
        {past && j.status !== "attended" && <Btn id={j.id} status="attended" label="They came" />}
        {past && j.status !== "no_show" && <Btn id={j.id} status="no_show" label="They didn’t come" />}
        {past && j.status !== "booked_course" && <Btn id={j.id} status="booked_course" label="They booked a course" />}
        {!past && <Btn id={j.id} status="cancelled" label="Cancel this taster" />}
      </div></details>}</div>
  </li>;
}

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }).replace(",", "");

function Btn({ id, status, label }: { id: string; status: string; label: string }) {
  return <form action={setTasterStatusAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value={status} /><button className="abtn sm" type="submit">{label}</button></form>;
}
