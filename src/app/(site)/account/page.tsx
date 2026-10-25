import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "My account", robots: { index: false, follow: false } };

// Parent sign-in. The parent dashboard comes in a later update; until then the form is shown but can't be used.
export default function Account() {
  return (<>
    <section className="s-phead"><div className="wrap"><h1>My Account</h1><p>Sign in to see your children’s courses, timetables, payments and invoices.</p></div></section>
    <section className="s-sec"><div className="wrap">
      <form className="login" aria-describedby="acct-note">
        <label>Email<input type="email" name="email" autoComplete="username" disabled /></label>
        <label>Password<input type="password" name="password" autoComplete="current-password" disabled /></label>
        <button className="btn btn-brand" type="button" disabled>Sign in</button>
        <p id="acct-note" className="note">Parent accounts open here soon. New to OH-SO ED? An account is created when you book your first course. Questions? <Link href="/contact">Contact us</Link>.</p>
      </form>
    </div></section>
  </>);
}
