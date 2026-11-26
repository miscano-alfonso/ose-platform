import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { markingQueue, markingSubmissions, countdown, tone, TURNAROUND_DAYS, type MarkItem, type MarkSub } from "@/lib/marking";
import { dm } from "../fmt";
import * as P from "@/lib/past-papers";
import { paperDelayAction, paperReturnAction } from "../../../papers-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Marking" };
const PILL = { ok: "good", warn: "warn", bad: "bad" } as const;
const Pill = ({ m }: { m: MarkItem }) => <span className={`pill ${PILL[tone(m.daysLeft)]}`}>{countdown(m.daysLeft)}</span>;

// Teacher → Marking (25 Nov): work handed in and waiting to be marked and returned in Google Classroom, from the last
// Classroom read. "Each piece of work" lists them soonest deadline first; "By class" groups them under each class.
// Each piece opens to the students who handed it in, each linking to their hand-in in Classroom, where marking stays.
function Piece({ m, subs, showClass }: { m: MarkItem; subs: MarkSub[]; showClass: boolean }) {
  return <details className="mk-piece">
    <summary><div className="t"><b>{m.title}</b><span>{showClass ? `${m.cls} · ` : ""}{m.toMark} to mark · return by {dm(m.deadline)}</span></div><Pill m={m} /></summary>
    <ul className="mk-subs">{subs.map((s) => <li key={s.sid}>
      <span className="mk-who"><b>{s.student}</b><span>{s.turnedIn ? `Handed in ${dm(s.turnedIn)}` : "Handed in"}</span>{s.late && <span className="pill warn">Late</span>}</span>
      {s.link ? <a className="abtn sm" href={s.link} target="_blank" rel="noopener">Open in Classroom</a> : m.link && <a className="abtn sm" href={m.link} target="_blank" rel="noopener">Open in Classroom</a>}
    </li>)}</ul>
    {m.link && <p className="mk-all"><a href={m.link} target="_blank" rel="noopener">All hand-ins for this work in Classroom ↗</a></p>}
  </details>;
}

