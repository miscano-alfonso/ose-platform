import Link from "next/link";
import { getFewPlaces, getBundles, getSpaceAvailable } from "@/lib/data";
import { CourseCard, roundelSrc } from "./CourseCard";
import { HeroArt, Ticker } from "./HeroArt";
import { SpaceAvailable } from "./SpaceAvailable";
import { siteText } from "@/lib/site-content";
import { KS3Bundles } from "./KS3Bundles";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [few, { ks3Pence, bundles }, space, txt] = await Promise.all([getFewPlaces(), getBundles(), getSpaceAvailable(), siteText()]);
  return (<>
    <section className="s-hero home"><div className="wrap hero-grid"><div>
      <p className="eyebrow">{txt.home_eyebrow}</p>
      <h1>{txt.home_title}</h1>
      <p className="lead">{txt.home_lead}</p>
      <div className="btns"><Link className="btn btn-accent" href="/contact">Book a taster!</Link><Link className="btn btn-ghost" href="/courses">Our courses</Link></div>
    </div><HeroArt /></div></section>
    <Ticker items={txt.ticker.split("\n").map((t) => t.trim()).filter(Boolean)} />

    {space.length > 0 && <SpaceAvailable items={space} roundels={space.map((c) => roundelSrc(c.subject))} />}

    {few.length > 0 && <section className="s-sec"><div className="wrap">
      <div className="sec-head"><h2>Last Few Places</h2><p>These groups are nearly full. Book now to secure a place.</p></div>
      <div className="cgrid">{few.slice(0, 6).map((c) => <CourseCard key={c.code} c={c} />)}</div>
      <div className="more"><Link className="btn btn-brand" href="/courses">See all courses</Link></div>
    </div></section>}

    <KS3Bundles ks3Pence={ks3Pence} bundles={bundles} />
  </>);
}
