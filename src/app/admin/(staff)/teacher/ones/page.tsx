import { requireViewer } from "@/lib/auth";
import { myOnes } from "@/lib/teacher-area";
import { markOneTaughtAction, addMyHoursAction, removeMyHoursAction } from "../../../actions";
import { DAYLONG, dlong, hm, gbp } from "../fmt";

export const dynamic = "force-dynamic";

export default async function Ones({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const [sp, me] = await Promise.all([searchParams, requireViewer()]);
  const d = await myOnes(me.id);
  return <>
    <div className="top"><div><h1>1:1s and workshops</h1><div className="sub">Your bookings, and the hours you offer for 1:1s</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    <div className="dgrid"><div className="dstack">
      <section className="card"><h2>Booked 1:1s</h2>
        {d.bookings.length === 0 ? <p className="empty">No 1:1s booked.</p> : d.bookings.map((b) => <div className="li" key={b.id}>
          <span className="mono" style={{ width: 100, flex: "none" }}>{dlong(b.at)}</span>
          <div className="t"><b>{hm(b.at)} · {b.child} · {b.level} {b.subject}</b><span>{b.minutes} min · “{b.focus || "No notes"}”{b.audience === "public" ? " · new family" : ""}</span></div>
          {b.past ? <form action={markOneTaughtAction}><input type="hidden" name="id" value={b.id} /><button className="abtn sm" type="submit">Taught</button></form>
            : <span className="pill info" title="The Meet invitation is in your Google Calendar">Meet in your calendar</span>}
        </div>)}</section>
      <section className="card"><h2>Workshops</h2>
        {d.workshops.length === 0 ? <p className="empty">None coming up.</p> : d.workshops.map((w) => <div className="li" key={w.id}>
          <span className="mono" style={{ width: 100, flex: "none" }}>{dlong(w.at)}</span>
          <div className="t"><b>{hm(w.at)} · {w.title}</b><span>{w.booked} booked · {w.minutes} min</span></div></div>)}</section>
    </div>
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
