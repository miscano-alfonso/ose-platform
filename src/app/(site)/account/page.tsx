import type { Metadata } from "next";
import Link from "@/app/(site)/HoverLink";
import { redirect } from "next/navigation";
import { currentFamily } from "@/lib/family-auth";
import { sendLinkAction } from "../../(family)/actions";

export const metadata: Metadata = { title: "My account", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// Parents and students sign in with a link emailed to them.
export default async function Account({ searchParams }: { searchParams: Promise<{ sent?: string; err?: string; expired?: string; out?: string; next?: string }> }) {
  const sp = await searchParams;
  const f = await currentFamily();
  const join = /^\/join\/[0-9a-f-]{36}$/i.test(sp.next ?? "") ? sp.next! : null;   // 5 Nov: sent here by a lesson's Join link
  if (f && join) redirect(f.kind === "student" ? join : `/lesson-join?why=parent`);
  if (f && !sp.out) redirect(f.kind === "parent" ? (sp.next === "cart" ? "/cart" : sp.next === "taster" ? "/taster" : "/parent") : "/student");
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
        {join && <div className="note" style={{ marginBottom: 12 }}><b>Sign in to join your lesson.</b> Use your own email address (the Google account we have for you), not a parent’s. We’ll email you a link; once you’re signed in, the Join button takes you straight in for 30 days. Staff: open lessons from your register.</div>}
        {sp.next && <input type="hidden" name="next" value={join ?? sp.next.slice(0, 20)} />}
        <label>Email<input type="email" name="email" autoComplete="email" required /></label>
        <button className="btn btn-brand" type="submit">Email me a sign-in link</button>
        <p className="note">Parents: use the email you booked with. Students: use your own Google account. New here? <Link href="/register">Register your family</Link>. Questions? <Link href="/contact">Contact us</Link>.</p>
      </form>}
    </div></section>
  </>);
}
