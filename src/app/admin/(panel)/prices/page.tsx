import Link from "next/link";
import { getRules } from "@/lib/rules";
import { money, yearLabel } from "@/lib/format";
import { saveRulesAction, applyRulesAction, saveBundlesAction, copyRulesAction } from "../../actions";

const p2 = (n: number | null) => (n == null ? "" : (n / 100).toFixed(2));

export default async function PricesAdmin({ searchParams }: { searchParams: Promise<{ year?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { years, year, levels, subjects, allSubjects, preview, bundles, weeks } = await getRules(sp.year ?? null);
  if (!year) return <p className="empty">No school year is set up.</p>;
  const changed = preview.filter((r) => r.now != null && r.now !== r.total).length;
  const other = years.find((y) => y.id !== year.id && y.has_rules);
  return <>
    <div className="top"><div><h1>Prices &amp; rules</h1><div className="sub">Every price comes from these rules: lessons per week for each subject, × teaching weeks in its terms, × the level’s price per lesson.</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    <nav className="tabs" style={{ marginBottom: 14 }}>{years.map((y) => <Link key={y.id} href={`/admin/prices?year=${y.id}`} className={`abtn sm${y.id === year.id ? " pri" : ""}`}>{yearLabel(y.label)}</Link>)}</nav>
    <p className="note">Teaching weeks in {yearLabel(year.label)} (from Term dates): {weeks.length ? weeks.map((w) => `Term ${w.number}: ${w.weeks}`).join(" · ") : "no term dates yet"}.</p>
    {!year.has_rules && other && <form action={copyRulesAction} className="card"><input type="hidden" name="from" value={other.id} /><input type="hidden" name="to" value={year.id} />
      <p className="cs">{yearLabel(year.label)} has no rules yet.</p><button className="abtn pri" type="submit">Copy the {yearLabel(other.label)} rules to start from</button></form>}

    <form action={saveRulesAction}>
      <input type="hidden" name="year" value={year.id} />
      <section className="card"><h2>Levels</h2>
        <div className="tw" style={{ margin: 0 }}><table><thead><tr><th>Level</th><th>Price per lesson £</th><th>Registration fee £</th><th>Terms in a course year</th><th>Terms in the final (exam) year</th></tr></thead>
          <tbody>{levels.map((l) => <tr key={l.level_id}><td><b>{l.level}</b><input type="hidden" name="level" value={l.level_id} /></td>
            <td><input className="mini" name={`cost_${l.level_id}`} inputMode="decimal" defaultValue={p2(l.cost)} placeholder="Not offered" style={{ width: 110 }} /></td>
            <td><input className="mini" name={`fee_${l.level_id}`} inputMode="decimal" defaultValue={p2(l.fee ?? 2500)} style={{ width: 90 }} /></td>
            <td><select className="mini" name={`tpy_${l.level_id}`} defaultValue={l.terms_per_year}>{[1, 2, 3, 4, 5, 6].map((n) => <option key={n}>{n}</option>)}</select></td>
            <td><select className="mini" name={`fyt_${l.level_id}`} defaultValue={l.final_year_terms}>{[1, 2, 3, 4, 5, 6].map((n) => <option key={n}>{n}</option>)}</select></td></tr>)}</tbody></table></div>
        <p className="cs" style={{ marginTop: 8 }}>The final year of a GCSE course has 5 terms because of the summer exams. Leave the price empty for a level you don’t offer that year.</p></section>

      <section className="card"><h2>Subjects</h2>
        <div className="tw" style={{ margin: 0 }}><table><thead><tr><th>Level</th><th>Subject</th><th>Lessons a week</th><th>Course length</th><th>Remove</th></tr></thead>
          <tbody>{subjects.map((s) => { const k = `${s.level_id}_${s.subject_id}`; return <tr key={k}><td>{s.level}</td><td><b>{s.subject}</b><input type="hidden" name="rule" value={k} /></td>
            <td><select className="mini" name={`lpw_${k}`} defaultValue={s.lpw}>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select></td>
            <td><select className="mini" name={`yrs_${k}`} defaultValue={s.years}>{[1, 2, 3].map((n) => <option key={n} value={n}>{n} year{n > 1 ? "s" : ""}</option>)}</select></td>
            <td><input type="checkbox" name={`del_${k}`} aria-label={`Remove ${s.level} ${s.subject}`} /></td></tr>; })}
            <tr><td><select className="mini" name="new_level" defaultValue=""><option value="">Add…</option>{levels.map((l) => <option key={l.level_id} value={l.level_id}>{l.level}</option>)}</select></td>
              <td><select className="mini" name="new_subject" defaultValue=""><option value="">Subject</option>{allSubjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></td>
              <td><select className="mini" name="new_lpw" defaultValue="1">{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select></td>
              <td><select className="mini" name="new_yrs" defaultValue="1">{[1, 2, 3].map((n) => <option key={n} value={n}>{n} year{n > 1 ? "s" : ""}</option>)}</select></td><td /></tr></tbody></table></div>
      </section>
      <div style={{ marginBottom: 18 }}><button className="abtn pri" type="submit">Save rules</button> <span className="muted" style={{ fontSize: 15 }}>Saving updates the preview below; prices change when you press Apply.</span></div>
    </form>

    <section className="card"><h2>What the rules work out to</h2>
      <div className="tw" style={{ margin: 0 }}><table><thead><tr><th>Course</th><th className="n">Lessons a week</th><th className="n">Terms</th><th className="n">Weeks</th><th className="n">Lessons</th><th className="n">Per lesson</th><th className="n">Price</th><th className="n">Now on the website</th></tr></thead>
        <tbody>{preview.map((r, i) => <tr key={i}><td><b>{r.level} {r.subject}</b>{r.years > 1 && <span className="muted"> · year {r.yoc} of {r.years}</span>}</td>
          <td className="n">{r.lpw}</td><td className="n">{r.terms}</td><td className="n">{r.weeks}</td><td className="n">{r.lessons}</td><td className="n">{money(r.cost)}</td><td className="n"><b>{money(r.total)}</b></td>
          <td className="n">{r.now == null ? <span className="muted">No class yet</span> : r.now === r.total ? <span className="pill good">{money(r.now)}</span> : <span className="pill warn">{money(r.now)}</span>}</td></tr>)}</tbody></table></div>
      <form action={applyRulesAction} style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <input type="hidden" name="year" value={year.id} />
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" name="confirm" required /> Use these prices for {yearLabel(year.label)}{changed ? ` (${changed} price${changed === 1 ? "" : "s"} will change)` : ""}</label>
        <button className="abtn pri" type="submit">Apply</button></form>
      <p className="cs" style={{ marginTop: 8 }}>Applying updates the website, course cards, calculator and new bookings. Families who have already booked keep the payments they agreed.</p></section>

    <section className="card"><h2>Bundle discounts</h2>
      <form action={saveBundlesAction} className="eform"><input type="hidden" name="year" value={year.id} />
        {[0, 1, 2].map((i) => <span key={i} className="eform" style={{ gap: 6 }}>
          <label className="fld">From courses<input className="mini" name={`min_${i}`} type="number" min={2} max={20} defaultValue={bundles[i]?.min_courses ?? ""} style={{ width: 80 }} /></label>
          <label className="fld">% off<input className="mini" name={`pct_${i}`} inputMode="decimal" defaultValue={bundles[i] ? Number(bundles[i].percent_off) : ""} style={{ width: 70 }} /></label></span>)}
        <button className="abtn" type="submit">Save discounts</button></form>
      <p className="cs" style={{ marginTop: 8 }}>Counted per student across all their courses that year, e.g. 3 courses 10% off, 5 courses 15% off.</p></section>
  </>;
}
