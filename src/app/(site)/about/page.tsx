import type { Metadata } from "next";
import Link from "@/app/(site)/HoverLink";
import { siteText } from "@/lib/site-content";
import { siteInfo } from "@/lib/db";
import { roundelFace } from "../CourseCard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "About us", description: "Meet Leanne, Principal of OH-SO ED: outstanding online lessons for home-educated students, taught by experienced secondary subject specialists." };

// The About page (redesigned 31 Oct in the site's tile style). The words are still edited in Admin → Settings → Website, one paragraph per line:
// the first line is the greeting under the title, the second sits on Leanne's tile, and each later paragraph gets its own tile
// (labelled from what it's about); a paragraph about the free taster becomes the yellow tile, and the last line signs it off.
const SUBJECTS = ["English", "Maths", "Science", "History", "Geography", "Business", "Media", "French"];
const label = (p: string) => /taster/i.test(p) ? "Free taster lesson" : /born|started|began|founded/i.test(p) ? "Our story"
  : /practitioner|teachers/i.test(p) ? "Our team" : /key stage|gcse|subjects/i.test(p) ? "Our courses" : "";

export default async function About() {
  const [txt, site] = await Promise.all([siteText(), siteInfo()]);
  const paras = txt.about_text.split("\n").map((p) => p.trim()).filter(Boolean);
  const [hello, intro, ...rest] = paras;
  const signOff = rest.length > 1 && rest[rest.length - 1].length < 80 ? rest.pop() : undefined;
  const taster = rest.find((p) => /taster/i.test(p));
  const tiles = rest.filter((p) => p !== taster);
  return (<>
    <section className="s-phead"><div className="wrap">
      <h1>{txt.about_title}</h1>
      {hello && <p className="ab-hello">{hello}</p>}
      <div className="cd-hbtns"><Link href="/taster">Book a taster</Link><Link href="/teachers">Meet the team</Link><Link href="/courses">Our courses</Link></div>
    </div></section>
    <section className="s-sec ab-sec"><div className="wrap ab-grid">
      <article className="ab-tile ab-lead">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {!site.demo && <div className="ab-photo"><img src="/teachers/leanne-iacurci.webp" alt="Leanne Iacurci, Principal and English Teacher" width={640} height={345} /></div>}
        <p className="ab-k">Meet the principal</p>
        <h2>Leanne Iacurci</h2>
        <p className="ab-role">Principal and English Teacher</p>
        {intro && !/^i[’']m leanne/i.test(intro) && <p>{intro}</p>}
      </article>
      {tiles.map((p, i) => {
        const k = label(p);
        return <article key={i} className={`ab-tile${k === "Our courses" ? " ab-courses" : ""}`}>
          {k && <p className="ab-k">{k}</p>}
          <p className="ab-body">{p}</p>
          {k === "Our courses" && !site.demo && <div className="ab-rds" aria-hidden="true">{SUBJECTS.map((s) => { const f = roundelFace(s);
            return <span key={s} className="cd-rtext" style={{ ["--rbg" as string]: f.bg }}><span>OH–SO</span><span>{f.word}</span></span>; })}</div>}
          {k === "Our courses" && <Link className="ab-more" href="/courses">See all courses →</Link>}
          {k === "Our team" && <Link className="ab-more" href="/teachers">Meet the team →</Link>}
        </article>;
      })}
      {(taster || signOff) && <article className="ab-tile ab-taster">
        <p className="ab-k">Free taster lesson</p>
        {taster && <p className="ab-body">{taster}</p>}
        {signOff && <p className="ab-sign">{signOff}</p>}
        <div className="ab-tbtns"><Link className="ab-go" href="/taster">Book a taster</Link><Link className="ab-go ab-line" href="/contact">Contact us</Link></div>
      </article>}
    </div></section>
  </>);
}
