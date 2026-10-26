import Link from "next/link";
import { getRules, getNoticeAndCoupons, type PreviewRow } from "@/lib/rules";
import { money, yearLabel } from "@/lib/format";
import { saveRulesAction, applyRulesAction, saveBundlesAction, copyRulesAction, saveNoticeAction, saveCouponAction, toggleCouponAction } from "../../actions";

const p2 = (n: number | null) => (n == null ? "" : (n / 100).toFixed(2));
const LV = (l: string) => (l === "iGCSE" ? "GCSE" : l);
type Kind = { name: string; level: string; lpw: number; terms: number; lessons: number; cost: number; total: number; perTerm: number; subjects: string[]; check: boolean };
/** The kinds of course (like the prototype's table): one row per level × lessons a week × course length × year of the course. */
function kinds(rows: PreviewRow[]): Kind[] {
  const out = new Map<string, Kind>();
  for (const r of rows) {
    const k = [r.level, r.lpw, r.years, r.yoc, r.total].join("|");
    const sameLevel = rows.filter((x) => x.level === r.level);
    let name = LV(r.level);
    if (r.years > 1) name += ` ${r.years}-year · year ${r.yoc}`;
    else if (sameLevel.some((x) => x.years > 1)) name += " 1-year";
    else if (r.level === "Pre-GCSE" && r.lpw > 1) name += " core";
    else if (r.level !== "Pre-GCSE" && new Set(sameLevel.filter((x) => x.years === r.years).map((x) => x.lpw)).size > 1) name += ` · ${r.lpw} a week`;
    const cur = out.get(k);
    if (cur) cur.subjects.push(r.subject);
    else out.set(k, { name, level: r.level, lpw: r.lpw, terms: r.terms, lessons: r.lessons, cost: r.cost, total: r.total, perTerm: Math.ceil(r.total / Math.max(1, r.terms)), subjects: [r.subject], check: false });
  }
  return [...out.values()];
}

