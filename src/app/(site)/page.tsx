import Link from "next/link";
import { getFewPlaces, getBundles, getSpaceAvailable } from "@/lib/data";
import { CourseCard, roundelSrc } from "./CourseCard";
import { HeroArt, Ticker } from "./HeroArt";
import { SpaceAvailable } from "./SpaceAvailable";
import { KS3Bundles } from "./KS3Bundles";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [few, { ks3Pence, bundles }, space] = await Promise.all([getFewPlaces(), getBundles(), getSpaceAvailable()]);
  return (<>
    <section className="s-hero home"><div className="wrap hero-grid"><div>
      <p className="eyebrow">Online school for home-educated students</p>
      <h1>Outstanding Teaching Inspiring Future Generations</h1>
      <p className="lead">OH-SO ED provides outstanding online education for home-educated students. We offer KS3, pre-GCSE and GCSE courses taught by experienced secondary subject specialists, supported by our 98% GCSE pass rate!</p>
      <div className="btns"><Link className="btn btn-accent" href="/contact">Book a taster!</Link><Link className="btn btn-ghost" href="/courses">Our courses</Link></div>
    </div><HeroArt /></div></section>
    <Ticker items={["Join us for taster lessons", "New courses will start in September"]} />

    {space.length > 0 && <SpaceAvailable items={space} roundels={space.map((c) => roundelSrc(c.subject))} />}

    {few.length > 0 && <section className="s-sec"><div className="wrap">
      <div className="sec-head"><h2>Last Few Places</h2><p>These groups are nearly full. Book now to secure a place.</p></div>
      <div className="cgrid">{few.slice(0, 6).map((c) => <CourseCard key={c.code} c={c} />)}</div>
      <div className="more"><Link className="btn btn-brand" href="/courses">See all courses</Link></div>
    </div></section>}

    <KS3Bundles ks3Pence={ks3Pence} bundles={bundles} />
  </>);
}
