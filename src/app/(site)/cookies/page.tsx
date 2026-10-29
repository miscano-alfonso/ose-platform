import type { Metadata } from "next";
import Link from "@/app/(site)/HoverLink";

export const metadata: Metadata = { title: "Cookie notice", description: "The cookies our website uses, and why." };

const COOKIES: [string, string, string][] = [
  ["ose_family", "Keeps parents and students signed in to their account", "Until you sign out, or a few hours"],
  ["ose_admin", "Keeps staff signed in to the school’s dashboard", "Until they sign out, or a few hours"],
  ["ose_school", "Remembers which school a staff member is working in", "8 hours"],
  ["ose_theme", "Remembers whether you chose light or dark mode", "1 year"],
  ["ose_site, ose_demo", "Only on the demo school: shows the demo website and dashboard", "4 hours"],
];

export default function Cookies() {
  return (<>
    <section className="s-phead"><div className="wrap"><h1>Cookie Notice</h1><p>The small files our website stores in your browser, and why.</p></div></section>
    <section className="s-sec"><div className="wrap legal">
      <p>We only use cookies that the website needs to work, such as keeping you signed in. We don’t use advertising or tracking cookies, and we don’t use Google Analytics or social media pixels. Because these cookies are essential, the law doesn’t require us to ask for your consent, so you won’t see a cookie banner.</p>
      <div className="legal-tw"><table><thead><tr><th>Cookie</th><th>What it’s for</th><th>How long</th></tr></thead><tbody>
        {COOKIES.map(([n, w, h]) => <tr key={n}><td><code>{n}</code></td><td>{w}</td><td>{h}</td></tr>)}
      </tbody></table></div>
      <p>When you pay, you’re taken to Stripe’s secure payment page, which sets its own cookies to prevent fraud. See <a href="https://stripe.com/cookie-settings" target="_blank" rel="noopener">Stripe’s cookie information</a>.</p>
      <p>You can delete or block cookies in your browser’s settings, but you won’t be able to sign in without them.</p>
      <p>If we ever add other cookies, we’ll ask for your permission first and update this page. For how we look after personal information, see our <Link href="/privacy">privacy notice</Link>.</p>
    </div></section>
  </>);
}