export default async function PricesAdmin({ searchParams }: { searchParams: Promise<{ year?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const [{ years, year, levels, subjects, allSubjects, preview, bundles, weeks }, { notice, coupons }] = await Promise.all([getRules(sp.year ?? null), getNoticeAndCoupons()]);
  if (!year) return <p className="empty">No school year is set up.</p>;
  const changed = preview.filter((r) => r.now != null && r.now !== r.total).length;
  const other = years.find((y) => y.id !== year.id && y.has_rules);
  return <>
    <div className="top"><div><h1>Prices &amp; discounts</h1><div className="sub">Changes apply to new enrolments; existing payment plans keep their price.</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    <nav className="tabs" style={{ marginBottom: 14 }}>{years.map((y) => <Link key={y.id} href={`/admin/prices?year=${y.id}`} className={`abtn sm${y.id === year.id ? " pri" : ""}`}>{yearLabel(y.label)}</Link>)}</nav>
    <p className="note">Teaching weeks in {yearLabel(year.label)} (from Term dates): {weeks.length ? weeks.map((w) => `Term ${w.number}: ${w.weeks}`).join(" · ") : "no term dates yet"}.</p>
    {!year.has_rules && other && <form action={copyRulesAction} className="card"><input type="hidden" name="from" value={other.id} /><input type="hidden" name="to" value={year.id} />
      <p className="cs">{yearLabel(year.label)} has no rules yet.</p><button className="abtn pri" type="submit">Copy the {yearLabel(other.label)} rules to start from</button></form>}

    {(() => { const K = kinds(preview); const ex = K[0]; return <>
    <section className="card"><h2>Courses and prices · {yearLabel(year.label)}</h2><p className="cs">How each kind of course runs, and what one subject costs for the year. One payment per term the course runs.</p>
      {K.length === 0 ? <p className="empty">No prices yet: set the rules below, then Apply.</p> :
      <div className="tw" style={{ margin: 0 }}><table><thead><tr><th>Course</th><th>Level</th><th className="n">Lessons a week</th><th className="n">Terms</th><th className="n">Lessons in the year</th><th className="n">Per lesson</th><th className="n">Year total</th><th className="n">Per term</th></tr></thead>
        <tbody>{K.map((k, i) => <tr key={i}><td><b>{k.name}</b><div className="muted" style={{ fontSize: 13.5 }}>{k.subjects.join(", ")}</div></td><td>{k.level}</td><td className="n">{k.lpw}</td><td className="n">{k.terms}</td>
          <td className="n">{k.lessons}</td><td className="n">{money(k.cost)}</td><td className="n"><b>{money(k.total)}</b></td><td className="n">{money(k.perTerm)}</td></tr>)}</tbody></table></div>}
      <p className="cs" style={{ marginTop: 8 }}>A 2-year GCSE is two plans: year 1 runs {levels.find((l) => l.level === "iGCSE")?.terms_per_year ?? 6} terms and year 2 runs {levels.find((l) => l.level === "iGCSE")?.final_year_terms ?? 5}. Each year is enrolled and billed separately. Registration fee: {money(levels.find((l) => l.fee != null)?.fee ?? 2500)} per student per year. To change a price, edit the rules further down and press Apply.</p></section>

    <div className="pgrid">
      <section className="card"><h2>Bundle discounts</h2><p className="cs">For one student taking several courses in the same year.</p>
        {bundles.map((b) => <div className="li" key={b.id}><div className="t"><b>{b.min_courses}+ courses</b>{ex && <span>Example at {ex.name}: {money(Math.round(ex.total * (1 - Number(b.percent_off) / 100)))} a course instead of {money(ex.total)}</span>}</div><span className="pill info">{Number(b.percent_off)}% off each</span></div>)}
        <details style={{ marginTop: 10 }}><summary className="muted" style={{ cursor: "pointer" }}>Change the discounts</summary>
          <form action={saveBundlesAction} className="eform" style={{ marginTop: 10 }}><input type="hidden" name="year" value={year.id} />
            {[0, 1, 2].map((i) => <span key={i} className="eform" style={{ gap: 6 }}>
              <label className="fld">From courses<input className="mini" name={`min_${i}`} type="number" min={2} max={20} defaultValue={bundles[i]?.min_courses ?? ""} style={{ width: 80 }} /></label>
              <label className="fld">% off<input className="mini" name={`pct_${i}`} inputMode="decimal" defaultValue={bundles[i] ? Number(bundles[i].percent_off) : ""} style={{ width: 70 }} /></label></span>)}
            <button className="abtn" type="submit">Save discounts</button></form></details></section>

      <section className="card"><h2>Cancellation notice</h2><p className="cs">Full terms still charged after a parent cancels. Shown on the agreement page at checkout and copied onto each booking, so changes only affect new bookings.</p>
        <form action={saveNoticeAction}><input type="hidden" name="year" value={year.id} />
          {notice.map((n) => <div className="li" key={n.level_id}><input type="hidden" name="level" value={n.level_id} /><div className="t"><b>{LV(n.level)}</b><span>full terms’ notice</span></div>
            <input className="mini" name={`notice_${n.level_id}`} type="number" min={0} max={6} defaultValue={n.notice_terms} aria-label={`${n.level} notice in terms`} style={{ width: 64, textAlign: "right" }} /></div>)}
          <div className="li"><div className="t"><b>Cooling-off</b><span>14 days from the first lesson, if the Classroom hasn’t been used: full refund</span></div></div>
          <button className="abtn sm" type="submit" style={{ marginTop: 8 }}>Save notice periods</button></form></section>

      <section className="card"><h2>Coupons</h2><p className="cs">Applied after the bundle discount.</p>
        {coupons.length === 0 ? <p className="empty">No coupons yet.</p> : coupons.map((c) => <div className="li" key={c.id}><span className="mono" style={{ fontWeight: 600 }}>{c.code}</span>
          <div className="t"><b>{c.percent_off ? `${Number(c.percent_off)}% off` : money(c.amount_off_pence ?? 0) + " off"}</b><span>{c.valid_to ? `until ${c.valid_to}` : "no end date"} · used {c.uses} time{c.uses === 1 ? "" : "s"}{c.max_redemptions ? ` of ${c.max_redemptions}` : ""}</span></div>
          <form action={toggleCouponAction}><input type="hidden" name="year" value={year.id} /><input type="hidden" name="id" value={c.id} /><input type="hidden" name="active" value={c.active ? "0" : "1"} />
            <button className={`pill ${c.active ? "good" : "mute"}`} type="submit" style={{ border: 0, cursor: "pointer" }} title={c.active ? "Turn off" : "Turn on"}>{c.active ? "Active" : "Off"}</button></form></div>)}
        <details style={{ marginTop: 10 }}><summary className="muted" style={{ cursor: "pointer" }}>Add a coupon</summary>
          <form action={saveCouponAction} className="eform" style={{ marginTop: 10 }}><input type="hidden" name="year" value={year.id} />
            <label className="fld">Code<input className="mini" name="code" required maxLength={30} placeholder="EARLYBIRD" style={{ width: 130, textTransform: "uppercase" }} /></label>
            <label className="fld">% off<input className="mini" name="pct" inputMode="decimal" style={{ width: 70 }} /></label>
            <label className="fld">or £ off<input className="mini" name="amount" inputMode="decimal" style={{ width: 80 }} /></label>
            <label className="fld">From<input className="mini" name="from" type="date" /></label>
            <label className="fld">Until<input className="mini" name="to" type="date" /></label>
            <label className="fld">Max uses<input className="mini" name="max" type="number" min={1} style={{ width: 80 }} /></label>
            <button className="abtn pri" type="submit">Add coupon</button></form></details></section>
    </div>
    <h2 style={{ font: "600 22px Jost,sans-serif", margin: "26px 0 6px" }}>The rules behind the prices</h2>
    <p className="note" style={{ marginTop: 0 }}>Every price comes from these rules: lessons per week for each subject, × teaching weeks in its terms, × the level’s price per lesson.</p>
    </>; })()}
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
              <td><select className="mini" name="new_subject" defaultValue=""><option value="">Subject</option>{allSubjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                <input className="mini" name="new_subject_name" maxLength={60} placeholder="…or a new subject, e.g. Media Studies" style={{ marginTop: 6, width: "100%" }} /></td>
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

  </>;
}
