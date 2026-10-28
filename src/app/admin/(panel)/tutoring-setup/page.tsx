import Link from "next/link";
import { getTutoring } from "@/lib/tutoring";
import { DAY } from "@/lib/ops";
import { setTutorRateAction, addAvailabilityAction, removeAvailabilityAction } from "../../actions";

export const dynamic = "force-dynamic";

// Settings → 1:1 tutoring setup: the prices and when each teacher offers 1:1s. Set once, changed rarely.
// The bookings themselves are on the 1:1 tutoring page.
export default async function TutoringSetup({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const d = await getTutoring();
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
  </>;
}
