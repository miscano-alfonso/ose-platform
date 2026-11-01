import type { Metadata } from "next";
import Link from "@/app/(site)/HoverLink";
import { getTeachers } from "@/lib/data";
import { sitePeople } from "@/lib/people";
import { siteText } from "@/lib/site-content";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "People", description: "Meet the people at OH-SO ED: experienced secondary subject specialists teaching live online lessons, and the team behind them." };

// People (1 Nov, was Teachers): the teachers, each with a profile page, and the other people at the school (name, role and
// photo, no profile page), in the order set in Admin → Teachers.
export default async function People() {
  const [ts, others, txt] = await Promise.all([getTeachers(), sitePeople(), siteText()]);
  type Card = { key: string; name: string; role: string | null; photo: string | null; subjects: string[] | null; href: string | null; order: number; other: number };
  const cards: Card[] = [
    ...ts.map((t, i) => ({ key: `t-${t.slug}`, name: t.name, role: t.designation, photo: t.photo, subjects: t.subjects ?? null, href: `/teachers/${t.slug}`, order: t.sort_order ?? i, other: 0 })),
    ...others.map((p) => ({ key: `p-${p.id}`, name: p.name, role: p.role, photo: p.photo, subjects: null, href: null, order: p.sort_order, other: 1 })),
  ].sort((a, b) => a.order - b.order || a.other - b.other);
  const face = (c: Card) => <>
    {c.photo
      // eslint-disable-next-line @next/next/no-img-element
      ? <img className="tphoto" src={c.photo} alt="" width={640} height={480} loading="lazy" />
      : <div className="tav" aria-hidden="true">{c.name.split(" ").map((p) => p[0]).join("")}</div>}
    <h2>{c.name}</h2>{c.role && <p className="role">{c.role}</p>}{c.subjects?.length ? <p className="subs">{c.subjects.join(" · ")}</p> : null}</>;
  return (<>
    <section className="s-phead"><div className="wrap"><h1>Our People</h1><p>{txt.teachers_intro}</p></div></section>
    <section className="s-sec"><div className="wrap"><div className="tgrid tcols" style={{ ["--cols" as string]: Math.min(Math.max(cards.length, 1), 5) }}>{cards.map((c) => c.href
      ? <Link className="tcard tlink" key={c.key} href={c.href}>{face(c)}<span className="tmore">Read more →</span></Link>
      : <div className="tcard" key={c.key}>{face(c)}</div>)}</div>
      <div className="tjoin-tile"><div><p className="k">Join our team</p><h2>{txt.teach_title}</h2>{txt.teach_text && <p>{txt.teach_text}</p>}</div>
        <Link className="btn btn-brand" href="/jobs">{txt.teach_button} →</Link></div></div></section>
  </>);
}
