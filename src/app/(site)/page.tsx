import { HERO_ART } from "./hero-art";
import Link from "next/link";
import { getFewPlaces, getBundles, getSpaceAvailable, getCourses, getNowNext, getPriceRows, getTeachers, type Course, type NowLesson } from "@/lib/data";
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
  if (!site.demo) return <BentoHome txt={txt} />;
  return (<>
    <section className="s-hero home"><div className="wrap hero-grid"><div>
      <p className="eyebrow">{txt.home_eyebrow}</p>
      <h1>{txt.home_title}</h1>
      <p className="lead">{txt.home_lead}</p>
      <div className="btns"><Link className="btn btn-accent" href="/taster">Book a taster!</Link><Link className="btn btn-ghost" href="/courses">Our courses</Link></div>
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

// ---------- the Bento home page (OH-SO ED; the demo school keeps the page above) ----------
const DAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const COLOURS = ["#8fd6f0", "#e9a6ff", "#ffb38a", "#7fe0aa", "#f5c84b"];
const dayLabel = (d: string) => { const t = new Date(); const iso = (x: Date) => x.toISOString().slice(0, 10); const tom = new Date(t.getTime() + 864e5);
  return d === iso(t) ? "Today" : d === iso(tom) ? "Tomorrow" : new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" }); };
const lessonLine = (l: NowLesson) => `${l.teacher ? `with ${l.teacher} · ` : ""}${l.starts}–${l.ends}`;

async function BentoHome({ txt }: { txt: Record<string, string> }) {
  const [courses, nn, prices, teachers] = await Promise.all([getCourses(), getNowNext(), getPriceRows().catch(() => []), getTeachers().catch(() => [])]);
  const open = courses.filter((c: Course) => c.bookable && !c.is_full);
  const seen = new Set<string>(); const withSpace: Course[] = [];
  for (const c of [...open].sort((a, b) => (a.places_left ?? 99) - (b.places_left ?? 99))) { const k = `${c.level}|${c.subject}`; if (!seen.has(k)) { seen.add(k); withSpace.push(c); } }
  const show = withSpace.slice(0, 8).sort((a, b) => a.level_order - b.level_order || a.subject.localeCompare(b.subject));
  const from = prices[0];
  const live = nn.live, next = nn.next;
  const classes = new Set(courses.filter((c) => c.status !== "hidden" && c.status !== "closed").map((c) => c.code)).size;
  return <div className="bh">
    <div className="bh-grid">
      <section className="bh-t bh-hero">
        <div className="bh-art" role="img" aria-label="A teenager learning at home at his laptop, with maths, English and science symbols floating around him" dangerouslySetInnerHTML={{ __html: HERO_ART }} />
        <p className="k">{txt.home_eyebrow}</p>
        <h1>Live lessons.<br />Real teachers.<br /><span>From home.</span></h1>
        <p>{txt.home_lead}</p>
        <div className="btns"><Link className="btn btn-accent" href="/taster">Book a free taster →</Link><Link className="btn btn-ghost" href="/courses">See the courses</Link></div>
      </section>
      {live ? <Link className="bh-t bh-live" href={live.page_slug ? `/courses/${live.page_slug}` : "/timetable"}><p className="k">Live now</p><div><b>{live.level} {live.subject}</b><span>{lessonLine(live)}</span></div></Link>
        : next ? <Link className="bh-t bh-next" href={next.page_slug ? `/courses/${next.page_slug}` : "/timetable"}><p className="k">Next lesson · {dayLabel(next.date)}</p><div><b>{next.level} {next.subject}</b><span>{lessonLine(next)}</span></div></Link>
        : <Link className="bh-t bh-next" href="/timetable"><p className="k">Timetable</p><div><b>See when lessons run</b><span>Weekly classes across six terms</span></div></Link>}
      <Link className="bh-t bh-pop" href="/taster"><p className="k">Free taster</p><b>Try a real lesson this week →</b></Link>
      <Link className="bh-t" href="/pricing"><p className="k">{from ? `${from.level} from` : "Prices"}</p><p className="v">{from ? from.per : "£"}<small>{from ? " a lesson" : ""}</small></p><span className="go">Price calculator →</span></Link>
      <Link className="bh-t" href="/teachers"><p className="k">Specialist teachers</p>
        <div className="bh-faces">{teachers.slice(0, 6).map((t, i) => <span key={t.slug} style={{ background: COLOURS[i % COLOURS.length] }}>{t.photo
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={t.photo} alt={t.name} /> : t.name.slice(0, 1)}</span>)}</div>
        <span className="go">Meet the team →</span></Link>
      {show.length > 0 && <section className="bh-t bh-wide">
        <div className="bh-head"><h2>Courses with space</h2><Link className="go" href="/courses">All courses →</Link></div>
        <div className="bh-courses">{show.map((c) => <Link key={c.code} className="bh-course" href={`/courses/${c.page_slug}`} style={{ ["--c" as string]: c.colour }}>
          <span className="lv"><i />{c.level}</span><b>{c.subject}</b>
          <span>{c.slots?.length ? c.slots.map((x) => `${DAYS[x.d]} ${x.t}`).join(" & ") : "Times to be announced"}{c.places_left != null ? ` · ${c.places_left <= 2 ? `last ${c.places_left}` : c.places_left} place${c.places_left === 1 ? "" : "s"}` : ""}</span></Link>)}</div>
      </section>}
      <section className="bh-t bh-half bh-how"><h2 style={{ margin: 0, fontSize: 24 }}>How it works</h2>
        <p>Book online and pay by term or in instalments. Your child gets a Google Classroom invitation, joins lessons live in Google Meet, and finds every recording in Classroom afterwards. You see attendance, work and reports in your account.</p></section>
      <section className="bh-t bh-half bh-facts">
        <div><p className="n">98%</p><p className="l">GCSE pass rate</p></div>
        <div><p className="n">{classes || 18}</p><p className="l">classes this year</p></div>
        <div><p className="n sky">Free</p><p className="l">taster lessons</p></div>
      </section>
    </div>
    <MeetHead title={txt.head_title} text={txt.head_text} photo />
    <Reviews rating={txt.reviews_rating} count={txt.reviews_count} url={txt.reviews_url} widget={txt.reviews_widget.replace(/[^\w-]/g, "")} />
    <MemberOf />
  </div>;
}
