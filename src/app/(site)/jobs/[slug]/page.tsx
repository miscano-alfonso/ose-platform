import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getJobBySlug, DBS } from "@/lib/jobs";
import { RichText } from "../../RichText";
import { ApplyForm } from "./ApplyForm";
import { applyAction } from "../actions";

export const dynamic = "force-dynamic";
const date = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const job = await getJobBySlug((await params).slug).catch(() => null);
  return job ? { title: `${job.title} | Jobs`, description: job.summary || `Apply for ${job.title} at OH-SO ED.` } : { title: "Jobs" };
}

export default async function JobPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ applied?: string; err?: string }> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const job = await getJobBySlug(slug);
  if (!job) notFound();
  const facts: [string, string][] = ([["Subjects", job.subjects], ["Location", job.location], ["Hours", job.hours], ["Pay", job.pay], ["Closing date", job.closes_on ? date(job.closes_on) : ""]] as [string, string][]).filter(([, v]) => v);
  return <>
    <section className="s-phead"><div className="wrap"><p className="eyebrow"><Link href="/jobs" className="crumb">Jobs</Link></p><h1>{job.title}</h1>{job.summary && <p>{job.summary}</p>}</div></section>
    <section className="s-sec"><div className="wrap job-page">
      <div className="job-body">
        {facts.length > 0 && <dl className="job-dl">{facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
        <div className="job-desc"><RichText text={job.description} /></div>
      </div>
      <div id="apply" className="job-apply">
        {sp.applied ? <div className="notice ok" role="status"><h2>Thank you for applying</h2><p>We’ve received your application for {job.title}. We’ll be in touch by email. We won’t contact your referees without telling you first.</p><p><Link href="/jobs">See other jobs</Link></p></div>
          : !job.is_open ? <div className="notice"><h2>This vacancy has closed</h2><p>We’re no longer taking applications for this role. <Link href="/jobs">See our current vacancies</Link>.</p></div>
          : <>
            <h2>Apply for this job</h2>
            <div className="job-req" role="note"><p><b>You’ll need:</b> evidence of your PGCE (or equivalent) to upload, and contact details for at least two referees. Applications without both can’t be considered.</p></div>
            {sp.err && <p className="notice err" role="alert">{sp.err}</p>}
            <ApplyForm action={applyAction} slug={job.slug} dbs={DBS} />
          </>}
      </div>
    </div></section>
  </>;
}
