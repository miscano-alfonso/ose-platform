"use client";
import { useMemo, useState } from "react";
import type { CalcYear } from "@/lib/data";

const money = (p: number) => "£" + (Math.round(p) / 100).toLocaleString("en-GB", { minimumFractionDigits: p % 100 ? 2 : 0, maximumFractionDigits: 2 });
const monthYear = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" });

export function Calculator({ years }: { years: CalcYear[] }) {
  const [yi, setYi] = useState(years.length - 1);
  const [pick, setPick] = useState<Record<string, number>>({});
  const y = years[yi];
  const chosen = useMemo(() => y.subjects.flatMap((s) => (pick[s.subject] != null ? [{ subject: s.subject, ...s.options[pick[s.subject]] }] : [])), [y, pick]);
  const pct = y.bundles.filter((b) => chosen.length >= b.min_courses).reduce((m, b) => Math.max(m, b.percent_off), 0);
  const lines = chosen.map((c) => { const perTerm = Math.round((c.total_pence * (1 - pct / 100)) / c.terms); return { ...c, perTerm, net: perTerm * c.terms }; });
  const sub = lines.reduce((n, l) => n + l.total_pence, 0), total = lines.reduce((n, l) => n + l.net, 0), firstTerm = lines.reduce((n, l) => n + l.perTerm, 0);
  const fee = chosen[0]?.fee_pence ?? y.subjects[0]?.options[0]?.fee_pence ?? 0;
  const tiers = y.bundles.map((b, i) => { const next = y.bundles[i + 1]; return `${b.percent_off}% discount for ${b.min_courses}${next ? `–${next.min_courses - 1}` : "+"} courses`; });
  return <div className="calc">
    {years.length > 1 && <nav className="yrtabs" aria-label="School year">{years.map((yr, i) => <button key={yr.label} type="button" className={i === yi ? "on" : ""} aria-pressed={i === yi} onClick={() => { setYi(i); setPick({}); }}>
      <b>{yr.label.replace("/", "–")}</b><span>Starts {monthYear(yr.start)}</span></button>)}</nav>}
    <p className="calc-intro">This calculator works out prices for our courses starting in {monthYear(y.start)}.</p>
    {tiers.length > 0 && <div className="calc-tiers">{tiers.map((t) => <span key={t}>{t}</span>)}</div>}
    <div className="calc-grid">
      <div className="calc-subjects">{y.subjects.map((s) => <label key={s.subject} className="calc-field"><span>{s.subject}</span>
        <select value={pick[s.subject] ?? ""} onChange={(e) => setPick((p) => { const n = { ...p }; if (e.target.value === "") delete n[s.subject]; else n[s.subject] = Number(e.target.value); return n; })}>
          <option value="">–</option>{s.options.map((o, i) => <option key={o.label} value={i}>{o.label}</option>)}</select></label>)}</div>
      <aside className="calc-sum" aria-live="polite">
        <h2>Total Course Cost*</h2>
        {lines.length > 0 && <ul className="calc-lines">{lines.map((l) => <li key={l.subject}><span>{l.subject} · {l.label}</span><b>{money(l.total_pence)}</b></li>)}</ul>}
        <dl>
          <div><dt>Sub total</dt><dd>{money(sub)}</dd></div>
          <div><dt>Discount{pct ? ` (${pct}%)` : ""}</dt><dd>{pct ? "−" : ""}{money(sub - total)}</dd></div>
          <div className="calc-total"><dt>Total</dt><dd>{money(total)}</dd></div>
          <div><dt>First termly payment**</dt><dd>{money(firstTerm)}</dd></div>
        </dl>
        {lines.length > 0 && <ul className="calc-inst">{lines.map((l) => <li key={l.subject}>{l.subject}: {l.terms} payments of {money(l.perTerm)}</li>)}</ul>}
        <p className="calc-notes">* Excluding the {money(fee)} enrolment fee for each course.<br />** 6 payments for KS3 and Pre-GCSE, 5 for 1-year GCSE and 11 for 2-year GCSE, taken two weeks before each term.</p>
      </aside>
    </div>
  </div>;
}
