import { marksHtml, SKETCH_FILTER } from "./hero-marks";
import { heroMarks, arranger } from "@/lib/hero-marks-store";
import { HeroComposer } from "./HeroComposer";
import Link from "@/app/(site)/HoverLink";
import { getFewPlaces, getBundles, getSpaceAvailable, getCourses, getPriceRows, getTeachers, type Course } from "@/lib/data";
import { CourseCard, roundelSrc } from "./CourseCard";
import { HeroLessons } from "./HeroLessons";
import { MeetHead, Reviews, MemberOf } from "./HomeExtras";
import { HeroArt, Ticker } from "./HeroArt";
import { TiltTiles } from "./TiltTiles";
import { SpaceAvailable } from "./SpaceAvailable";
import { siteText } from "@/lib/site-content";
import { siteInfo } from "@/lib/db";
import { KS3Bundles } from "./KS3Bundles";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ hero?: string }> }) {
  const heroMode = (await searchParams).hero; // preview only: ?hero=both or ?hero=lessons
  const [few, { ks3Pence, bundles }, space, txt, site] = await Promise.all([getFewPlaces(), getBundles(), getSpaceAvailable(), siteText(), siteInfo()]);
  if (!site.demo) return <BentoHome txt={txt} />;
  return (<>
    <section className="s-hero home"><div className="wrap hero-grid" style={heroMode ? undefined : { gridTemplateColumns: "minmax(0, 760px)" }}><div>
      <p className="eyebrow">{txt.home_eyebrow}</p>
      <h1>{txt.home_title}</h1>
      <p className="lead">{txt.home_lead}</p>
      <div className="btns"><Link className="btn btn-accent" href="/taster">Book a taster!</Link><Link className="btn btn-ghost" href="/courses">Our courses</Link></div>
    </div>{heroMode === "lessons" ? <HeroLessons mode="alone" /> : heroMode === "both" ? <HeroArt><HeroLessons mode="around" /></HeroArt> : null}</div></section>
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

// ---------- the Bento home page (OH-SO ED; the demo school keeps the page above) ----------
const DAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const COLOURS = ["#8fd6f0", "#e9a6ff", "#ffb38a", "#7fe0aa", "#f5c84b"];

async function BentoHome({ txt }: { txt: Record<string, string> }) {
  const [marks, arr] = await Promise.all([heroMarks(), arranger()]);
  const [courses, prices, teachers] = await Promise.all([getCourses(), getPriceRows().catch(() => []), getTeachers().catch(() => [])]);
  const open = courses.filter((c: Course) => c.bookable && !c.is_full);
  const seen = new Set<string>(); const withSpace: Course[] = [];
  for (const c of [...open].sort((a, b) => (a.places_left ?? 99) - (b.places_left ?? 99))) { const k = `${c.level}|${c.subject}`; if (!seen.has(k)) { seen.add(k); withSpace.push(c); } }
  const show = withSpace.slice(0, 16).sort((a, b) => a.level_order - b.level_order || a.subject.localeCompare(b.subject));
  const from = prices[0];
  return <div className="bh bh-home"><TiltTiles />
    <div className="bh-grid">
      <section className="bh-t bh-hero">
        {arr ? <HeroComposer initial={marks} /> : <div className="bh-marks" aria-hidden="true" dangerouslySetInnerHTML={{ __html: marksHtml(marks) }} />}
        <div dangerouslySetInnerHTML={{ __html: SKETCH_FILTER }} style={{ display: "contents" }} />
        <div className="bh-scene" role="img" aria-label="A sketch of a student working at a laptop at a desk, with books flying round"><div className="hero-art hero-solo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="hero-banner" src="/hero/boy.webp" alt="" width={880} height={863} fetchPriority="high" /></div></div>
        <p className="k">{txt.home_eyebrow}</p>
        <h1>Live lessons.<br />Real teachers.<br /><span className="pop">From home.</span></h1>
        <p>{txt.home_lead}</p>
        <div className="btns"><Link className="btn btn-accent" href="/taster">Book a free taster →</Link><Link className="btn btn-ghost" href="/courses">See the courses</Link></div>
      </section>
      <Link className="bh-t bh-pop bh-half" href="/taster"><p className="k">Free taster</p><b>Try a real lesson this week →</b></Link>
      <Link className="bh-t" href="/pricing"><p className="k">{from ? `${from.level} from` : "Prices"}</p><p className="v">{from ? from.per : "£"}<small>{from ? " a lesson" : ""}</small></p><span className="go">Price calculator →</span></Link>
      <Link className="bh-t" href="/teachers"><p className="k">Specialist teachers</p>
        <div className="bh-faces">{teachers.slice(0, 6).map((t, i) => <span key={t.slug} style={{ background: COLOURS[i % COLOURS.length] }}>{t.photo
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={t.photo} alt={t.name} /> : t.name.slice(0, 1)}</span>)}</div>
        <span className="go">Meet the team →</span></Link>
      {show.length > 0 && <section className="bh-t bh-wide">
        <div className="bh-head"><h2>Courses with space</h2><Link className="go" href="/courses">All courses →</Link></div>
        <div className="bh-marquee"><div className="bh-track" style={{ ["--n" as string]: show.length }}>{[...show, ...show].map((c, i) => { const dup = i >= show.length;
          return <Link key={i} className="bh-course" href={`/courses/${c.page_slug}`} style={{ ["--c" as string]: c.colour }} aria-hidden={dup || undefined} tabIndex={dup ? -1 : undefined}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="rd" src={roundelSrc(c.subject)} alt="" width={64} height={64} loading="lazy" />
          <span className="lv">{c.level}</span><b>{c.subject}</b>
          <span className="bh-times">{c.slots?.length ? c.slots.map((x, j) => <i key={j}>{DAYS[x.d]} {x.t}</i>) : "Times to be announced"}</span></Link>; })}</div></div>
      </section>}
      <div className="bh-three bh-two">
      <Link className="bh-t bh-cta bh-homeed" href="/home-ed"><p className="k">New to home education?</p>
        <b>Start here: how home education works in the UK, and how we fit in →</b></Link>
      <Link className="bh-t bh-cta bh-faq" href="/faq"><p className="k">FAQs</p>
        <b>Questions about lessons, payments, exams or Google Classroom? →</b></Link>
      </div>
    </div>
    <MeetHead title={txt.head_title} text={txt.head_text} photo bento />
    <Reviews rating={txt.reviews_rating} count={txt.reviews_count} url={txt.reviews_url} widget={txt.reviews_widget.replace(/[^\w-]/g, "")} />
    <MemberOf />
  </div>;
}
