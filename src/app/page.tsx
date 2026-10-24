import Link from "next/link";
import { getFewPlaces, getBundles } from "@/lib/data";
import { money } from "@/lib/format";
import { CourseCard } from "./CourseCard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [few, { ks3Pence, bundles }] = await Promise.all([getFewPlaces(), getBundles()]);
  const cols = [{ name: "Single Course", n: 1, pc: 0 }, ...bundles.map((b) => ({ name: `${b.min_courses} Courses Bundle`, n: b.min_courses, pc: Number(b.percent_off) }))];
  return (<>
    <section className="s-hero"><div className="wrap">
      <p className="eyebrow">Online school for home-educated students</p>
      <h1>Outstanding Teaching Inspiring Future Generations</h1>
      <p className="lead">OH-SO ED provides outstanding online education for home-educated students. We offer KS3, pre-GCSE and GCSE courses taught by experienced secondary subject specialists, supported by our 98% GCSE pass rate!</p>
      <div className="btns"><Link className="btn btn-accent" href="/courses">Our courses</Link><Link className="btn btn-ghost" href="/timetable">Timetable</Link></div>
    </div></section>

    {few.length > 0 && <section className="s-sec"><div className="wrap">
      <div className="sec-head"><h2>Last Few Places</h2><p>These groups are nearly full. Book now to secure a place.</p></div>
      <div className="cgrid">{few.slice(0, 6).map((c) => <CourseCard key={c.code} c={c} />)}</div>
      <div className="more"><Link className="btn btn-brand" href="/courses">See all courses</Link></div>
    </div></section>}

    {ks3Pence > 0 && <section className="s-sec s-price"><div className="wrap">
      <div className="sec-head"><h2>Cost For a Typical KS3 Year</h2></div>
      <div className="pgrid">{cols.map((b) => {
        const each = ks3Pence * (1 - b.pc / 100);
        return <div className="bundle" key={b.name}><h3>{b.name}</h3>{b.pc > 0 && <span className="burst">{b.pc}%<br />Discount</span>}
          {Array.from({ length: b.n }, (_, i) => <div className="ln" key={i}>{b.pc > 0 && <s>{money(ks3Pence)}</s>}<span>{money(each)}</span></div>)}
          {b.n > 1 && <div className="tot">{b.pc > 0 && <s>{money(ks3Pence * b.n)}</s>}<span>{money(each * b.n)}</span></div>}</div>;
      })}</div>
    </div></section>}
  </>);
}
