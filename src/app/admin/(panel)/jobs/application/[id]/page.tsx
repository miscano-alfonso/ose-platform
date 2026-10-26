import Link from "next/link";
import { notFound } from "next/navigation";
import { getApplication, APP_STATUSES, DBS } from "@/lib/jobs";
import { saveApplicationAction, deleteApplicationAction } from "../../../../actions";

export default async function Application({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const a = await getApplication(id); if (!a) notFound();
  const row = (k: string, v: React.ReactNode) => <div><dt>{k}</dt><dd>{v}</dd></div>;
  return <>
    <div className="top"><div><p className="sub"><Link href={`/admin/jobs/${a.job_id}`}>← {a.job_title}</Link></p><h1>{a.name}</h1>
      <div className="sub">Applied {new Date(a.created_at).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" })}</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}
    <div className="appgrid">
      <section className="card"><h2>Details</h2><dl className="kv">
        {row("Email", <a href={`mailto:${a.email}`}>{a.email}</a>)}{row("Phone", a.phone)}{row("Based in", a.location)}{row("Can teach", a.subjects)}
        {row("PGCE", `${a.pgce_subject}, ${a.pgce_year}`)}
        {row("PGCE evidence", <a className="abtn sm" href={`/admin/jobs-file/${a.id}/pgce`}>Download {a.pgce_file_name}</a>)}
        {row("CV", a.cv_file_name ? <a className="abtn sm" href={`/admin/jobs-file/${a.id}/cv`}>Download {a.cv_file_name}</a> : <span className="muted">Not provided</span>)}
        {row("Right to work in the UK", a.right_to_work ? "Yes" : <b style={{ color: "#9b1c1c" }}>No</b>)}
        {row("DBS", DBS.find(([k]) => k === a.dbs)?.[1])}
      </dl></section>
      <section className="card"><h2>Referees ({a.referees.length})</h2>
        {a.referees.map((r, i) => <div key={i} className="refbox"><b>{r.name}</b> · {r.job_title}, {r.organisation}<div className="muted">{r.relationship}</div>
          <div><a href={`mailto:${r.email}`}>{r.email}</a> · {r.phone}</div></div>)}
        <p className="muted" style={{ fontSize: 14 }}>Tell the applicant before contacting referees.</p>
      </section>
    </div>
    <section className="card"><h2>Supporting statement</h2><div className="stmt">{a.cover_letter}</div></section>
    <form action={saveApplicationAction} className="card" style={{ display: "grid", gap: 10 }}><h2>Progress</h2>
      <input type="hidden" name="id" value={a.id} />
      <label className="fld">Status<select name="status" defaultValue={a.status} style={{ maxWidth: 260 }}>{APP_STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label className="fld">Notes (only staff see these)<textarea name="notes" rows={4} maxLength={4000} defaultValue={a.notes} className="mini" style={{ width: "100%" }} /></label>
      <div><button className="abtn pri" type="submit">Save</button></div>
    </form>
    <form action={deleteApplicationAction} className="card eform"><input type="hidden" name="id" value={a.id} /><input type="hidden" name="job" value={a.job_id} />
      <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" name="confirm" required /> Delete this application and its documents for good</label>
      <button className="abtn sm" type="submit">Delete</button></form>
  </>;
}
