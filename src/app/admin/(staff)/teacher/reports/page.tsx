import { GuideSlides } from "../../../GuideSlides";
import { REPORT_SLIDES } from "../../../guides";
import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { teacherReportClasses } from "@/lib/reports";
import { dm } from "../fmt";

export const dynamic = "force-dynamic";

export default async function ReportsToWrite() {
  const me = await requireViewer();
  const rows = await teacherReportClasses(me.id);
  const cycles = [...new Map(rows.map((r) => [r.cycle_id, r])).values()];
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const line = (c: (typeof cycles)[number]) => today < c.opens_on ? <>Comments due {dm(c.comments_due)} · write and save drafts now; <b>Submit</b> opens {dm(c.opens_on)} (the last week of term)</> : <>Comments due {dm(c.comments_due)}</>;
  return <>
    {/* 27 Nov (Alfonso): the round itself is the page heading, with its dates under it */}
    <div className="top"><div><h1>{cycles[0]?.cycle ?? "Reports"}</h1><div className="sub">{cycles[0] ? line(cycles[0]) : "Termly progress reports for your classes"}</div></div><span className="grow" /><GuideSlides slides={REPORT_SLIDES} title="Writing reports: how it works" label="How reports work" /></div>
    {rows.length === 0 && <p className="empty">No reports to write right now. The office opens each report round.</p>}
    {cycles.map((c, ci) => <section className="card" key={c.cycle_id}>{ci > 0 && <><h2>{c.cycle}</h2><p className="cs">{line(c)}</p></>}
      {/* 26 Nov: the whole row opens the class's reports, with a tinted hover */}
      {rows.filter((r) => r.cycle_id === c.cycle_id).map((r) => <Link className="li rw-row" key={r.group_id} href={`/admin/write/${r.cycle_id}/${r.group_id}`}>
        <div className="t"><b>{r.name} <span className="muted" style={{ fontWeight: 400 }}>{r.code}</span></b><span>{r.done}/{r.total} submitted</span></div>
        <div className="track" style={{ maxWidth: 160 }}><i style={{ width: `${r.total ? r.done / r.total * 100 : 0}%` }} /></div>
        <span className={`abtn sm${r.done < r.total ? " pri" : ""}`} aria-hidden="true">{r.done < r.total ? "Write" : "View"}</span></Link>)}</section>)}
  </>;
}
