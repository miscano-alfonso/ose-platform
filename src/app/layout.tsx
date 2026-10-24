import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "OH-SO ED | Online school for home-educated students", template: "%s | OH-SO ED" },
  description: "Outstanding live online lessons for home-educated students: KS3, pre-GCSE and GCSE courses taught by experienced secondary subject specialists.",
  robots: process.env.SITE_PASSWORD ? { index: false, follow: false } : undefined,
};

const NAV = [["Courses", "/courses"], ["Timetable", "/timetable"], ["Term dates", "/term-dates"], ["Teachers", "/teachers"]];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600&display=swap" />
      </head>
      <body>
        <a className="skip" href="#main">Skip to content</a>
        <header className="s-nav"><div className="wrap">
          <Link href="/" className="s-logo">OH-SO ED</Link>
          <nav className="s-links" aria-label="Main">{NAV.map(([t, h]) => <Link key={h} href={h}>{t}</Link>)}</nav>
        </div></header>
        <main id="main">{children}</main>
        <footer className="s-foot"><div className="wrap fgrid">
          <div><div className="fl">OH-SO ED</div><p>Outstanding online education for home-educated students.</p></div>
          <div><h2 className="fh">Quick links</h2><ul>{NAV.map(([t, h]) => <li key={h}><Link href={h}>{t}</Link></li>)}</ul></div>
          <div><h2 className="fh">Follow us</h2><ul><li>Facebook /ohsoedonline</li><li>LinkedIn /ohsoed</li></ul></div>
        </div><div className="wrap copy">© {new Date().getFullYear()} Oh-so Educate Ltd</div></footer>
      </body>
    </html>
  );
}
