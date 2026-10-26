import Link from "next/link";
import { notFound } from "next/navigation";
import { getCycle, getCycles, gradeBands, cycleStudents, byTeacher } from "@/lib/reports";
import { createEntriesAction, reviewEntryAction, approveAllAction, publishCycleAction, saveBandAction, remindTeachersAction } from "../../../actions";

export const dynamic = "force-dynamic";
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
  const TABS: [string, string][] = [["review", `To review (${c.submitted})`], ["classes", "Classes and teachers"], ["students", "Preview reports"], ["key", "Grading key"], ["past", "All reports"]];
  return <>
    <div className="top"><div><h1>Reports</h1><div className="sub">{c.name} · comments due {day(c.comments_due)} · reports go to parents {day(c.publish_on)}</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
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
      {c.status !== "published" ? <form action={publishCycleAction}><input type="hidden" name="id" value={c.id} /><button className="abtn pri" type="submit" disabled={!c.approved}>Publish {c.approved} approved</button></form> : <span className="pill good">Published</span>}
    </div>

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
      <section className="card" style={{ margin: 0 }}><h2>By teacher</h2><p className="cs">Comments due {day(c.comments_due)}.</p>
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
        <div className="t"><b>{x.name}</b><span>Comments due {day(x.comments_due)} · publish {day(x.publish_on)} · {x.approved}/{x.total} approved</span></div>
        <Link className="abtn sm" href={`/admin/reports/${x.id}`}>Open</Link></div>)}
      <p style={{ marginTop: 12 }}><Link className="abtn sm" href="/admin/reports?all=1">Set up a new report</Link></p></section>}
  </>;
}
