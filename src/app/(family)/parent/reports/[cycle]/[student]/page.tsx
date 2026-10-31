import Link from "next/link";
import { notFound } from "next/navigation";
import { requireParent } from "@/lib/family-auth";
import { ownsStudent } from "@/lib/family";
import { studentReport } from "@/lib/reports";
import { withSchool } from "@/lib/db";

export default async function Report({ params }: { params: Promise<{ cycle: string; student: string }> }) {
  const [{ cycle, student }, f] = await Promise.all([params, requireParent()]);
  if (!/^[0-9a-f-]{36}$/.test(cycle) || !/^[0-9a-f-]{36}$/.test(student) || !(await ownsStudent(f.id, student))) notFound();
  const pub = (await withSchool((q) => q(`select 1 from report_cycles where id = $1 and status = 'published'`, [cycle]))).length;
  const r = pub ? await studentReport(cycle, student) : null;
  if (!r) notFound();
  const lines = r.lines.filter((l) => l.status === "approved");
  const label = (n: number | null) => n == null ? "–" : `${n} ${r.bands.find((b) => b.score === n)?.label ?? ""}`;
  return <>
    <p className="backlink"><Link className="abtn sm" href="/parent/reports">← Reports</Link></p>
    <section className="card" style={{ maxWidth: 820 }}>
      <h1 style={{ margin: 0 }}>{r.student}</h1><div className="sub">{r.cycle} · {r.school}</div>
      {lines.map((l, i) => <div key={i} style={{ borderTop: "1px solid var(--line)", paddingTop: 12, marginTop: 12 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}><h2 style={{ margin: 0 }}>{l.subject}</h2><span className="muted">{l.level}{l.teacher ? ` · ${l.teacher}` : ""}</span></div>
        <p style={{ margin: "6px 0" }}><b>Progress:</b> {label(l.progress)} · <b>Effort:</b> {label(l.effort)}{l.working_grade != null && <> · <b>Working grade:</b> {l.working_grade} · <b>Predicted grade:</b> {l.predicted_grade ?? "–"}</>}</p>
        <p style={{ whiteSpace: "pre-line", margin: 0 }}>{l.comment}</p></div>)}
      <p className="note" style={{ marginTop: 14 }}>Progress comes from the marks on work in Google Classroom; Effort is from the teacher. Both are 1–5, where 5 is Exceeding.</p>
    </section>
  </>;
}
