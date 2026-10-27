import type { Metadata } from "next";
import Link from "next/link";
import { siteText } from "@/lib/site-content";
import { siteInfo } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "About us", description: "Meet Leanne, Principal of OH-SO ED: outstanding online lessons for home-educated students, taught by experienced secondary subject specialists." };

// The About page from ohsoed.co.uk. Text is edited in Admin → Settings → Website.
export default async function About() {
  const [txt, site] = await Promise.all([siteText(), siteInfo()]);
  const paras = txt.about_text.split("\n").map((p) => p.trim()).filter(Boolean);
  return (<>
    <section className="s-phead"><div className="wrap"><h1>{txt.about_title}</h1></div></section>
    <section className="s-sec about"><div className="wrap about-grid">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {!site.demo && <img className="head-photo about-photo" src="/teachers/leanne-iacurci.webp" alt="Leanne Iacurci, Principal and English Teacher" width={640} height={345} />}
      <div className="about-text">
        {paras.map((p, i) => <p key={i} className={i === 0 ? "about-hello" : undefined}>{p}</p>)}
        <div className="btns"><Link className="btn btn-accent" href="/contact">Book a taster!</Link><Link className="btn btn-brand" href="/teachers">Meet the team</Link><Link className="btn btn-ghost hub-ghost" href="/courses">Our courses</Link></div>
      </div>
    </div></section>
  </>);
}
