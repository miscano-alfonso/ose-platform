import Link from "next/link";
import { getFewPlaces, getBundles } from "@/lib/data";
import { CourseCard } from "./CourseCard";
import { KS3Bundles } from "./KS3Bundles";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [few, { ks3Pence, bundles }] = await Promise.all([getFewPlaces(), getBundles()]);
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

    <KS3Bundles ks3Pence={ks3Pence} bundles={bundles} />
  </>);
}
