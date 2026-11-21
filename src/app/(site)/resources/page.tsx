import type { Metadata } from "next";
import Link from "@/app/(site)/HoverLink";
import { getResources, groupBySubject, subjectAnchor, RES_KINDS, ALL_SUBJECTS } from "@/lib/resources";
import { siteInfo } from "@/lib/db";
import { roundelSrc, roundelFace } from "../CourseCard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Resources", description: "Useful resources for learning at home, recommended by our teachers: documentaries, websites, podcasts and books for each subject." };

// Resources (21 Nov): useful resources for each subject, for families supporting learning at home. In the website menu.
// One section per subject (its own address, e.g. /resources#geography), with the subject's roundel; "All subjects" last.
// Managed in Admin → Website → Resources.
export default async function Resources() {
  const [list, site] = await Promise.all([getResources(), siteInfo()]);
  const groups = groupBySubject(list);
  return (<>
    <section className="s-phead"><div className="wrap"><h1>Resources</h1><p>Ideas from our teachers for learning at home alongside lessons: things to watch, read and explore for each subject.</p></div></section>
    {groups.length > 1 && <div className="ph-sticky"><nav className="tabs ph-tabs rs-jump" aria-label="Jump to a subject">
      {groups.map(([s]) => <a key={s} href={`#${subjectAnchor(s)}`}>{s}</a>)}</nav></div>}
    <section className="s-sec"><div className="wrap rs-wrap">
      {groups.length === 0 && <p className="gd-soon">Coming soon.</p>}
      {groups.map(([subject, items]) => { const face = subject === ALL_SUBJECTS ? null : roundelFace(subject);
        return <section key={subject} id={subjectAnchor(subject)} className="rs-sec" style={face ? { ["--c" as string]: face.bg } : undefined}>
          <div className="rs-head">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="rs-rd" src={roundelSrc(face ? subject : "", site.demo)} alt="" width={64} height={64} aria-hidden="true" />
            <h2>{subject}</h2></div>
          <div className="rs-grid">{items.map((r) => { const k = RES_KINDS.find((x) => x.id === r.kind) ?? RES_KINDS[0];
            const body = <><span className="gd-k">{k.label}</span><h3>{r.title}</h3>{r.description && <p>{r.description}</p>}</>;
            return r.url
              ? <a key={r.id} className="gd-card rs-card" href={r.url} target="_blank" rel="noopener">{body}<span className="gd-go">{k.action} <span aria-hidden="true">→</span><span className="sr-only"> (opens in a new tab)</span></span></a>
              : <div key={r.id} className="gd-card rs-card rs-tip">{body}</div>; })}</div>
        </section>; })}
      <div className="rs-ask"><p><b>Looking for something else?</b> Your child’s teachers are always happy to recommend more, including textbooks for their course. Just email them, or <Link href="/contact">get in touch</Link>.</p></div>
    </div></section>
  </>);
}
