import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { getWriteSheet } from "@/lib/reports";
import { saveWriteSheetAction } from "../../../../actions";

const day = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long" });
const PILL: Record<string, [string, string]> = { todo: ["To write", "mute"], draft: ["Draft", "warn"], submitted: ["Submitted", "info"], returned: ["Sent back", "bad"], approved: ["Approved", "good"] };
const scale = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

export default async function Write({ params, searchParams }: { params: Promise<{ cycle: string; group: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const [{ cycle, group }, sp, me] = await Promise.all([params, searchParams, requireViewer()]);
  const sheet = await getWriteSheet(cycle, group);
  if (!sheet || (me.role !== "school_admin" && sheet.head.teacher_user !== me.id)) notFound();
  const { head: h, rows } = sheet;
  const locked = h.status === "published";
  return <>
    <p><a href={me.role === "school_admin" ? `/admin/reports/${cycle}` : "/admin/teacher/reports"}>← Back</a></p>
    <div className="top"><div><h1>{h.name} <span className="muted" style={{ fontWeight: 400 }}>{h.code}</span></h1><div className="sub">{h.cycle} · comments due {day(h.comments_due)}</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    <p className="note">Effort and Progress are 1–5 (5 = Exceeding). Progress comes from Classroom marks when there are any; choose a score to overrule it. Each comment needs at least 20 characters.</p>
    {rows.length === 0 ? <p className="empty">No reports for this class yet.</p> :
    <form action={saveWriteSheetAction}>
      <input type="hidden" name="cycle" value={cycle} /><input type="hidden" name="group" value={group} />
      {rows.map((r) => { const ro = locked || r.status === "approved"; return <section className="card" key={r.id}>
        <input type="hidden" name="ids" value={r.id} />
        <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}><h2 style={{ margin: 0 }}>{r.student}</h2><span className={`pill ${PILL[r.status][1]}`}>{PILL[r.status][0]}</span>
          {r.avg_pct && <span className="muted">Marks average {r.avg_pct}% ({r.marked} pieces)</span>}</div>
        {r.status === "returned" && r.review_note && <p className="note msg bad">Sent back: {r.review_note}</p>}
        <div className="eform" style={{ margin: "10px 0" }}>
          <label className="fld">Progress<select name={`progress_${r.id}`} defaultValue={r.progress_override ?? ""} disabled={ro}><option value="">{r.auto_progress ? `From marks (${r.auto_progress})` : "Choose"}</option>{scale(5).map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
          <label className="fld">Effort<select name={`effort_${r.id}`} defaultValue={r.effort ?? ""} disabled={ro}><option value="">Choose</option>{scale(5).map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
          {h.gcse && <><label className="fld">Working grade<select name={`working_${r.id}`} defaultValue={r.working_grade ?? ""} disabled={ro}><option value="">—</option>{scale(9).map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
            <label className="fld">Predicted grade<select name={`predicted_${r.id}`} defaultValue={r.predicted_grade ?? ""} disabled={ro}><option value="">—</option>{scale(9).map((n) => <option key={n} value={n}>{n}</option>)}</select></label></>}
        </div>
        <label className="fld">Comment and targets<textarea name={`comment_${r.id}`} defaultValue={r.comment ?? ""} rows={4} maxLength={2000} disabled={ro} className="mini" style={{ width: "100%" }} /></label>
      </section>; })}
      {!locked && <div style={{ display: "flex", gap: 10, position: "sticky", bottom: 0, padding: "12px 0", background: "var(--bg)" }}>
        <button className="abtn" type="submit" name="submit" value="0">Save drafts</button>
        <SubmitAll /></div>}
    </form>}
  </>;
}

// a second submit button can't rely on its own value (it may be sent before the page has loaded), so it posts a flag via formAction
function SubmitAll() {
  return <button className="abtn pri" type="submit" formAction={async (f: FormData) => { "use server"; f.set("submit", "1"); const { saveWriteSheetAction } = await import("../../../../actions"); return saveWriteSheetAction(f); }}>Save and submit for approval</button>;
}
