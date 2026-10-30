import type { Metadata } from "next";
import Link from "next/link";
import "./edtech.css";
import { Mark } from "./Mark";

// OH-SO EdTech: the software business selling the OH-SO ED platform to other teachers. Its own look, separate from the school's site.
export const metadata: Metadata = {
  title: { default: "OH-SO EdTech | Run your online school under your own name", template: "%s | OH-SO EdTech" },
  description: "The platform behind OH-SO ED, a real online school, for teachers running their own classes: your website, bookings, payments, Google Meet attendance, reports and marketing, under your own brand.",
  icons: { icon: "/osedtech/icon.svg" },
};

export default function EdTechLayout({ children }: { children: React.ReactNode }) {
  return <div className="edt">
    <a className="edt-skip" href="#main">Skip to content</a>
    <header className="edt-head"><div className="edt-wrap">
      <Link href="/osedtech" className="edt-logo" aria-label="OH-SO EdTech home"><Mark /></Link>
      <nav className="edt-nav" aria-label="Main">
        <Link href="/osedtech/features">Features</Link>
        <Link href="/osedtech/pricing">Pricing</Link>
        <Link href="/osedtech#who">Who it’s for</Link>
        <Link href="/osedtech#faq">FAQ</Link>
        <Link href="/osedtech/demo">Demo</Link>
        <Link href="/osedtech/login">Sign in</Link>
        <Link href="/osedtech/trial" className="edt-btn sm">Start a free trial</Link>
      </nav>
    </div></header>
    <main id="main">{children}</main>
    <footer className="edt-foot"><div className="edt-wrap">
      <div><Mark small dark /><p>The platform behind OH-SO ED, for teachers running their own online classes under their own name.</p></div>
      <nav aria-label="Footer"><Link href="/osedtech/features">Features</Link><Link href="/osedtech/pricing">Pricing</Link><Link href="/osedtech/pricing#compare">How we compare</Link><Link href="/osedtech/demo">Demo</Link><Link href="/osedtech/trial">Free trial</Link><a href="/">OH-SO ED, the school</a></nav>
      <p className="edt-small">© {new Date().getFullYear()} OH-SO EdTech. Prices exclude VAT where it applies.</p>
    </div></footer>
  </div>;
}
