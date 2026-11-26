import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { teacherReportClasses } from "@/lib/reports";
import { dm } from "../fmt";

export const dynamic = "force-dynamic";

export default async function ReportsToWrite() {
  const me = await requireViewer();
  const rows = await teacherReportClasses(me.id);
  const cycles = [...new Map(rows.map((r) => [r.cycle_id, r])).values()];
  return <>
    <div className="top"><div><h1>Reports to write</h1><div className="sub">{cycles[0] ? `${cycles[0].cycle} · due ${dm(cycles[0].comments_due)} · write them once the assessment is marked in Classroom` : "Termly progress reports for your classes"}</div></div></div>
    {rows.length === 0 && <p className="empty">No reports to write right now. The office opens each report round.</p>}
    {cycles.map((c) => <section className="card" key={c.cycle_id}><h2>{c.cycle}</h2><p className="cs">Comments due {dm(c.comments_due)}</p>
      {/* 26 Nov: the whole row opens the class's reports, with a tinted hover */}
      {rows.filter((r) => r.cycle_id === c.cycle_id).map((r) => <Link className="li rw-row" key={r.group_id} href={`/admin/write/${r.cycle_id}/${r.group_id}`}>
        <div className="t"><b>{r.name} <span className="muted" style={{ fontWeight: 400 }}>{r.code}</span></b><span>{r.done}/{r.total} submitted</span></div>
        <div className="track" style={{ maxWidth: 160 }}><i style={{ width: `${r.total ? r.done / r.total * 100 : 0}%` }} /></div>
        <span className={`abtn sm${r.done < r.total ? " pri" : ""}`} aria-hidden="true">{r.done < r.total ? "Write" : "View"}</span></Link>)}</section>)}
  </>;
}
