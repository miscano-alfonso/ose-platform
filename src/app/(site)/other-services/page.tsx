import type { Metadata } from "next";
import Link from "@/app/(site)/HoverLink";
import { getWorkshops, type Workshop } from "@/lib/data";
import { money } from "@/lib/format";
import { MARKING_PRICE_PENCE } from "./past-paper-marking/subjects";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "More", description: "One-off workshops and past paper marking with written feedback, open to every family." };

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: "Europe/London" }).replace(" at ", " · ");
const TAGS = [["all", "All"], ["workshops", "Workshops"], ["marking", "Past paper marking"]] as const;

// The "More" page (Other services): one card per thing on offer, each with its tag. Workshops come from Admin → Workshops
// (title, words, date, price, picture and card size: single = one column, double = two columns with the picture beside the words).
export default async function More({ searchParams }: { searchParams: Promise<{ tag?: string }> }) {
  const sp = await searchParams;
  const tag = TAGS.some(([k]) => k === sp.tag) ? sp.tag! : "all";
  const workshops = await getWorkshops();
  const showW = tag !== "marking", showM = tag !== "workshops";
  return (<>
    <section className="s-phead"><div className="wrap"><h1>More</h1><p>Live one-off workshops and exam paper marking, open to every family.</p></div></section>
    <div className="ph-sticky"><nav className="tabs ph-tabs" aria-label="Show">{TAGS.map(([k, l]) =>
        <Link key={k} href={k === "all" ? "/other-services" : `/other-services?tag=${k}`} scroll={false} className={k === tag ? "on" : ""} aria-current={k === tag ? "page" : undefined}>{l}</Link>)}</nav></div>
    <section className="s-sec"><div className="wrap">
      <div className="mgrid">
        {showM && <article className="mcard">
          <div className="mc-body">
            <p className="mc-tags"><span className="mc-tag t-mark">Past paper marking</span></p>
            <h2>Past Paper Marking</h2>
            <p className="mc-sub">iGCSE English Language and Literature · all exam boards</p>
            <p>Papers are returned within 48 hours of receipt, with detailed feedback in line with the mark scheme and targets for improvement.</p>
            <div className="mc-foot"><p className="mc-price">{money(MARKING_PRICE_PENCE)}<small> a paper</small></p>
              <Link className="btn btn-brand" href="/other-services/past-paper-marking">Send a paper</Link></div>
          </div></article>}
        {showW && workshops.map((w) => <WorkshopCard key={w.slug} w={w} />)}
      </div>
      {showW && workshops.length === 0 && <p className="empty" style={{ marginTop: 20 }}>There are no workshops booked in at the moment. Check back soon, or <Link href="/contact">ask us</Link> to let you know when the next one opens.</p>}
    </div></section>
  </>);
}

function WorkshopCard({ w }: { w: Workshop }) {
  const dbl = w.card_size === "double" && !!w.image;
  const full = w.places_left === 0;
  return <article className={`mcard${dbl ? " dbl" : ""}`} style={w.colour ? { ["--c" as string]: w.colour } : undefined}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {w.image && <div className="mc-pic"><img src={w.image} alt="" loading="lazy" width={1280} height={720} /></div>}
    <div className="mc-body">
      <p className="mc-tags"><span className="mc-tag t-work">Workshop</span>{w.level && <span className="mc-tag">{w.level}</span>}{w.subject && <span className="mc-tag">{w.subject}</span>}
        {w.places_left !== null && w.places_left <= 3 && <span className="mc-tag t-few">{full ? "Full" : "Few places left"}</span>}</p>
      <h2><Link className="mc-link" href={`/other-services/workshop/${w.slug}`}>{w.title}</Link></h2>
      <p className="mc-sub">{when(w.starts_at)} · {w.minutes} minutes{w.teacher ? ` · ${w.teacher}` : ""}</p>
      {w.summary && <p>{w.summary}</p>}
      <div className="mc-foot"><p className="mc-price">{w.price_pence === 0 ? "Free" : money(w.price_pence)}
        {w.enrolled_price_pence !== null && w.enrolled_price_pence < w.price_pence && <small> · {w.enrolled_price_pence === 0 ? "free" : money(w.enrolled_price_pence)} for our students</small>}</p>
        {full ? <span className="btn btn-line" aria-disabled="true">Full</span> : <Link className="btn btn-brand" href={`/other-services/workshop/${w.slug}`}>Book now</Link>}</div>
    </div></article>;
}
