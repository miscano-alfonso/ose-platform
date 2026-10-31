import Link from "next/link";
import { notFound } from "next/navigation";
import { studentReport } from "@/lib/reports";

export const dynamic = "force-dynamic";

// The report as a parent will see it (approved subjects only once published; here every subject, marked if not approved yet).
export default async function Preview({ params }: { params: Promise<{ id: string; sid: string }> }) {
  const { id, sid } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f-]{36}$/.test(sid)) notFound();
  const r = await studentReport(id, sid);
  if (!r) notFound();
  const label = (n: number | null) => n == null ? "–" : `${n} ${r.bands.find((b) => b.score === n)?.label ?? ""}`;
  return <>
    <p className="backlink"><Link className="abtn sm" href={`/admin/reports/${id}?tab=students`}>← Preview reports</Link></p>
    <section className="card" style={{ maxWidth: 820 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}><div><h1 style={{ margin: 0 }}>{r.student}</h1><div className="sub">{r.cycle} · {r.school}</div></div>
        <span className="muted">Published {new Date(r.publish_on + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</span></div>
      {r.lines.map((l, i) => <div key={i} style={{ borderTop: "1px solid var(--line)", paddingTop: 12, marginTop: 12 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}><h2 style={{ margin: 0 }}>{l.subject}</h2><span className="muted">{l.level}{l.teacher ? ` · ${l.teacher}` : ""}</span>
          {l.status !== "approved" && <span className="pill warn">Not approved yet</span>}</div>
        <p style={{ margin: "6px 0" }}><b>Progress:</b> {label(l.progress)} · <b>Effort:</b> {label(l.effort)}{l.working_grade != null && <> · <b>Working grade:</b> {l.working_grade} · <b>Predicted grade:</b> {l.predicted_grade ?? "–"}</>}</p>
        <p style={{ whiteSpace: "pre-line", margin: 0 }}>{l.comment || <span className="muted">No comment yet.</span>}</p></div>)}
    </section>
  </>;
}
