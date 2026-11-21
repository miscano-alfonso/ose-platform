import Link from "next/link";
import { getResources, resourcesForCourses, subjectAnchor, RES_KINDS, ALL_SUBJECTS, type CourseRef } from "@/lib/resources";
import { roundelSrc } from "@/app/(site)/CourseCard";
import { siteInfo } from "@/lib/db";
import { Head } from "./fmt";

// Resources on the parent and student dashboards (21 Nov): the website's Resources (Admin → Website → Resources),
// opening on the subjects of the courses the family is booked on, with an "Other subjects" tab for the rest.
export async function ResourcesView({ base, tab, courses, forParent }: { base: string; tab?: string; courses: CourseRef[]; forParent: boolean }) {
  const [list, site] = await Promise.all([getResources(), siteInfo()]);
  const { mine, others } = resourcesForCourses(list, courses);
  const showOthers = tab === "others";
  const groups = showOthers ? others : mine;
  return <>
    <Head title="Resources" sub={forParent ? "Ideas from the teachers for learning at home alongside lessons: things to watch, read and explore." : "Ideas from your teachers for learning alongside your lessons: things to watch, read and explore."} />
    <nav className="tabs rs-tabs" aria-label="Which subjects">
      <Link href={base} aria-current={!showOthers ? "page" : undefined} className={`abtn sm${!showOthers ? " pri" : ""}`}>{forParent ? "Your children’s subjects" : "Your subjects"}</Link>
      {others.length > 0 && <Link href={`${base}?tab=others`} aria-current={showOthers ? "page" : undefined} className={`abtn sm${showOthers ? " pri" : ""}`}>Other subjects</Link>}
    </nav>
    {!showOthers && courses.length === 0 && <p className="empty">{forParent ? "Once your children are booked on a course, the resources for their subjects show here." : "Once you’re booked on a course, the resources for your subjects show here."}{others.length > 0 && <> Meanwhile, have a look at <Link href={`${base}?tab=others`}>other subjects</Link>.</>}</p>}
    {!showOthers && courses.length > 0 && groups.length === 0 && <p className="empty">The teachers haven’t added resources for {forParent ? "your children’s" : "your"} subjects yet.</p>}
    {groups.map((g) => <section key={g.subject} id={subjectAnchor(g.subject)} className="card rs-dsec">
      <div className="rs-dhead">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={roundelSrc(g.subject === ALL_SUBJECTS ? "" : g.subject, site.demo)} alt="" width={44} height={44} aria-hidden="true" />
        <div><h2>{g.subject}</h2>{g.courses.length > 0 && <p className="note">{[...new Set(g.courses.map((c) => `${c.who ? c.who + " · " : ""}${c.level} ${c.subject}`))].join(" · ")}</p>}
          {g.subject === ALL_SUBJECTS && <p className="note">Useful for every subject</p>}</div>
      </div>
      <div className="rs-dgrid">{g.items.map((r) => { const k = RES_KINDS.find((x) => x.id === r.kind) ?? RES_KINDS[0];
        const body = <><span className={`pill ${r.kind === "tip" ? "good" : "mute"}`}>{k.label}</span><b className="rs-dt">{r.title}</b>{r.description && <span className="rs-dd">{r.description}</span>}</>;
        return r.url
          ? <a key={r.id} className="rs-ditem" href={r.url} target="_blank" rel="noopener">{body}<span className="rs-dgo">{k.action} <span aria-hidden="true">→</span><span className="sr-only"> (opens in a new tab)</span></span></a>
          : <div key={r.id} className="rs-ditem rs-dtip">{body}</div>; })}</div>
    </section>)}
  </>;
}
