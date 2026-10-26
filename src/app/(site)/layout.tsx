import Link from "next/link";
import { SiteNav } from "./SiteNav";
import { StyleBridge } from "./StyleBridge";
import { getStyles } from "@/lib/site-content";
import { stylesCss, fontsHref } from "@/lib/styles";
import { brandSrc } from "@/lib/brand";


// same order as the current website's menu
const NAV = [["Courses", "/courses"], ["Other services", "/other-services"], ["Term dates", "/term-dates"], ["Teachers", "/teachers"],
  ["Prices", "/pricing"], ["Timetable", "/timetable"], ["FAQs", "/faq"], ["New to Home Ed?", "/home-ed"], ["Contact", "/contact"]];

const Cart = () => <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6h15l-1.5 9h-12z" /><path d="M6 6 5 3H2" /><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /></svg>;
const Person = () => <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>;

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [styles, { logo }] = await Promise.all([getStyles(), brandSrc()]);
  const css = stylesCss(styles), fonts = fontsHref(styles);
  return (<>
        {fonts && <link id="ose-fonts" rel="stylesheet" href={fonts} />}
        <style id="ose-styles" dangerouslySetInnerHTML={{ __html: css }} />
        <StyleBridge />
        <a className="skip" href="#main">Skip to content</a>
        <header className="s-nav"><div className="wrap">
          <Link href="/" className="s-logo"><img src={logo} alt="OH-SO ED Online School" width={773} height={224} /></Link>
          <div className="s-icons"><Link href="/cart" className="s-ico" aria-label="Basket"><Cart /></Link><Link href="/account" className="s-ico" aria-label="My account"><Person /></Link></div>
          <SiteNav items={NAV as [string, string][]} />
        </div></header>
        <main id="main">{children}</main>
        <footer className="s-foot"><div className="wrap fgrid">
          <div><div className="fl">OH-SO ED</div><p>Outstanding online education for home-educated students.</p>
            <h2 className="fh fh-follow">Follow us</h2><ul><li>Facebook /ohsoedonline</li><li>LinkedIn /ohsoed</li></ul></div>
          <div className="fquick"><h2 className="fh">Quick links</h2><ul className="fcols"><li><Link href="/about">About us</Link></li>{NAV.map(([t, h]) => <li key={h}><Link href={h}>{t}</Link></li>)}<li><Link href="/jobs">Jobs</Link></li></ul></div>
        </div><div className="wrap copy"><span>© {new Date().getFullYear()} Oh-so Educate Ltd</span><Link href="/admin/login" className="adminlink">Admin login</Link></div></footer>
      </>);
}
