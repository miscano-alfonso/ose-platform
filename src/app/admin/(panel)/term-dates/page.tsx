import { getTermsAdmin } from "@/lib/admin-data";
import { dayMonth, yearLabel, weeks } from "@/lib/format";

export default async function TermDatesAdmin() {
  const terms = await getTermsAdmin();
  const years = [...new Set(terms.map((t) => t.year_label))];
  return <>
    <div className="top"><div><h1>Term dates</h1><div className="sub">What the website shows on Term dates, and when each termly payment is taken.</div></div></div>
    {years.map((y) => { const ts = terms.filter((t) => t.year_label === y); return <section className="card" key={y}>
      <h2>{yearLabel(y)}</h2><p className="cs">On sale from {dayMonth(ts[0].sales_open_on)} {ts[0].sales_open_on.slice(0, 4)}</p>
      <div className="tw" style={{ margin: 0 }}><table><thead><tr><th>Term</th><th>Lessons</th><th className="n">Weeks</th><th>Payment taken</th></tr></thead>
        <tbody>{ts.map((t) => <tr key={t.number}><td><b>{t.name}</b></td><td>{dayMonth(t.starts_on)} – {dayMonth(t.ends_on)}</td><td className="n">{weeks(t.starts_on, t.ends_on)}</td>
          <td>{t.number === 1 ? "On enrolment" : dayMonth(t.bills_on)}</td></tr>)}</tbody></table></div></section>; })}
    <p className="note">Editing term dates and preparing next year comes with the next update.</p>
  </>;
}
