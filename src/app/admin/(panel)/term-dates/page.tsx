import Link from "next/link";
import { getTermDates } from "@/lib/terms-admin";
import { yearLabel } from "@/lib/format";
import { addYearAction, saveTermsAction, addHolidayAction, removeHolidayAction } from "../../actions";

const nice = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default async function TermDatesAdmin({ searchParams }: { searchParams: Promise<{ year?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { years, year, terms, holidays } = await getTermDates(sp.year ?? null);
  const total = terms.reduce((n, t) => n + t.weeks, 0);
  return <>
    <div className="top"><div><h1>Term dates</h1><div className="sub">Six terms a year. The website, registers, payment dates and every course price (lessons = weeks × lessons a week) follow these dates.</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    <nav className="tabs" style={{ marginBottom: 14 }}>{years.map((y) => <Link key={y.id} href={`/admin/term-dates?year=${y.id}`} className={`abtn sm${y.id === year?.id ? " pri" : ""}`}>{yearLabel(y.label)}</Link>)}</nav>

    {year && <form action={saveTermsAction} className="card">
      <input type="hidden" name="year" value={year.id} />
      <h2>{yearLabel(year.label)}</h2><p className="cs">{nice(year.starts_on)} – {nice(year.ends_on)} · on sale from {nice(year.sales_open_on)} · {total} teaching weeks</p>
      <div className="tw" style={{ margin: 0 }}><table><thead><tr><th>Term</th><th>First day</th><th>Last day</th><th className="n">Weeks</th><th>Payment taken</th></tr></thead>
        <tbody>{[1, 2, 3, 4, 5, 6].map((n) => { const t = terms.find((x) => x.number === n); return <tr key={n}><td><b>Term {n}</b></td>
          <td><input className="mini" type="date" name={`s_${n}`} defaultValue={t?.starts_on} required /></td>
          <td><input className="mini" type="date" name={`e_${n}`} defaultValue={t?.ends_on} required /></td>
          <td className="n">{t?.weeks ?? "—"}</td>
          <td>{n === 1 ? <><span className="muted">On enrolment</span><input type="hidden" name="b_1" value={t?.bills_on ?? year.starts_on} /></> : <input className="mini" type="date" name={`b_${n}`} defaultValue={t?.bills_on} required />}</td></tr>; })}</tbody></table></div>
      <div style={{ marginTop: 12 }}><button className="abtn pri" type="submit">Save term dates</button> <span className="muted" style={{ fontSize: 15 }}>Saving also updates this year’s course prices from Prices &amp; rules. Families already booked keep the price they agreed.</span></div>
    </form>}

    <section className="card"><h2>Holidays and closures</h2>
      {holidays.length === 0 ? <p className="empty">None.</p> : holidays.map((h) => <div className="li" key={h.id}><div className="t"><b>{h.name}</b><span>{nice(h.starts_on)} – {nice(h.ends_on)}</span></div>
        <form action={removeHolidayAction}><input type="hidden" name="id" value={h.id} /><input type="hidden" name="year" value={year?.id} /><button className="abtn sm" type="submit">Remove</button></form></div>)}
      <form action={addHolidayAction} className="eform" style={{ marginTop: 10 }}><input type="hidden" name="year" value={year?.id} />
        <label className="fld">Name<input name="name" required maxLength={80} placeholder="e.g. Half term" /></label>
        <label className="fld">From<input type="date" name="starts" required /></label><label className="fld">To<input type="date" name="ends" required /></label>
        <button className="abtn" type="submit">Add</button></form>
      <p className="cs" style={{ marginTop: 8 }}>No lessons are scheduled on these days.</p></section>

    <section className="card"><h2>Add a school year</h2>
      <form action={addYearAction} className="eform">
        <label className="fld">Name<input name="label" required pattern="\d{4}/\d{2}" placeholder="2027/28" style={{ width: 110 }} /></label>
        <label className="fld">Starts<input type="date" name="starts" required /></label><label className="fld">Ends<input type="date" name="ends" required /></label>
        <label className="fld">On sale from<input type="date" name="sales" required /></label>
        <button className="abtn pri" type="submit">Add year</button></form>
      <p className="cs" style={{ marginTop: 8 }}>Then add its six terms here, copy last year’s rules in Prices &amp; rules, and Apply. Year 2 of a 2-year course is priced from the next year’s term dates once they’re in.</p></section>
  </>;
}
