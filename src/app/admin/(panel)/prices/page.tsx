import { getPricesAdmin } from "@/lib/admin-data";
import { money, yearLabel } from "@/lib/format";

export default async function PricesAdmin() {
  const { plans, bundles } = await getPricesAdmin();
  return <>
    <div className="top"><div><h1>Prices &amp; discounts</h1><div className="sub">Price plans feed the website’s Prices page and every course card.</div></div></div>
    <div className="tw"><table><thead><tr><th>Year</th><th>Level</th><th>Plan</th><th className="n">Lessons/week</th><th className="n">Terms</th><th className="n">Lessons</th><th className="n">Per lesson</th><th className="n">Year total</th><th className="n">Registration</th></tr></thead>
      <tbody>{plans.map((p, i) => <tr key={i}><td>{yearLabel(p.year_label)}</td><td>{p.level}</td><td><b>{p.name}</b>{p.course_years > 1 && <div className="muted" style={{ fontSize: 12 }}>Year {p.year_of_course} of {p.course_years}</div>}</td>
        <td className="n">{p.lessons_per_week}</td><td className="n">{p.term_count}</td><td className="n">{p.lessons}</td><td className="n">{money(p.cost_per_lesson_pence)}</td>
        <td className="n"><b>{money(p.total_pence)}</b></td><td className="n">{money(p.registration_fee_pence)}</td></tr>)}</tbody></table></div>
    <section className="card"><h2>Bundle discounts</h2>
      {bundles.map((b, i) => <div className="li" key={i}><div className="t"><b>{b.min_courses}+ courses: {Number(b.percent_off)}% off</b><span>{yearLabel(b.year_label)} · {b.level ?? "any level"}</span></div></div>)}</section>
    <p className="note">Editing prices comes with the next update.</p>
  </>;
}
