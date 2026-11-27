import Link from "next/link";
import { assessTermsAction, cycleDatesAction } from "../../../actions";
import { notFound } from "next/navigation";
import { getCycle, getCycles, gradeBands, cycleStudents, byTeacher } from "@/lib/reports";
import { createEntriesAction, deleteCycleAction, reviewEntryAction, approveAllAction, publishCycleAction, saveBandAction, remindTeachersAction, emailReportsAction } from "../../../actions";
import { reportEmailStatus } from "@/lib/report-email";

export const dynamic = "force-dynamic";
export const maxDuration = 60;   // emailing a whole round of reports
const day = (d: string) => new Date(d.slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const Score = ({ n }: { n: number | null }) => <span className={`pill ${n == null ? "mute" : n >= 4 ? "good" : n === 3 ? "info" : "warn"}`}>{n ?? "–"}</span>;

export default async function Cycle({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string; tab?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await getCycle(id);
  if (!data) notFound();
  const { cycle: c, classes, review } = data;
  const tab = ["review", "classes", "students", "key", "past"].includes(sp.tab ?? "") ? sp.tab! : "review";
  const [bands, students, teachers, all] = await Promise.all([gradeBands(), tab === "students" ? cycleStudents(id) : Promise.resolve([]), tab === "classes" ? byTeacher(id) : Promise.resolve([]), getCycles()]);
  const done = c.submitted + c.approved;
  const st = c.status === "published" ? await reportEmailStatus(id) : null;
  const TABS: [string, string][] = [["review", `To review (${c.submitted})`], ["classes", "Classes and teachers"], ["students", "Preview reports"], ["key", "Grading key"], ["past", "All reports"]];
  return <>
    <div className="top"><div><h1>Reports</h1><div className="sub">{c.name} · teachers submit {day(c.opens_on ?? c.comments_due)} – {day(c.comments_due)} · reports go to parents {day(c.publish_on)}</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    {/* 27 Nov (Alfonso): which term's assessment this round uses; teachers can submit once each chosen one is marked */}
    {c.status !== "published" && <form action={assessTermsAction} className="card as-terms"><input type="hidden" name="id" value={c.id} />
      <b>Assessments to use</b>
      <label><input type="checkbox" name="assess_prev" defaultChecked={c.assess_prev} disabled={c.term_no === 1} /> Previous term’s{c.term_no && c.term_no > 1 ? ` (Term ${c.term_no - 1})` : ""}</label>
      <label><input type="checkbox" name="assess_this" defaultChecked={c.assess_this} /> This term’s{c.term_no ? ` (Term ${c.term_no})` : ""}</label>
      <button className="abtn sm" type="submit">Save</button>
      <span className="muted" style={{ fontSize: 14 }}>Found in Google Classroom by “{"assessment"}” in the title. Teachers can submit once each chosen one is marked, or say why there isn’t one.</span></form>}
    {/* 27 Nov (Alfonso: "where can i edit dates for each bi-termly report?") */}
    {c.status !== "published" && <details className="card rp-dates"><summary><b>Dates</b><span className="muted">Marks {day(c.marks_from)} – {day(c.marks_to)} · submitting opens {day(c.opens_on ?? c.comments_due)} · submit by {day(c.comments_due)} · to parents {day(c.publish_on)}</span><span className="lnk">Change</span></summary>
      <form action={cycleDatesAction} className="rp-dform"><input type="hidden" name="id" value={c.id} />
        <label className="fld">Marks from<input type="date" name="from" defaultValue={c.marks_from} required /></label>
        <label className="fld">Marks to<input type="date" name="to" defaultValue={c.marks_to} required /></label>
        <label className="fld">Submitting opens<input type="date" name="opens" defaultValue={c.submit_opens ?? ""} /><small>Blank: the last week of term ({day(c.opens_on ?? c.comments_due)})</small></label>
        <label className="fld">Teachers submit by<input type="date" name="due" defaultValue={c.due_set ?? c.comments_due} required /></label>
        <label className="fld">Reports go to parents<input type="date" name="publish" defaultValue={c.publish_on} required /></label>
        <button className="abtn pri sm" type="submit">Save dates</button>
      </form>
      <p className="muted" style={{ fontSize: 14, margin: "8px 0 0" }}>Marks from / to: the Classroom work that counts towards Progress. Teachers can write drafts any time and press Submit from the day submitting opens.</p></details>}
    <div className="tiles">
      <div className="tile"><span className="k">Comments written</span><span className="v">{done}/{c.total}</span><span className="h">{c.draft} in draft · {c.todo} not started</span></div>
      <div className={`tile${c.submitted ? " alert" : ""}`}><span className="k">Waiting for review</span><span className="v">{c.submitted}</span><span className="h">{c.returned} sent back to teachers</span></div>
      <div className="tile"><span className="k">Approved</span><span className="v">{c.approved}</span><span className="h">ready to publish</span></div>
      <div className="tile"><span className="k">Reports to parents</span><span className="v" style={{ fontSize: 20 }}>{c.status === "published" ? "Published" : day(c.publish_on)}</span><span className="h">on the Parent dashboard{c.status === "published" ? "" : " + email"}</span></div>
    </div>
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
      <div className="segl" role="tablist">{TABS.map(([k, l]) => <Link key={k} href={`/admin/reports/${id}?tab=${k}`} aria-current={tab === k ? "true" : undefined}>{l}</Link>)}</div>
      <span style={{ flex: 1 }} />
      {c.status !== "published" && <form action={createEntriesAction}><input type="hidden" name="id" value={c.id} /><button className="abtn sm" type="submit">{c.total ? "Add late joiners" : "Start: a report for every student"}</button></form>}
      {c.status !== "published" && !c.total && <form action={deleteCycleAction}><input type="hidden" name="id" value={c.id} /><button className="abtn sm" type="submit">Delete this report round</button></form>}
      {c.status !== "published" ? <form action={publishCycleAction}><input type="hidden" name="id" value={c.id} /><button className="abtn pri" type="submit" disabled={!c.total || c.approved < c.total} title={c.approved < c.total ? "Every report has to be approved first" : undefined}>{c.total && c.approved >= c.total ? `Publish all ${c.total}` : `Publish (${c.approved} of ${c.total} approved)`}</button></form> : <span className="pill good">Published</span>}
    </div>

    {st && (() => { const left = st.children - st.sent - st.noEmail;   // 26 Nov
      return <section className="card">
        <h2 style={{ display: "flex", gap: 10, alignItems: "center" }}>Email the reports to parents {st.sent > 0 && <span className={`pill ${left ? "warn" : "good"}`}>{st.sent} of {st.children - st.noEmail} sent</span>}</h2>
        <p className="cs">Each family gets one email per child with the report attached as a PDF, laid out like your usual reports (subjects, Progress and Effort, grades and targets, then the Grading Key), so parents don’t need to sign in. The email is a short note signed with your first name. It goes to the account holder, and to a second parent who gets reports. Replies come to the school inbox. Approved subjects only; check a student’s PDF under Preview reports. <b>This goes to real parents even while test mode is on</b>; nothing else does.{st.noEmail ? ` ${st.noEmail} child${st.noEmail === 1 ? " has" : "ren have"} no parent email, so they’re left out.` : ""}{st.lastAt ? ` Last sent ${new Date(st.lastAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })}.` : ""}</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
          <form action={emailReportsAction}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="test" value="1" /><button className="abtn" type="submit">Send me a test first</button></form>
          {left > 0 ? <form action={emailReportsAction} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}><input type="hidden" name="id" value={c.id} />
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" name="confirm" /> I’ve checked the reports and the test email</label>
            <button className="abtn pri" type="submit">{st.sent ? `Email the other ${left}` : `Email ${left} report${left === 1 ? "" : "s"} to parents`}</button></form>
            : <span className="muted">Every report has been emailed.</span>}
        </div>
      </section>; })()}
    {tab === "review" && <div className="dstack">
      {review.length === 0 ? <p className="empty">Nothing waiting for review.</p> : review.map((r) => <section className="card" key={r.id} style={{ margin: 0 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}><b>{r.student}</b><span className="muted">{r.class} · {r.teacher}</span><span style={{ flex: 1 }} />
          <span className="muted" style={{ fontSize: 13 }}>Progress</span><Score n={r.progress} /><span className="muted" style={{ fontSize: 13 }}>Effort</span><Score n={r.effort} />
          {r.working_grade != null && <><span className="muted" style={{ fontSize: 13 }}>Working</span><span className="pill mute">{r.working_grade}</span><span className="muted" style={{ fontSize: 13 }}>Predicted</span><span className="pill mute">{r.predicted_grade}</span></>}</div>
        <p style={{ whiteSpace: "pre-line", margin: "10px 0" }}>{r.comment}</p>
        <p className="note" style={{ margin: "0 0 10px" }}>{r.avg_pct ? `Classroom marks average ${r.avg_pct}%` : "No Classroom marks synced"} → Progress {r.progress ?? "–"}{r.progress ? ` ${bands.find((b) => b.score === r.progress)?.label ?? ""}` : ""}</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <form action={reviewEntryAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="cycle" value={c.id} /><input type="hidden" name="approve" value="1" /><button className="abtn pri sm" type="submit">Approve</button></form>
          <form action={reviewEntryAction} style={{ display: "flex", gap: 6 }}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="cycle" value={c.id} /><input type="hidden" name="approve" value="0" />
            <input name="note" className="mini" placeholder="What to change" maxLength={300} required /><button className="abtn sm" type="submit">Send back</button></form></div></section>)}
      {review.length > 1 && <form action={approveAllAction}><input type="hidden" name="id" value={c.id} /><button className="abtn" type="submit">Approve all {review.length}</button></form>}
    </div>}

    {tab === "classes" && <div className="pgrid2" style={{ marginTop: 0 }}>
      <div className="tw" style={{ marginBottom: 0 }}><table><thead><tr><th>Class</th><th>Teacher</th><th className="n">Written</th><th className="n">Approved</th><th>Progress</th><th /></tr></thead><tbody>
        {classes.length === 0 ? <tr><td colSpan={6} className="muted">No reports created yet. Press “Start”.</td></tr> : classes.map((k) => <tr key={k.group_id}><td><b>{k.name}</b> <span className="muted">{k.code}</span></td>
          <td>{k.teacher ?? <span className="muted">Not set</span>}</td><td className="n">{k.done}/{k.total}</td><td className="n">{k.approved}</td>
          <td><div className="track" style={{ minWidth: 80 }}><i style={{ width: `${k.total ? k.done / k.total * 100 : 0}%` }} /></div></td>
          <td><Link className="abtn sm" href={`/admin/write/${c.id}/${k.group_id}`}>Open</Link></td></tr>)}</tbody></table></div>
      <section className="card" style={{ margin: 0 }}><h2>By teacher</h2><p className="cs">Teachers submit by {day(c.comments_due)}.</p>
        <div className="bars">{teachers.map((t) => <div className="brow" key={t.teacher}><span className="lbl">{t.teacher}</span><div className="track"><i style={{ width: `${t.total ? t.done / t.total * 100 : 0}%` }} /></div><span className="num">{t.done}/{t.total}</span></div>)}</div>
        {c.status !== "published" && <form action={remindTeachersAction} style={{ marginTop: 12 }}><input type="hidden" name="cycle" value={c.id} /><button className="abtn sm" type="submit">Remind teachers with comments to write</button></form>}</section>
    </div>}

    {tab === "students" && <div className="tw"><table><thead><tr><th>Student</th><th>Level</th><th className="n">Subjects</th><th className="n">Approved</th><th /></tr></thead><tbody>
      {students.length === 0 ? <tr><td colSpan={5} className="muted">No reports yet.</td></tr> : students.map((s) => <tr key={s.id}><td><b>{s.name}</b></td><td>{s.level}</td><td className="n">{s.subjects}</td><td className="n">{s.approved}</td>
        <td><Link className="abtn sm" href={`/admin/reports/${id}/student/${s.id}`}>Preview</Link></td></tr>)}</tbody></table></div>}

    {tab === "key" && <section className="card"><h2>Grading key</h2><p className="cs">Progress is the average of the term’s marked Classroom work, placed in a band. Teachers can change it if the marks don’t tell the whole story.</p>
      <div className="tw" style={{ border: 0 }}><table><thead><tr><th>Score</th><th>Label</th><th className="n">From</th><th className="n">To</th></tr></thead><tbody>
        {bands.map((b, i) => <tr key={b.score}><td><Score n={b.score} /></td><td><b>{b.label}</b></td>
          <td className="n">{b.score === 1 ? "0%" : <form action={saveBandAction} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><input type="hidden" name="score" value={b.score} /><input type="hidden" name="cycle" value={id} />
            <input type="number" name="min" min={1} max={99} defaultValue={b.min_pct} className="mini" style={{ width: 64, textAlign: "right" }} aria-label={`${b.label} from`} />%<button className="abtn sm" type="submit">Save</button></form>}</td>
          <td className="n">{i ? `${bands[i - 1].min_pct - 1}%` : "100%"}</td></tr>)}</tbody></table></div>
      <p className="note">Effort is set by the teacher on the same 1–5 scale. Working and Predicted grades (9–1) are for GCSE courses only.</p></section>}

    {tab === "past" && <section className="card"><h2>All reports this year</h2>
      {all.cycles.map((x) => <div className="li" key={x.id}><span className={`pill ${x.status === "published" ? "good" : x.status === "review" ? "info" : "warn"}`}>{x.status === "published" ? "Published" : x.status === "review" ? "Review" : "Writing"}</span>
        <div className="t"><b>{x.name}</b><span>Submit by {day(x.comments_due)} · publish {day(x.publish_on)} · {x.approved}/{x.total} approved</span></div>
        <Link className="abtn sm" href={`/admin/reports/${x.id}`}>Open</Link></div>)}
      <p style={{ marginTop: 12 }}><Link className="abtn sm" href="/admin/reports?all=1">Set up a new report</Link></p></section>}
  </>;
}
