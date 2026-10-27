"use client";
import Link from "next/link";
import { useState } from "react";
import { PLANS, gbp } from "../plans";

export function Plans() {
  const [yearly, setYearly] = useState(false);
  return <>
    <div className="edt-bill" role="group" aria-label="Billing">
      <button type="button" aria-pressed={!yearly} onClick={() => setYearly(false)}>Monthly</button>
      <button type="button" aria-pressed={yearly} onClick={() => setYearly(true)}>Yearly · 2 months free</button>
    </div>
    <div className="edt-plans">{PLANS.map((p) => <div key={p.id} id={p.id} className={`edt-plan${p.highlight ? " hl" : ""}`} style={{ scrollMarginTop: 90 }}>
      {p.highlight && <span className="tag">Most popular</span>}
      <h3>{p.name}</h3><p className="for">{p.for}</p>
      <div className="edt-price"><b>{gbp(yearly ? Math.round(p.yearly / 12) : p.monthly)}</b><span>a month</span></div>
      <p className="edt-note" style={{ marginTop: -8 }}>{yearly ? `${gbp(p.yearly)} billed once a year` : "Billed monthly, cancel any time"}</p>
      <div className="sizes"><span>{p.teachers}</span><span>{p.students}</span></div>
      {p.adds && <p className="adds">{p.adds}</p>}
      <ul>{p.features.map((f) => <li key={f}>{f}</li>)}</ul>
      <Link href={`/osedtech/trial?plan=${p.id}`} className={`edt-btn${p.highlight ? " teal" : ""}`}>{p.cta}</Link>
    </div>)}</div>
  </>;
}
