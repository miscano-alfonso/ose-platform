"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { PLANS, gbp, EXTRA_STUDENT } from "../plans";

/** The plans' words, after the website editor (edited wording, and editable while editing). */
export type PlanText = { name: ReactNode; for: ReactNode; teachers: ReactNode; students: ReactNode; cta: ReactNode; adds: ReactNode; features: ReactNode[]; tag: ReactNode; billed: ReactNode; monthly: ReactNode; yearly: ReactNode; extra: ReactNode };

export function Plans({ t }: { t: PlanText[] }) {
  const [yearly, setYearly] = useState(false);
  return <>
    <div className="edt-bill" role="group" aria-label="Billing">
      <button type="button" aria-pressed={!yearly} onClick={() => setYearly(false)}>{t[0].monthly}</button>
      <button type="button" aria-pressed={yearly} onClick={() => setYearly(true)}>{t[0].yearly}</button>
    </div>
    <div className="edt-plans">{PLANS.map((p, i) => <div key={p.id} id={p.id} className={`edt-plan${p.highlight ? " hl" : ""}`} style={{ scrollMarginTop: 90 }}>
      {p.highlight && <span className="tag">{t[i].tag}</span>}
      <h3>{t[i].name}</h3><p className="for">{t[i].for}</p>
      <div className="edt-price"><b>{gbp(yearly ? Math.round(p.yearly / 12) : p.monthly)}</b><span>a month</span></div>
      <p className="edt-note" style={{ marginTop: -8 }}>{yearly ? `${gbp(p.yearly)} billed once a year` : t[i].billed}</p>
      <div className="sizes"><span>{t[i].teachers}</span><span>{t[i].students}</span><span className="edt-note">then {gbp(EXTRA_STUDENT)} {t[i].extra}</span></div>
      {p.adds && <p className="adds">{t[i].adds}</p>}
      <ul>{t[i].features.map((f, j) => <li key={j}>{f}</li>)}</ul>
      <Link href={`/osedtech/trial?plan=${p.id}`} className={`edt-btn${p.highlight ? " teal" : ""}`}>{t[i].cta}</Link>
    </div>)}</div>
  </>;
}
