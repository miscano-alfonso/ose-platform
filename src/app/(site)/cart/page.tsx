import type { Metadata } from "next";
import Link from "@/app/(site)/HoverLink";
import { cartQuote } from "@/lib/cart";
import { currentFamily } from "@/lib/family-auth";
import { familyChildren } from "@/lib/registration";
import { money } from "@/lib/format";
import { roundelFace } from "../CourseCard";
import { removeFromCart, applyCoupon, checkout } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Basket", robots: { index: false, follow: false } };
const DAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TERMS_URL = "https://ohsoed.co.uk/terms-conditions";

// The basket (31 Oct), from ohsoed.co.uk/cart in the new style: the courses on the left, the summary and checkout on the right.
// Checkout sends the booking to the office (Admin → Enquiries), who confirm the places and email a secure payment link.
// Checkout needs a registered parent: each course is then given to one of their children (as on the old site's "Assign student").
export default async function Cart({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string; welcome?: string; added?: string }> }) {
  const [q, sp, fam] = await Promise.all([cartQuote(), searchParams, currentFamily()]);
  const n = q.lines.length;
  const parent = fam?.kind === "parent" ? fam : null;
  const kids = parent ? await familyChildren(parent.id) : [];
  return (<>
    <section className="s-phead"><div className="wrap"><h1>Your Basket</h1>
      <p>{sp.sent ? "Thank you, your booking is with us." : n ? `${n} course${n > 1 ? "s" : ""} · ${money(q.payPence)} including registration` : "Choose a course and add it here to book."}</p>
      <div className="cd-hbtns"><Link href="/courses">← {n ? "Add more courses" : "Browse courses"}</Link>{n > 0 && <a href="#checkout">Checkout</a>}</div>
    </div></section>
    <section className="s-sec"><div className="wrap">
      {sp.sent ? <div className="bk-tile bk-done" role="status"><p className="ab-k">Booking received</p><h2>Thank you, we’ll email you shortly</h2>
          <p>We’ll check the places and email you a secure link to pay, with everything you need for the first lesson. Any questions, just reply to that email.</p>
          <div className="cd-hbtns"><Link href="/courses">Back to courses</Link><Link href="/term-dates">Term dates</Link></div></div>
      : n === 0 ? <div className="bk-tile bk-done"><p className="ab-k">Basket</p><h2>Your basket is empty</h2>
          <p>Pick a course, press “Add to cart”, and it lands here. Taking 3 or more courses? The bundle discount is applied automatically.</p>
          <div className="cd-hbtns"><Link href="/courses">Browse courses</Link><Link href="/other-services">Workshops</Link></div></div>
      : <div className="bk-grid">
        <div className="bk-tile bk-list">
          <p className="ab-k">Courses</p>
          <ul className="bk-rows">{q.lines.map((l) => { const f = roundelFace(l.subject);
            return <li key={l.code} className="bk-row" style={{ ["--c" as string]: f.bg }}>
              <span className="cd-rtext bk-rd" style={{ ["--rbg" as string]: f.bg }} aria-hidden="true"><span>OH–SO</span><span>{f.word}</span></span>
              <div className="bk-name"><Link href={`/courses/${l.page_slug}`}><b>{l.subject}</b></Link>
                <span>{l.level} · {l.years} year{l.years > 1 ? "s" : ""}</span>
                {l.slots?.map((s, i) => <span key={i} className="bk-slot">{DAYS[s.d]} {s.t}</span>)}</div>
              <div className="bk-price"><b>{money(l.netPence)}</b>{l.discountPence > 0 && <s>{money(l.listPence)}</s>}<span>or {money(l.perTermPence)} a term</span></div>
              {parent && <label className="bk-who"><span>Student</span>{kids.length ? <select name={`who:${l.code}`} form="bk-checkout" required defaultValue={kids.length === 1 ? kids[0].id : ""}>
                  {kids.length > 1 && <option value="" disabled>Choose a child</option>}{kids.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select>
                : <Link href="/register?next=/cart">Add a child first</Link>}</label>}
              <form action={removeFromCart}><input type="hidden" name="code" value={l.code} />
                <button className="bk-x" type="submit" aria-label={`Remove ${l.level} ${l.subject}`} title="Remove">×</button></form>
            </li>; })}</ul>
          <ol className="bk-notes">
            <li>10% off when you take 3 or 4 courses, 15% off for 5 or more, applied automatically.</li>
            <li>Registration fee: {q.lines[0] ? money(q.lines[0].feePence) : "£25"} per course (non-refundable).</li>
            <li>Spread the cost: pay each course in equal instalments, taken 2 weeks before each term starts.</li>
          </ol>
        </div>
        <aside id="checkout" className="bk-tile bk-sum">
          <p className="ab-k">Summary</p>
          <dl className="bk-dl">
            <div><dt>Subtotal</dt><dd>{money(q.subtotalPence)}</dd></div>
            {q.bundlePence > 0 && <div className="bk-off"><dt>Bundle discount <sup>1</sup> · {q.bundlePct}%</dt><dd>−{money(q.bundlePence)}</dd></div>}
            {q.coupon && <div className="bk-off"><dt>Coupon {q.coupon.code}{q.coupon.label ? ` · ${q.coupon.label}` : ""}</dt><dd>−{money(q.coupon.pence)}</dd></div>}
            <div><dt>Courses total</dt><dd>{money(q.totalPence)}</dd></div>
            <div><dt>Registration fees <sup>2</sup></dt><dd>{money(q.feesPence)}</dd></div>
            <div className="bk-big"><dt>Total payment</dt><dd>{money(q.payPence)}</dd></div>
          </dl>
          <details className="bk-coupon" open={!!q.coupon || !!sp.error?.includes("coupon")}><summary>I have a coupon code</summary>
            <form action={applyCoupon} className="bk-cform"><input name="coupon" defaultValue={q.coupon?.code ?? ""} placeholder="Coupon code" aria-label="Coupon code" maxLength={40} />
              <button type="submit">Apply</button></form></details>
          {!parent ? <div className="bk-reg">
            {sp.error && <p className="notice err" role="alert">{sp.error}</p>}
            <p className="ab-k">Check out</p>
            <p>To book, create your family account with your children’s details, or sign in if you already have one. Your basket is kept.</p>
            <Link className="wk-go bk-go" href="/register?next=/cart">Register to check out</Link>
            <Link className="bk-line" href="/account?next=cart">I already have an account</Link>
          </div>
          : <form action={checkout} id="bk-checkout" className="cform bk-form">
            {sp.welcome && <p className="notice ok" role="status">Welcome, {parent.first}. Your account is ready: choose the student for each course, then check out.</p>}
            {sp.added && <p className="notice ok" role="status">Child added. Choose them for each course on the left.</p>}
            {sp.error && <p className="notice err" role="alert">{sp.error}</p>}
            <p className="bk-who-note">Booking as <b>{parent.first} {parent.last}</b> · {parent.email}. <Link href="/register?next=/cart">+ Add a child</Link></p>
            <label className="bk-check"><input type="checkbox" name="spread" value="1" /><span>Spread the cost in termly instalments <sup>3</sup></span></label>
            <p className="bk-spread">About <b>{money(q.perTermPence)}</b> a term over {q.terms} terms, plus {money(q.feesPence)} registration today.</p>
            <label>Anything we should know? <small className="note">optional</small><textarea name="message" rows={2} maxLength={1500} /></label>
            <label className="bk-check"><input type="checkbox" name="terms" value="1" required /><span>I agree to the <a href={TERMS_URL} target="_blank" rel="noopener noreferrer">Terms &amp; Conditions</a></span></label>
            <button className="wk-go bk-go" type="submit" disabled={!kids.length}>Checkout</button>
            <p className="note">We’ll confirm the places and email you a secure payment link.</p>
          </form>}
        </aside>
      </div>}
    </div></section>
  </>);
}
