import Link from "next/link";
import { getFewPlaces, getBundles, getSpaceAvailable } from "@/lib/data";
import { CourseCard, roundelSrc } from "./CourseCard";
import { HeroLessons } from "./HeroLessons";
import { MeetHead, Reviews, MemberOf } from "./HomeExtras";
import { HeroArt, Ticker } from "./HeroArt";
import { SpaceAvailable } from "./SpaceAvailable";
import { siteText } from "@/lib/site-content";
import { siteInfo } from "@/lib/db";
import { KS3Bundles } from "./KS3Bundles";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ hero?: string }> }) {
  const heroMode = (await searchParams).hero; // preview only: ?hero=both or ?hero=lessons
  const [few, { ks3Pence, bundles }, space, txt, site] = await Promise.all([getFewPlaces(), getBundles(), getSpaceAvailable(), siteText(), siteInfo()]);
  return (<>
    <section className="s-hero home"><div className="wrap hero-grid"><div>
      <p className="eyebrow">{txt.home_eyebrow}</p>
      <h1>{txt.home_title}</h1>
      <p className="lead">{txt.home_lead}</p>
      <div className="btns"><Link className="btn btn-accent" href="/contact">Book a taster!</Link><Link className="btn btn-ghost" href="/courses">Our courses</Link></div>
    </div>{heroMode === "lessons" ? <HeroLessons mode="alone" /> : <HeroArt>{heroMode === "both" && <HeroLessons mode="around" />}</HeroArt>}</div></section>
    <Ticker items={txt.ticker.split("\n").map((t) => t.trim()).filter(Boolean)} />

    {space.length > 0 && <SpaceAvailable items={space} roundels={space.map((c) => roundelSrc(c.subject, site.demo))} />}

    {few.length > 0 && <section className="s-sec"><div className="wrap">
      <div className="sec-head"><h2>Last Few Places</h2><p>These groups are nearly full. Book now to secure a place.</p></div>
      <div className="cgrid">{few.slice(0, 6).map((c) => <CourseCard key={c.code} c={c} mark={site.demo ? "DEMO" : undefined} />)}</div>
      <div className="more"><Link className="btn btn-brand" href="/courses">See all courses</Link></div>
    </div></section>}

    <KS3Bundles ks3Pence={ks3Pence} bundles={bundles}><div className="more calc-cta"><Link className="btn btn-accent" href="/calculator">Work out your price with the calculator</Link></div></KS3Bundles>
    <MeetHead title={txt.head_title} text={txt.head_text} photo={!site.demo} />
    {!site.demo && <Reviews rating={txt.reviews_rating} count={txt.reviews_count} url={txt.reviews_url} widget={txt.reviews_widget.replace(/[^\w-]/g, "")} />}
    {!site.demo && <MemberOf />}
  </>);
}
