import Link from "next/link";
import { notFound } from "next/navigation";
import { getJob, listApplications, APP_STATUSES } from "@/lib/jobs";
import { saveJobAction, deleteJobAction } from "../../../actions";

const d = (s: string) => new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default async function JobEdit({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const job = await getJob(id); if (!job) notFound();
  const apps = await listApplications(id);
  return <>
    <div className="top"><div><p className="sub"><Link href="/admin/jobs">← Jobs</Link></p><h1>{job.title}</h1></div><span className="grow" />{job.status !== "draft" && <a className="abtn sm" href={`/jobs/${job.slug}`} target="_blank" rel="noreferrer">View on the website</a>}</div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg err">{sp.err}</p>}
    <h2 className="h2">Applications ({apps.length})</h2>
    <div className="tw"><table><thead><tr><th>Applicant</th><th>Received</th><th>Status</th><th></th></tr></thead><tbody>
      {apps.length === 0 && <tr><td colSpan={4} className="muted">No applications yet.</td></tr>}
      {apps.map((a) => <tr key={a.id}><td><b>{a.name}</b><div className="muted">{a.email} · {a.subjects}</div></td><td>{d(a.created_at)}</td>
        <td>{APP_STATUSES.find(([k]) => k === a.status)?.[1]}</td><td><Link className="abtn sm" href={`/admin/jobs/application/${a.id}`}>Open</Link></td></tr>)}
    </tbody></table></div>
    <form action={saveJobAction} className="card" style={{ display: "grid", gap: 12 }}>
      <h2>Vacancy details</h2>
      <input type="hidden" name="id" value={job.id} />
      <div className="eform">
        <label className="fld">Status<select name="status" defaultValue={job.status}><option value="draft">Draft (hidden)</option><option value="open">Open (taking applications)</option><option value="closed">Closed</option></select></label>
        <label className="fld">Closing date<input type="date" name="closes_on" defaultValue={job.closes_on ?? ""} /></label>
      </div>
      <label className="fld">Job title<input name="title" required maxLength={160} defaultValue={job.title} style={{ maxWidth: 560 }} /></label>
      <div className="eform">
        <label className="fld">Subjects<input name="subjects" maxLength={200} defaultValue={job.subjects} placeholder="e.g. Maths, KS3–GCSE" style={{ width: 260 }} /></label>
        <label className="fld">Location<input name="location" maxLength={120} defaultValue={job.location} style={{ width: 220 }} /></label>
        <label className="fld">Hours<input name="hours" maxLength={120} defaultValue={job.hours} placeholder="e.g. Part-time, 6 hours a week" style={{ width: 240 }} /></label>
        <label className="fld">Pay<input name="pay" maxLength={120} defaultValue={job.pay} placeholder="e.g. £30 per lesson" style={{ width: 200 }} /></label>
      </div>
      <label className="fld">Short summary (shown on the jobs list)<textarea name="summary" rows={2} maxLength={400} defaultValue={job.summary} className="mini" style={{ width: "100%" }} /></label>
      <label className="fld">Full description <span className="muted" style={{ fontWeight: 400 }}>Lines starting “- ” become bullet points; “## ” makes a sub-heading.</span>
        <textarea name="description" rows={16} maxLength={12000} defaultValue={job.description} className="mini" style={{ width: "100%" }} placeholder={"About the role\n\n## What you'll do\n- Teach small live online classes\n\n## What we're looking for\n- A PGCE and recent secondary teaching experience"} /></label>
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>The website always adds the application rules: evidence of a PGCE and two referees.</p>
      <div><button className="abtn pri" type="submit">Save</button></div>
    </form>
    <form action={deleteJobAction} className="card eform"><input type="hidden" name="id" value={job.id} />
      <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" name="confirm" required /> Delete this vacancy{apps.length ? ` and its ${apps.length} application${apps.length === 1 ? "" : "s"}` : ""}</label>
      <button className="abtn sm" type="submit">Delete</button><span className="muted" style={{ fontSize: 14 }}>To stop applications but keep them, set the status to Closed instead.</span></form>
  </>;
}
