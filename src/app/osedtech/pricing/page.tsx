import Link from "next/link";
import { Plans } from "./Plans";
import { COMPARE, PLANS, TRIAL_DAYS } from "../plans";

export const metadata = { title: "Pricing", description: "OH-SO EdTech plans for one teacher, a small team or a whole online school. Try any plan free for 30 days." };

const cell = (v: boolean | string) => v === true ? <span className="edt-yes" aria-label="Included" /> : v === false ? <span className="edt-no" aria-label="Not included">–</span> : <span>{v}</span>;

export default function Pricing() {
  return <>
    <section className="edt-sec tight"><div className="edt-wrap edt-center">
      <p className="edt-eyebrow">Pricing</p>
      <h1 className="edt-h1">Pay for the school you run today</h1>
      <p className="edt-lead">Start on your own and move up when you take on teachers or staff. Every plan is free for {TRIAL_DAYS} days, with no card needed.</p>
      <Plans />
      <div className="edt-fine" style={{ textAlign: "left" }}>
        <div><b>No commission on fees</b>Families pay into your own Stripe account. Stripe charges its usual card fees; we take nothing.</div>
        <div><b>No contract</b>Monthly or yearly. Change plan or cancel whenever you like.</div>
        <div><b>Your data stays yours</b>Export it any time. If you leave, we hand it over and then delete it.</div>
        <div><b>Bigger than School?</b><Link href="/osedtech/trial?plan=school">Tell us about it</Link> and we’ll work out a price together.</div>
      </div>
    </div></section>
    <section className="edt-sec white"><div className="edt-wrap">
      <h2 className="edt-h2">Compare the plans</h2>
      <div className="edt-tw"><table className="edt-cmp">
        <thead><tr><th scope="col">What’s included</th>{PLANS.map((p) => <th key={p.id} scope="col">{p.name}</th>)}</tr></thead>
        <tbody>{COMPARE.map(([grp, rows]) => [
          <tr key={grp} className="grp"><td colSpan={4}>{grp}</td></tr>,
          ...rows.map(([label, a, b, c]) => <tr key={grp + label}><td>{label}</td><td>{cell(a)}</td><td>{cell(b)}</td><td>{cell(c)}</td></tr>),
        ])}</tbody>
      </table></div>
      <div className="edt-btns"><Link href="/osedtech/trial" className="edt-btn">Start a free trial</Link><Link href="/osedtech/features" className="edt-btn line">See how it works</Link></div>
    </div></section>
  </>;
}
