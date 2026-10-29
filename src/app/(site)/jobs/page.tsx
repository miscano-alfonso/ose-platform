import type { Metadata } from "next";
import Link from "@/app/(site)/HoverLink";
import { listOpenJobs } from "@/lib/jobs";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Jobs", description: "Teaching vacancies at OH-SO ED, an online school for home-educated students." };

const date = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export default async function Jobs() {
  const jobs = await listOpenJobs();
  return <>
    <section className="s-phead"><div className="wrap"><p className="eyebrow">Join our team</p><h1>Jobs</h1>
      <p>We’re a small online school for home-educated students. Our teachers are experienced secondary subject specialists who teach small live classes from home.</p></div></section>
    <section className="s-sec"><div className="wrap jobs">
      <div className="job-req" role="note"><h2>Before you apply</h2>
        <p>Every application needs both of these. Applications without them can’t be considered.</p>
        <ul><li><b>Evidence of your PGCE</b> (or equivalent teaching qualification): a scan or photo of your certificate.</li>
          <li><b>At least two referees</b>, one of them your current or most recent employer.</li></ul>
        <p className="muted">All appointments are subject to an enhanced DBS check and our safer recruitment checks.</p></div>
      {jobs.length === 0 ? <div className="notice"><h2>No vacancies right now</h2><p>We don’t have any open roles at the moment. Please check back soon, or <Link href="/contact">get in touch</Link>.</p></div> :
        <div className="job-list">{jobs.map((j) => <Link key={j.id} href={`/jobs/${j.slug}`} className="job-card">
          <h2>{j.title}</h2>
          {j.summary && <p>{j.summary}</p>}
          <ul className="job-facts">{[j.subjects, j.location, j.hours, j.pay].filter(Boolean).map((f) => <li key={f}>{f}</li>)}</ul>
          <span className="job-more">{j.closes_on ? `Apply by ${date(j.closes_on)}` : "Apply now"} →</span>
        </Link>)}</div>}
    </div></section>
  </>;
}