export default async function Marking({ searchParams }: { searchParams: Promise<{ by?: string; ok?: string; err?: string }> }) {
  const [me, sp] = await Promise.all([requireViewer(), searchParams]);
  const [queue, subs, papers] = await Promise.all([markingQueue(me.id), markingSubmissions(me.id), P.teacherPapers(me.id).catch(() => [] as P.PaperJob[])]);
  const byClass = sp.by === "class", total = subs.length;
  const classes = [...new Map(queue.map((m) => [m.gid, m.cls])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const subsOf = (cw: string) => subs.filter((s) => s.cw === cw);
  return <>
    <div className="top"><div><h1>Marking</h1>
      <div className="sub">{papers.some((p) => !p.returned_at) && `${papers.filter((p) => !p.returned_at).length} past paper${papers.filter((p) => !p.returned_at).length === 1 ? "" : "s"} · `}{total ? `${total} hand-in${total === 1 ? "" : "s"} to mark in ${queue.length} piece${queue.length === 1 ? "" : "s"} of work` : "Nothing waiting"} · mark and return work in Google Classroom within {TURNAROUND_DAYS} days of its due date</div></div>
      <div className="segl"><Link href="/admin/teacher/marking" aria-current={!byClass ? "true" : undefined}>Each piece of work</Link><Link href="/admin/teacher/marking?by=class" aria-current={byClass ? "true" : undefined}>By class</Link></div></div>
    {sp.ok && <p className="notice ok" role="status">{sp.ok}</p>}{sp.err && <p className="notice err" role="alert">{sp.err}</p>}
    {papers.length > 0 && <Papers papers={papers} />}
    {queue.length === 0 ? <section className="card"><p className="empty">All marked. Nothing handed in is waiting to be returned. Work shows here once students hand it in to Google Classroom (read every 2 hours).</p></section>
    : byClass ? classes.map(([gid, cls]) => { const items = queue.filter((m) => m.gid === gid);
        return <section className="card mk-card" key={gid}><h2>{cls} <span className="muted">· {items.reduce((a, m) => a + m.toMark, 0)} to mark</span></h2>
          {items.map((m) => <Piece key={m.cw} m={m} subs={subsOf(m.cw)} showClass={false} />)}</section>; })
    : <section className="card mk-card">{queue.map((m) => <Piece key={m.cw} m={m} subs={subsOf(m.cw)} showClass />)}</section>}
    <p className="note">Marked work counts as done once you return it to the student in Classroom. The list updates each time Classroom is read.</p>
  </>;
}

// 26 Nov: past papers parents paid to have marked (from the website), given to this teacher for their subject:
// download, warn of a delay (the parent and the office are told), send the marked paper back (emailed to the parent).
function Papers({ papers }: { papers: P.PaperJob[] }) {
  const open = papers.filter((p) => !p.returned_at);
  const minDelay = new Date(Date.now() + 60 * 60e3), maxDelay = new Date(Date.now() + 14 * 864e5);
  const local = (d: Date) => new Date(d.toLocaleString("en-US", { timeZone: "Europe/London" })).toLocaleString("sv-SE").slice(0, 16).replace(" ", "T");
  return <section className="card mk-card" id="papers"><h2>Past papers <span className="muted">· {open.length ? `${open.length} to mark` : "all sent back"}</span></h2>
    <p className="cs">Papers parents have paid for on the website. Send each back marked, with feedback in line with the mark scheme and targets for improvement, within {P.TURNAROUND_HOURS} hours of payment. If it’ll take longer, warn of a delay: the parent is emailed the new time.</p>
    {papers.map((p) => { const due = P.backBy(p)!, h = P.hoursLeft(due); const tone = p.returned_at ? "good" : h < 0 ? "bad" : h < 12 || p.delay_until ? "warn" : "info";
      return <details className="mk-piece" key={p.id} id={`p-${p.id}`} open={!p.returned_at && open.length <= 3}>
        <summary><div className="t"><b>{p.subject ?? "Past paper"}{p.child ? ` · ${p.child}` : ""}</b>
          <span>{p.returned_at ? `Sent back ${P.when(p.returned_at)}` : `Back by ${P.when(due)}${p.delay_until ? " (new time you gave)" : ""} · paid ${P.when(p.paid_at!)}`}</span></div>
          <span className={`pill ${tone}`}>{p.returned_at ? "Sent back" : P.countdownHours(h)}</span></summary>
        <div className="pp-job">
          <p style={{ margin: "0 0 8px" }}>{p.file_name && <a className="abtn sm" href={`/admin/paper-file/${p.id}`}>Download the paper</a>} {p.returned_at && <a className="abtn sm" href={`/admin/paper-file/${p.id}?marked=1`}>Your marked paper</a>}</p>
          {p.message && <p className="muted" style={{ margin: "0 0 8px" }}>The parent’s note: “{p.message}”</p>}
          {p.delay_until && !p.returned_at && <p style={{ margin: "0 0 8px" }}><b>You warned of a delay:</b> {p.delay_reason} <span className="muted">(first due {P.when(p.due_at!)})</span></p>}
          {!p.returned_at && <div className="pp-forms">
            <form action={paperReturnAction} encType="multipart/form-data" className="pp-f"><input type="hidden" name="id" value={p.id} />
              <b>Send it back marked</b>
              <label className="fld">The marked paper <span className="muted">(PDF, Word or photo, under 3.5 MB)</span><input type="file" name="marked" required accept=".pdf,.doc,.docx,image/jpeg,image/png,image/webp" /></label>
              <label className="fld">Note to the parent <span className="muted">(optional)</span><textarea name="note" rows={3} maxLength={2000} /></label>
              <div><button className="abtn pri sm" type="submit">Email it to the parent</button></div></form>
            <details className="pp-f"><summary><b>Warn of a delay</b></summary>
              <form action={paperDelayAction} style={{ display: "grid", gap: 8, marginTop: 8 }}><input type="hidden" name="id" value={p.id} />
                <label className="fld">New time it’ll be back<input type="datetime-local" name="until" required min={local(minDelay)} max={local(maxDelay)} /></label>
                <label className="fld">Reason, for the parent<textarea name="reason" rows={2} required minLength={5} maxLength={400} placeholder="e.g. I’m unwell today, so I’ll mark it first thing tomorrow." /></label>
                <div><button className="abtn sm" type="submit">Tell the parent and the office</button></div></form></details>
          </div>}
          {p.return_note && <p className="muted" style={{ margin: "8px 0 0" }}>Your note: {p.return_note}</p>}
        </div>
      </details>; })}
  </section>;
}
