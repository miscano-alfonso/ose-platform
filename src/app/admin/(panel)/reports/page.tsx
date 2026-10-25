import Link from "next/link";
import { getCycles } from "@/lib/reports";
import { createCycleAction } from "../../actions";

const day = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const STATUS: Record<string, [string, string]> = { writing: ["Writing", "warn"], review: ["Review", "info"], published: ["Published", "good"] };

export default async function Reports({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const sp = await searchParams;
  const { cycles, terms } = await getCycles();
  return <>
    <div className="top"><div><h1>Reports</h1><div className="sub">Termly progress reports: teachers write one per student per class, you approve and publish them to families.</div></div></div>
    {sp.err && <p className="note msg bad">{sp.err}</p>}
    {cycles.length === 0 ? <p className="empty">No reports set up for this year yet.</p> :
      <div className="tw"><table><thead><tr><th>Report</th><th>Comments due</th><th>Publish</th><th>Written</th><th>Approved</th><th>Status</th><th></th></tr></thead>
        <tbody>{cycles.map((c) => <tr key={c.id}><td><b>{c.name}</b><div className="muted" style={{ fontSize: 15.5 }}>Marks {day(c.marks_from)} – {day(c.marks_to)}</div></td>
          <td>{day(c.comments_due)}</td><td>{day(c.publish_on)}</td><td>{c.total ? `${c.submitted + c.approved}/${c.total}` : <span className="muted">Not started</span>}</td>
          <td>{c.total ? `${c.approved}/${c.total}` : "—"}</td><td><span className={`pill ${STATUS[c.status][1]}`}>{STATUS[c.status][0]}</span></td>
          <td><Link className="abtn sm" href={`/admin/reports/${c.id}`}>Open</Link></td></tr>)}</tbody></table></div>}

    <section className="card"><h2>Set up a report</h2>
      <form action={createCycleAction} className="eform">
        <label className="fld">Name<input name="name" required maxLength={80} placeholder="Term 2 Progress Report" /></label>
        <label className="fld">Term<select name="term" defaultValue=""><option value="">None (e.g. end of year)</option>{terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label className="fld">Marks from<input type="date" name="from" required /></label>
        <label className="fld">Marks to<input type="date" name="to" required /></label>
        <label className="fld">Comments due<input type="date" name="due" required /></label>
        <label className="fld">Publish on<input type="date" name="publish" required /></label>
        <button className="abtn pri" type="submit">Create</button>
      </form>
      <p className="cs" style={{ marginTop: 8 }}>Google Classroom marks returned between the two “marks” dates set each student’s Progress score once Classroom is connected; teachers can overrule it.</p></section>
  </>;
}
