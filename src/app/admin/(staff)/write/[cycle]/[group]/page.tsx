import { NoAssessPick } from "../../../../NoAssessPick";
import { GuideSlides } from "../../../../GuideSlides";
import { REPORT_SLIDES } from "../../../../guides";
import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { getWriteSheet } from "@/lib/reports";
import { saveWriteSheetAction } from "../../../../actions";
import { AiDraft, AiDraftAll } from "./AiDraft";
import { suggestGrades } from "@/lib/grades";
import { WriteDirty } from "./WriteDirty";

const wday = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const day = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long" });
const PILL: Record<string, [string, string]> = { todo: ["To write", "mute"], draft: ["Draft", "warn"], submitted: ["Submitted", "info"], returned: ["Sent back", "bad"], approved: ["Approved", "good"] };
const scale = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
const AS: Record<string, [string, string]> = { marked: ["good", "Marked"], handed_in: ["info", "Handed in · waiting for your mark"], set: ["warn", "Not handed in yet"],
  not_set: ["warn", "Not set in Classroom yet"], unknown: ["mute", "Assessment status comes from Google Classroom once it’s connected"] };

export default async function Write({ params, searchParams }: { params: Promise<{ cycle: string; group: string }>; searchParams: Promise<{ ok?: string; err?: string; r?: string }> }) {
  const [{ cycle, group }, sp, me] = await Promise.all([params, searchParams, requireViewer()]);
  const sheet = await getWriteSheet(cycle, group);
  if (!sheet || (me.role !== "school_admin" && sheet.head.teacher_user !== me.id)) notFound();
  const { head: h, rows } = sheet;
  // 26 Nov (Alfonso): teachers can write, save drafts and use AI any time; Submit to the office opens in the term's last week
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const notYet = me.role !== "school_admin" && h.status !== "published" && today < h.opens_on;
  const locked = h.status === "published";
  const wait = notYet ? `Submitting opens ${new Date(h.opens_on + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}` : "";
  return <>
    {/* 31 Oct: the page heading stays at the top while scrolling, with Submit all */}
    <div className="wr-head">
    <p className="backlink"><a className="abtn sm" href={me.role === "school_admin" ? `/admin/reports/${cycle}` : "/admin/teacher/reports"}>← Back</a></p>
      <div className="top"><div><h1>{h.name}<span className="h1-code">{h.code}</span></h1><div className="sub">{h.cycle} · <b>Submit</b> between {wday(h.opens_on)} and {wday(h.comments_due)} (the last week of term)</div></div>
        <span className="grow" /><GuideSlides slides={REPORT_SLIDES} title="Writing reports: how it works" label="How it works" />{!locked && rows.some((r) => r.status !== "approved") && <div className="acts">
          <AiDraftAll /><SubmitAll off={wait} /></div>}</div>
      {!sp.r && sp.ok && <p className="note msg">{sp.ok}</p>}{!sp.r && sp.err && <p className="note msg bad">{sp.err}</p>}
      {/* 27 Nov (Alfonso): one point per line; the submit dates are only in the line under the title */}
      <ul className="note wr-tips">
        {notYet && <li>You can write and save drafts now.</li>}
        <li>Effort and Progress are 1–5 (5 = Exceeding).</li>
        <li>Progress comes from Classroom marks when there are any; choose a score to overrule it.</li>
        <li>Each comment needs at least 20 characters.</li>
        <li>A report can be submitted once its assessment is marked in Classroom (the office chooses which term’s), or once you’ve said why there isn’t one.</li>
      </ul>
    </div>
    {rows.length === 0 ? <p className="empty">No reports for this class yet.</p> :
    <form action={saveWriteSheetAction} id="wr-form">
      <WriteDirty /><input type="hidden" name="cycle" value={cycle} /><input type="hidden" name="group" value={group} />
      {rows.map((r) => { const ro = locked || r.status === "approved"; const tools = !ro; const here = sp.r === r.id; const sg = h.gcse ? suggestGrades(r.marks ?? []) : null;
        return <section className="card wr-card" key={r.id} id={`r-${r.id}`}>
        <input type="hidden" name="ids" value={r.id} />
        {/* 27 Nov (Alfonso): the name, with where the report is up to on the right */}
        <div className="wr-name"><h2 style={{ margin: 0 }}>{r.student}</h2><span className={`pill ${PILL[r.status][1]}`}>{PILL[r.status][0]}</span></div>
        {r.status === "returned" && r.review_note && <p className="note msg bad">Sent back: {r.review_note}</p>}
        {here && (sp.ok || sp.err) && <p className={`note msg${sp.err ? " bad" : ""}`} role="status">{sp.err ?? sp.ok}</p>}
        {/* 1 Nov: the scores stacked on the left (2 × 2), the comment on the right with Save draft / Submit above it */}
        <div className="wr-body">
          <div className="wr-scores">
            <label className="fld">Progress<select name={`progress_${r.id}`} defaultValue={r.progress_override ?? ""} disabled={ro}><option value="">{r.auto_progress ? `From marks (${r.auto_progress})` : "Choose"}</option>{scale(5).map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
            <label className="fld">Effort<select name={`effort_${r.id}`} defaultValue={r.effort ?? ""} disabled={ro}><option value="">Choose</option>{scale(5).map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
            {h.gcse && <><label className="fld">Working grade<select name={`working_${r.id}`} defaultValue={r.working_grade ?? sg?.working ?? ""} disabled={ro}><option value="">—</option>{scale(9).map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
              <label className="fld">Predicted grade<select name={`predicted_${r.id}`} defaultValue={r.predicted_grade ?? sg?.predicted ?? ""} disabled={ro}><option value="">—</option>{scale(9).map((n) => <option key={n} value={n}>{n}</option>)}</select></label></>}
            {sg?.working != null && r.working_grade == null && !ro && <p className="wr-sug">Grades suggested from Classroom marks ({sg.basis}), using typical Edexcel iGCSE boundaries. Check them before saving.</p>}
            {/* 27 Nov (Alfonso): under the scores: the assessment(s) (with a link to Classroom) and the marks average */}
            <div className="wr-facts">
          {/* 27 Nov (Alfonso): each assessment the round uses (previous term's and/or this term's, set by the office), named by its term */}
          {(r.assess_parts.length ? r.assess_parts : [{ label: "Assessment", state: r.assess, pct: r.assess_pct, title: r.assess_title, link: null as string | null }]).map((p, k) => <div key={k} className="wr-as" title={p.title ?? undefined}>
            <span className="muted">{p.label}:</span>
            {/* 27 Nov (Alfonso): the status itself opens it in Classroom (the student's hand-in when there is one), with a small ↗ */}
            {p.link && /^https:\/\/classroom\.google\.com\//.test(p.link)
              ? <a className={`pill wr-aslink ${AS[p.state]?.[0] ?? "mute"}`} href={p.link} target="_blank" rel="noopener" title={`Open ${p.title ?? "it"} in Classroom`}>{AS[p.state]?.[1] ?? p.state}{p.state === "marked" && p.pct != null ? ` · ${p.pct}%` : ""} <span aria-hidden="true">↗</span></a>
              : <span className={`pill ${AS[p.state]?.[0] ?? "mute"}`}>{AS[p.state]?.[1] ?? p.state}{p.state === "marked" && p.pct != null ? ` · ${p.pct}%` : ""}</span>}</div>)}
          {r.assess !== "marked" && r.assess !== "unknown" && <label className="fld">No assessment because
            <NoAssessPick name={`noassess_${r.id}`} value={r.no_assessment ?? ""} disabled={ro} /></label>}
              {r.avg_pct && <p className="muted" style={{ margin: 0 }}>Marks average {r.avg_pct}% ({r.marked} pieces)</p>}
            </div>
          </div>
          <div className="aid-wrap">
            <div className="wr-chead"><label className="fld" htmlFor={`comment_${r.id}`}>Comment and targets</label>
              {tools && <div className="wr-acts">
                <button className="abtn sm" type="submit" name="one" value={`${r.id}:0`}>Save draft</button>
                <button className="abtn sm pri" type="submit" name="one" value={`${r.id}:1`} disabled={!!wait} title={wait || undefined}>Submit</button></div>}</div>
            <div className="aid-box"><textarea id={`comment_${r.id}`} name={`comment_${r.id}`} defaultValue={r.comment ?? ""} rows={7} maxLength={2000} disabled={ro} className="mini" style={{ width: "100%" }} />
              {tools && <AiDraft id={r.id} auto={r.auto_progress ?? null} has={!!r.comment} />}</div></div>
        </div>
      </section>; })}
    </form>}
  </>;
}

// "Submit all": saves every report on the page and submits the ones that are ready (the others stay as drafts, with a note).
// It sits in the sticky heading, outside the form, so it's tied to it with form="wr-form"; it posts a flag via formAction.
function SubmitAll({ off = "" }: { off?: string }) {
  return <button className="abtn sm pri" type="submit" form="wr-form" disabled={!!off} title={off || undefined} formAction={async (f: FormData) => { "use server"; f.set("submit", "1"); f.delete("one"); const { saveWriteSheetAction } = await import("../../../../actions"); return saveWriteSheetAction(f); }}>Submit all</button>;
}
