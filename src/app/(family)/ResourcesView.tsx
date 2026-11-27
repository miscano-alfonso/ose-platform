import Link from "next/link";
import { getResources, resourcesForCourses, subjectAnchor, RES_KINDS, ALL_SUBJECTS, type CourseRef } from "@/lib/resources";
import { roundelSrc } from "@/app/(site)/CourseCard";
import { siteInfo } from "@/lib/db";
import { Head } from "./fmt";
import { getHub, grouped } from "@/lib/hub";
import { familyLocation, groupFits, COUNTRIES, ENGLAND_REGIONS } from "@/lib/family-location";
import { LocationPicker } from "./LocationPicker";
import { setFamilyLocationAction } from "./actions";
import { importantDates, examPartner, whenOf, DATE_KINDS } from "@/lib/important-dates";

// Resources on the parent and student dashboards (21 Nov): the website's Resources (Admin → Website → Resources),
// opening on the subjects of the courses the family is booked on, with an "Other subjects" tab for the rest.
// 27 Nov: teachers see the same page (their own subjects first), with their suggestion form and suggestions in `children`.
export async function ResourcesView({ base, tab, courses, forParent, teacher, tools, children, familyId, viewer }: { familyId?: string; viewer?: boolean; base: string; tab?: string; courses: CourseRef[]; forParent: boolean; teacher?: boolean; tools?: React.ReactNode; children?: React.ReactNode }) {
  const [list, site] = await Promise.all([getResources(), siteInfo()]);
  const { mine, others } = resourcesForCourses(list, courses);
  const showOthers = tab === "others";
  // 27 Nov (Alfonso): families also get Information (the website's New to Home Ed hub) and Important dates (exams)
  const extra = !teacher && (tab === "info" || tab === "dates") ? tab : null;
  const groups = extra ? [] : showOthers ? others : mine;
  const on = (k: string | null) => (k === null ? !showOthers && !extra : k === "others" ? showOthers : extra === k);
  return <>
    <Head title="Resources" sub={teacher ? "The ideas for learning at home that parents and students see on their dashboards and the website. Suggest your favourites for your subjects and the office will add them." : forParent ? "Ideas from the teachers for learning at home alongside lessons: things to watch, read and explore." : "Ideas from your teachers for learning alongside your lessons: things to watch, read and explore."} >{tools}</Head>
    <nav className="tabs rs-tabs" aria-label="Resources">
      <Link href={base} aria-current={on(null) ? "page" : undefined} className={`abtn sm${on(null) ? " pri" : ""}`}>{teacher ? "Your subjects" : forParent ? "Your children’s subjects" : "Your subjects"}</Link>
      {others.length > 0 && <Link href={`${base}?tab=others`} aria-current={on("others") ? "page" : undefined} className={`abtn sm${on("others") ? " pri" : ""}`}>Other subjects</Link>}
      {!teacher && <><Link href={`${base}?tab=info`} aria-current={on("info") ? "page" : undefined} className={`abtn sm${on("info") ? " pri" : ""}`}>Information</Link>
        <Link href={`${base}?tab=dates`} aria-current={on("dates") ? "page" : undefined} className={`abtn sm${on("dates") ? " pri" : ""}`}>Important dates</Link></>}
    </nav>
    {children}
    {extra === "info" && await InfoTab({ base, familyId, viewer })}
    {extra === "dates" && await DatesTab({ forParent })}
    {!showOthers && !extra && courses.length === 0 && <p className="empty">{teacher ? "Once you have classes this year, the resources for your subjects show here." : forParent ? "Once your children are booked on a course, the resources for their subjects show here." : "Once you’re booked on a course, the resources for your subjects show here."}{others.length > 0 && <> Meanwhile, have a look at <Link href={`${base}?tab=others`}>other subjects</Link>.</>}</p>}
    {!showOthers && !extra && courses.length > 0 && groups.length === 0 && <p className="empty">{teacher ? "There are no resources for your subjects yet: suggest some above." : <>The teachers haven’t added resources for {forParent ? "your children’s" : "your"} subjects yet.</>}</p>}
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

/** 27 Nov: Information: the website's "New to Home Ed?" hub (Admin → Home Ed hub), without its dates (see Important dates). */
async function InfoTab({ base, familyId, viewer }: { base: string; familyId?: string; viewer?: boolean }) {
  const place = familyId ? await familyLocation(familyId) : null;
  // 27 Nov (Alfonso): only the links for where the family lives (groups named after another country or region are left out)
  const hub = (await getHub()).map((sec) => ({ ...sec, links: sec.links.filter((l) => l.kind !== "date" && groupFits(l.grp, place)) })).filter((sec) => sec.links.length || sec.intro);
  const picker = familyId ? <LocationPicker action={setFamilyLocationAction} back={base} place={place} countries={COUNTRIES} regions={ENGLAND_REGIONS} readOnly={viewer} /> : null;
  if (!hub.length) return <>{picker}<p className="empty">Information for home-educating families is coming soon.</p></>;
  return <>{picker}{hub.map((sec) => <section key={sec.id} className="card rs-dsec" id={sec.slug}>
    <h2 style={{ margin: "0 0 6px" }}>{sec.title}</h2>{sec.intro && <p className="cs" style={{ marginTop: 0 }}>{sec.intro}</p>}
    {grouped(sec.links).map(([grp, links]) => <div key={grp} className="rs-igrp">{grp && <h3>{grp}</h3>}
      <div className="rs-dgrid">{links.map((l) => <a key={l.id} className="rs-ditem" href={l.url} target="_blank" rel="noopener">
        <span className={`pill ${l.kind === "video" ? "info" : "mute"}`}>{l.kind === "video" ? "Video" : "Website"}</span><b className="rs-dt">{l.title}</b>{l.description && <span className="rs-dd">{l.description}</span>}
        <span className="rs-dgo">{l.kind === "video" ? "Watch" : "Open"} <span aria-hidden="true">→</span><span className="sr-only"> (opens in a new tab)</span></span></a>)}</div></div>)}
  </section>)}<p className="note">These links go to other organisations’ websites. Dates and rules change, so always check with the organisation, your exam centre or your council.</p></>;
}

/** 27 Nov: Important dates: booking exams with the school's exam partner (with the partner code), then every date in order. */
async function DatesTab({ forParent }: { forParent: boolean }) {
  const [dates, p] = await Promise.all([importantDates(), examPartner()]);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const days = (d: string) => Math.round((Date.parse(d + "T12:00:00Z") - Date.parse(today + "T12:00:00Z")) / 864e5);
  const nextBook = dates.find((d) => d.kind === "book" && d.starts_on && d.starts_on >= today);
  return <>
    <section className="card rs-exam"><div><h2 style={{ margin: "0 0 6px" }}>Booking exams</h2>
      <p className="cs" style={{ margin: 0 }}>Home-educated students sit their GCSEs and iGCSEs as private candidates. {forParent ? "You book" : "Your parent books"} them with our exam partner, <b>{p.name}</b>{nextBook ? <>: the next deadline is <b>{whenOf(nextBook)}</b> ({days(nextBook.starts_on!) === 0 ? "today" : `in ${days(nextBook.starts_on!)} days`}).</> : "."}</p>
      {p.code && <p className="rs-code">Our partner code: <b>{p.code}</b>{p.note ? <span className="muted"> · {p.note}</span> : <span className="muted"> · enter it when you book</span>}</p>}</div>
      {p.booking && <a className="abtn pri" href={p.booking} target="_blank" rel="noopener">Book exams with {p.name} <span aria-hidden="true">↗</span></a>}</section>
    {dates.length === 0 ? <p className="empty">No dates yet.</p> : <section className="card"><ol className="rs-dates">{dates.map((d) => { const past = (d.ends_on ?? d.starts_on ?? "9999") < today;
      const soon = d.starts_on && !past && d.kind === "book" ? days(d.starts_on) : null;
      return <li key={d.id} className={past ? "past" : ""}><span className="rs-when">{whenOf(d)}</span>
        <div><b>{d.title}</b> <span className={`pill ${d.kind === "book" ? "warn" : d.kind === "exam" ? "info" : d.kind === "results" ? "good" : "mute"}`}>{DATE_KINDS.find((k) => k.id === d.kind)?.label}</span>
          {soon != null && soon >= 0 && soon <= 60 && <span className="pill bad">{soon === 0 ? "Today" : `In ${soon} days`}</span>}{past && <span className="muted"> · Passed</span>}
          {d.details && <p>{d.details}</p>}{d.link && <a href={d.link} target="_blank" rel="noopener">More details ↗</a>}</div></li>; })}</ol></section>}
  </>;
}
