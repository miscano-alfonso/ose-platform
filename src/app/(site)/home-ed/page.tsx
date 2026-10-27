import type { Metadata } from "next";
import Link from "next/link";
import { getHub, grouped, youtubeId, type HubLink, type HubSection } from "@/lib/hub";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "New to Home Ed?",
  description: "A hub of trusted resources for families new to home education: taking your child out of school, exams and exam centres, Google Classroom videos, days out by region and support groups.",
};

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const anchor = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const Out = () => <span aria-hidden="true" className="hub-out">↗</span>;

function LinkCard({ l }: { l: HubLink }) {
  return <a className="hub-card" href={l.url} target="_blank" rel="noopener noreferrer">
    <b>{l.title}<Out /></b>
    {l.description && <span>{l.description}</span>}
    <small>{host(l.url)}<span className="sr-only"> (opens in a new tab)</span></small>
  </a>;
}

function Video({ l }: { l: HubLink }) {
  const id = youtubeId(l.url);
  return <a className="hub-video" href={l.url} target="_blank" rel="noopener noreferrer">
    <span className="hub-thumb">{id && <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" loading="lazy" width={480} height={360} />}<i aria-hidden="true">▶</i></span>
    <b>{l.title}</b>
    {l.description && <small>{l.description} · YouTube<span className="sr-only"> (opens in a new tab)</span></small>}
  </a>;
}

function Dates({ items }: { items: HubLink[] }) {
  return <ol className="hub-dates">{items.map((l) => <li key={l.id}>
    <b>{l.title}</b>
    <span>{l.description}{l.url && <> <a href={l.url} target="_blank" rel="noopener noreferrer">Source<span className="sr-only"> (opens in a new tab)</span></a></>}</span>
  </li>)}</ol>;
}

function Group({ name, items }: { name: string; items: HubLink[] }) {
  const dates = items.filter((l) => l.kind === "date"), videos = items.filter((l) => l.kind === "video"), links = items.filter((l) => l.kind === "link");
  return <div className="hub-grp" id={name ? anchor(name) : undefined}>
    {name && <h3>{name}</h3>}
    {dates.length > 0 && <Dates items={dates} />}
    {videos.length > 0 && <div className="hub-vgrid">{videos.map((l) => <Video key={l.id} l={l} />)}</div>}
    {links.length > 0 && <div className="hub-grid">{links.map((l) => <LinkCard key={l.id} l={l} />)}</div>}
  </div>;
}

function Section({ s, alt }: { s: HubSection; alt: boolean }) {
  const groups = grouped(s.links);
  const named = groups.filter(([g]) => g);
  return <section className={`s-sec hub-sec${alt ? " alt" : ""}`} id={s.slug} aria-labelledby={`h-${s.slug}`}><div className="wrap">
    <h2 id={`h-${s.slug}`}>{s.title}</h2>
    {s.intro && <p className="hub-intro">{s.intro}</p>}
    {named.length > 3 && <nav className="hub-chips" aria-label={`${s.title}: jump to`}>{named.map(([g]) => <a key={g} href={`#${anchor(g)}`}>{g}</a>)}</nav>}
    {groups.map(([g, items]) => <Group key={g || "_"} name={g} items={items} />)}
  </div></section>;
}

export default async function HomeEd() {
  const hub = await getHub();
  return <>
    <section className="s-phead"><div className="wrap">
      <p className="eyebrow">Resource hub</p>
      <h1>New to Home Ed?</h1>
      <p>Trusted links to help parents and students find their feet: taking your child out of school, booking exams, getting started with Google Classroom, days out near you, and where to find support.</p>
      {hub.length > 0 && <nav className="hub-jump" aria-label="On this page">{hub.map((s) => <a key={s.id} href={`#${s.slug}`}>{s.title}</a>)}</nav>}
    </div></section>
    {hub.map((s, i) => <Section key={s.id} s={s} alt={i % 2 === 1} />)}
    <section className="s-sec"><div className="wrap hub-end">
      <h2>Questions about starting with us?</h2>
      <p>We teach KS3, pre-GCSE and GCSE courses online for home-educated students. Try a free taster lesson or ask us anything.</p>
      <div className="btns"><Link className="btn btn-brand" href="/taster">Book a taster</Link><Link className="btn btn-ghost hub-ghost" href="/courses">See our courses</Link></div>
      <p className="hub-note">These links go to other organisations’ websites, which we don’t control. Dates and rules change, so always check with the organisation, your exam centre or your council. This page is general information, not legal advice.</p>
    </div></section>
  </>;
}
