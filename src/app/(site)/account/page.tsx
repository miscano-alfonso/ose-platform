import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentFamily } from "@/lib/family-auth";
import { sendLinkAction } from "../../(family)/actions";

export const metadata: Metadata = { title: "My account", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// Parents and students sign in with a link emailed to them.
export default async function Account({ searchParams }: { searchParams: Promise<{ sent?: string; err?: string; expired?: string; out?: string }> }) {
  const sp = await searchParams;
  const f = await currentFamily();
  if (f && !sp.out) redirect(f.kind === "parent" ? "/parent" : "/student");
  return (<>
    <section className="s-phead"><div className="wrap"><h1>My Account</h1><p>Parents: your children’s lessons, attendance, reports and payments. Students: your classes, chat and rewards.</p></div></section>
    <section className="s-sec"><div className="wrap">
      {sp.sent ? <div className="login"><h2 style={{ marginTop: 0 }}>Check your email</h2>
        <p>If that address is on our records, we’ve sent you a sign-in link. It works once, for the next 30 minutes. It can take a minute to arrive; check your spam folder too.</p>
        <p><Link href="/account">Use a different email</Link></p></div>
      : <form className="login" action={sendLinkAction}>
        {sp.expired && <p className="note" role="alert">That sign-in link has expired or was already used. Ask for a new one below.</p>}
        {sp.out && <p className="note">You’re signed out.</p>}
        {sp.err && <p className="note" role="alert">{sp.err}</p>}
        <label>Email<input type="email" name="email" autoComplete="email" required /></label>
        <button className="btn btn-brand" type="submit">Email me a sign-in link</button>
        <p className="note">Parents: use the email you booked with. Students: use your own Google account. New to OH-SO ED? An account is created when you book your first course. Questions? <Link href="/contact">Contact us</Link>.</p>
      </form>}
    </div></section>
  </>);
}
