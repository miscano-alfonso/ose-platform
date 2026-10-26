import Link from "next/link";
import { requireParent } from "@/lib/family-auth";
import { familyReports } from "@/lib/family";
import { withSchool } from "@/lib/db";
import { Head, dm } from "../../fmt";

export default async function Reports() {
  const f = await requireParent();
  const [rows, next] = await Promise.all([familyReports(f.id), withSchool((q) => q<{ name: string; publish_on: string }>(`select name, publish_on::text from report_cycles where status <> 'published' and publish_on >= current_date order by publish_on limit 1`))]);
  return <>
    <Head title="Reports" sub="Termly progress reports from your children’s teachers" />
    <section className="card">{rows.length === 0 ? <p className="empty">No reports yet.</p> : rows.map((r) => <div className="li" key={r.cycle_id + r.student_id}>
      <div className="t"><b>{r.child} · {r.cycle}</b><span>Published {r.published ? dm(r.published) : ""} · {r.subjects} subject{r.subjects === 1 ? "" : "s"}</span></div>
      <Link className="abtn sm pri" href={`/parent/reports/${r.cycle_id}/${r.student_id}`}>View report</Link></div>)}</section>
    {next[0] && <p className="note">The {next[0].name} will be published on {dm(next[0].publish_on)}. We’ll email you when it’s ready.</p>}
  </>;
}
