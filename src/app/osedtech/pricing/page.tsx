import Link from "next/link";
import { Plans } from "./Plans";
import { COMPARE, PLANS, TRIAL_DAYS, EXTRA_STUDENT, gbp, RIVALS, VERSUS, NAMED } from "../plans";

export const metadata = { title: "Pricing", description: "OH-SO EdTech plans for one teacher, a small team or a whole online school. Try any plan free for 30 days." };

const vs = (v: string) => v === "yes" ? <span className="edt-yes" aria-label="Yes" /> : v === "no" ? <span className="edt-no" aria-label="No">–</span> : v === "some" ? <span className="edt-some">Some</span> : <span>{v}</span>;
const cell = (v: boolean | string) => v === true ? <span className="edt-yes" aria-label="Included" /> : v === false ? <span className="edt-no" aria-label="Not included">–</span> : <span>{v}</span>;

function TrialCtaInline() {
  return <div className="edt-btns"><Link href="/osedtech/trial" className="edt-btn">Start a free trial</Link><Link href="/osedtech/demo" className="edt-btn line">Look round the demo</Link></div>;
}

export default function Pricing() {
  return <>
    <section className="edt-sec tight"><div className="edt-wrap edt-center">
      <p className="edt-eyebrow">Pricing</p>
      <h1 className="edt-h1">Pay for the school you run today</h1>
      <p className="edt-lead">Start on your own and move up when you take on teachers or staff. Every plan is free for {TRIAL_DAYS} days, with no card needed.</p>
      <Plans />
      <div className="edt-fine" style={{ textAlign: "left" }}>
        <div><b>No commission on fees</b>Families pay into your own Stripe account. Stripe charges its usual card fees; we take nothing.</div>
        <div><b>Works with Google</b>Your school needs Google Workspace for Meet, Classroom and Drive (Google’s subscription is separate). <Link href="/osedtech#google">What you’ll need</Link></div>
        <div><b>No contract</b>Monthly or yearly. Change plan or cancel whenever you like.</div>
        <div><b>Your data stays yours</b>Export it any time. If you leave, we hand it over and then delete it.</div>
        <div><b>Growing past your plan</b>Each plan includes a number of students. Above that it’s {gbp(EXTRA_STUDENT)} a month for each extra student, counted from your active students each month, or move up a plan when the extras add up.</div>
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
    <section className="edt-sec" id="compare" style={{ scrollMarginTop: 70 }}><div className="edt-wrap">
      <p className="edt-eyebrow">How we compare</p>
      <h2 className="edt-h2">One system instead of four or five</h2>
      <p className="edt-lead">Most teachers running classes online pay for a booking or tutoring app, a website builder, a newsletter tool and something for payroll, then copy things between them. Here’s what each kind of tool usually covers on its own.</p>
      <div className="edt-tw"><table className="edt-cmp edt-vs">
        <thead><tr><th scope="col"></th>{RIVALS.map((r, i) => <th key={r} scope="col" className={i === 0 ? "us" : undefined}>{r}</th>)}</tr></thead>
        <tbody>{VERSUS.map(([label, ...vals]) => <tr key={label} className={label === "Typical cost" ? "cost" : undefined}><td>{label}</td>{vals.map((v, i) => <td key={i} className={i === 0 ? "us" : undefined}>{vs(v)}</td>)}</tr>)}</tbody>
      </table></div>
      <p className="edt-note" style={{ marginTop: 12 }}>Based on what typical products of each kind include as standard; individual products vary. “Some” means some products offer it, or offer part of it. Prices are typical starting prices, October 2026.</p>
      <h3 style={{ fontSize: 26, marginTop: 48 }}>Compared with tools people often use</h3>
      <div className="edt-tw"><table className="edt-cmp edt-named">
        <thead><tr><th scope="col">Product</th><th scope="col">Mainly for</th><th scope="col">Starts at</th><th scope="col">How the price grows</th><th scope="col">Cut of your fees</th></tr></thead>
        <tbody>{NAMED.map((n) => <tr key={n.name} className={n.us ? "us" : undefined}><td><b>{n.name}</b></td><td>{n.for}</td><td style={{ whiteSpace: "nowrap" }}>{n.from}</td><td>{n.grows}</td><td>{n.cut}</td></tr>)}</tbody>
      </table></div>
      <p className="edt-note" style={{ marginTop: 12 }}>From each company’s published pricing, checked 27 October 2026; dollar prices are their US prices and all exclude tax. Prices and features change, so check their websites. Card processing fees (for example Stripe’s) apply on top for every product, including ours.</p>
      <div className="edt-grid">
        <div className="edt-card"><h3>Built for a school</h3><p>Terms and holidays, families with more than one child, instalments, tasters that turn into bookings, and teachers paid by the lesson.</p></div>
        <div className="edt-card"><h3>Google Meet and Classroom, done for you</h3><p>Attendance from who actually joined each lesson, and recordings named, filed and posted to the right Classroom.</p></div>
        <div className="edt-card"><h3>No cut of your fees</h3><p>Families pay into your own Stripe account. We never take a percentage, however much you grow.</p></div>
        <div className="edt-card"><h3>A real school runs on it</h3><p>We built it for OH-SO ED, so it’s been shaped by a working online school, not a guess at what teachers need.</p></div>
      </div>
      <TrialCtaInline />
    </div></section>
  </>;
}
