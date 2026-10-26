import Link from "next/link";
import { listJobsAdmin, listApplications, getAlertEmail, APP_STATUSES } from "@/lib/jobs";
import { emailReady } from "@/lib/email";
import { createJobAction, saveAlertEmailAction } from "../../actions";

const d = (s: string) => new Date(s.length > 10 ? s : s + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const STATUS: Record<string, string> = { draft: "Draft", open: "Open", closed: "Closed" };

export default async function JobsAdmin({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const [jobs, apps, alert] = await Promise.all([listJobsAdmin(), listApplications(), getAlertEmail()]);
  return <>
    <div className="top"><div><h1>Jobs</h1><div className="sub">Vacancies on the website and teacher applications. Applicants must upload PGCE evidence and give two referees.</div></div><span className="grow" /><a className="abtn sm" href="/jobs" target="_blank" rel="noreferrer">View the jobs page</a></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg err">{sp.err}</p>}
    <h2 className="h2">Vacancies</h2>
    <div className="tw"><table><thead><tr><th>Job</th><th>Status</th><th>Closes</th><th>Applications</th><th></th></tr></thead><tbody>
      {jobs.length === 0 && <tr><td colSpan={5} className="muted">No vacancies yet. Add one below.</td></tr>}
      {jobs.map((j) => <tr key={j.id}><td><b>{j.title}</b>{j.subjects && <div className="muted">{j.subjects}</div>}</td>
        <td><span className={`pill ${j.is_open ? "good" : j.status === "draft" ? "mute" : "warn"}`}>{j.status === "open" && !j.is_open ? "Closed (date passed)" : STATUS[j.status]}</span></td>
        <td>{j.closes_on ? d(j.closes_on) : <span className="muted">No date</span>}</td>
        <td>{j.apps}{j.new_apps > 0 && <> <span className="pill warn">{j.new_apps} new</span></>}</td>
        <td><div className="acts"><Link className="abtn sm" href={`/admin/jobs/${j.id}`}>Edit and applications</Link>{j.status !== "draft" && <a className="abtn sm" href={`/jobs/${j.slug}`} target="_blank" rel="noreferrer">View</a>}</div></td></tr>)}
    </tbody></table></div>
    <form action={createJobAction} className="card eform"><label className="fld">New vacancy title<input name="title" required maxLength={160} placeholder="e.g. GCSE Maths Teacher (part-time)" style={{ width: 360 }} /></label><button className="abtn pri" type="submit">Add vacancy</button><span className="muted" style={{ fontSize: 14 }}>It starts as a draft, so nobody sees it until you open it.</span></form>

    <h2 className="h2">Latest applications</h2>
    <div className="tw"><table><thead><tr><th>Applicant</th><th>Job</th><th>Received</th><th>Status</th><th></th></tr></thead><tbody>
      {apps.length === 0 && <tr><td colSpan={5} className="muted">No applications yet.</td></tr>}
      {apps.slice(0, 30).map((a) => <tr key={a.id}><td><b>{a.name}</b><div className="muted">{a.subjects}</div></td><td>{a.job_title}</td><td>{d(a.created_at)}</td>
        <td><span className={`pill ${a.status === "new" ? "warn" : a.status === "rejected" || a.status === "withdrawn" ? "mute" : "good"}`}>{APP_STATUSES.find(([k]) => k === a.status)?.[1]}</span></td>
        <td><Link className="abtn sm" href={`/admin/jobs/application/${a.id}`}>Open</Link></td></tr>)}
    </tbody></table></div>

    <form action={saveAlertEmailAction} className="card" style={{ display: "grid", gap: 10 }}><h2>Application alerts</h2>
      <p className="muted" style={{ margin: 0 }}>When someone applies, a short email goes to this address with a link to the application. It never includes the applicant’s documents.{!(await emailReady()) && " Emails start once Brevo is connected (Admin → Newsletter)."}</p>
      <div className="eform"><label className="fld">Send alerts to<input name="email" type="email" maxLength={200} defaultValue={alert} placeholder="office@ohsoed.co.uk" style={{ width: 320 }} /></label><button className="abtn" type="submit">Save</button></div>
    </form>
  </>;
}
