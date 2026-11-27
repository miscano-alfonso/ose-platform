import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { markingQueue, markingSubmissions, markingRoster, markingArchive, countdown, tone, TURNAROUND_DAYS, type MarkItem, type MarkSub, type RosterRow, type ArchItem } from "@/lib/marking";
import { resolveWorkAction } from "./actions";
import { dm } from "../fmt";
import * as P from "@/lib/past-papers";
import { paperDelayAction, paperReturnAction } from "../../../papers-actions";
import { GuideSlides } from "../../../GuideSlides";
import { TEACHER_GUIDES } from "../../../guides";

export const dynamic = "force-dynamic";
export const metadata = { title: "Marking" };
const PILL = { ok: "good", warn: "warn", bad: "bad" } as const;
const Pill = ({ m }: { m: MarkItem }) => <span className={`pill ${PILL[tone(m.daysLeft)]}`}>{countdown(m.daysLeft)}</span>;

// Teacher → Marking (25 Nov): work handed in and waiting to be marked and returned in Google Classroom, from the last
// Classroom read. "Each piece of work" lists them soonest deadline first; "By class" groups them under each class.
// Each piece opens to the students who handed it in, each linking to their hand-in in Classroom, where marking stays.
// 26 Nov: each piece shows "2/6 handed in", and opens to every student on the class: to mark (handed in, with Open in
// Classroom), marked (returned, with the mark) and not handed in yet.
function Piece({ m, subs, roster, showClass }: { m: MarkItem; subs: MarkSub[]; roster: RosterRow[]; showClass: boolean }) {
  const handed = roster.filter((r) => r.state === "to_mark" || r.state === "marked").length, total = roster.length;
  const group = (state: RosterRow["state"], label: string) => { const rows = roster.filter((r) => r.state === state); if (!rows.length) return null;
    return <><li className={`mk-grp ${state}`}>{label} · {rows.length}</li>{rows.map((r) => { const link = r.link;
      return <li key={r.studentId} className={`mk-st ${state}${state === "not_in" ? " mk-not" : ""}`}>
        <span className="mk-who"><b>{r.student}</b><span>{state === "not_in" ? "Not handed in" : state === "sent_back" ? "Returned without a mark, to redo" : r.turnedIn ? `Handed in ${dm(r.turnedIn)}` : "Handed in"}</span>
          {r.late && <span className="pill warn">Late</span>}{state === "marked" && r.pct != null && <span className="pill good">{r.pct}%</span>}
          {/* 27 Nov (Alfonso): handed in with nothing in it */}
          {state !== "not_in" && r.content === "none" && <span className="pill bad" title="Handed in in Classroom with no file, link or answer attached. Check it in Classroom: if there’s no work, return it so they can hand it in again.">Nothing attached</span>}
          {state !== "not_in" && r.content === "template_only" && <span className="pill mute" title="Only the copy of your file that Classroom made for them is attached. Open it to check they’ve written in it.">Only your template copy</span>}</span>
        {state !== "not_in" && (link ? <a className="abtn sm" href={link} target="_blank" rel="noopener">Open in Classroom</a> : m.link && <a className="abtn sm" href={m.link} target="_blank" rel="noopener">Open in Classroom</a>)}
      </li>; })}</>; };
  return <details className="mk-piece">
    <summary><div className="t"><b>{m.title}</b><span>{showClass ? `${m.cls} · ` : ""}{m.toMark} to mark{m.late || m.empty ? <> ({[m.late && <b key="l" className="mk-late">{m.late} late</b>, m.empty && <b key="e" className="mk-empty">{m.empty} with nothing attached</b>].filter(Boolean).flatMap((x, i) => i ? [", ", x] : [x])})</> : ""} · return by {dm(m.deadline)}</span></div>
      {total > 0 && <span className="mk-count" title="Students who have handed it in, out of everyone on the class">{handed}/{total} handed in</span>}<Pill m={m} /></summary>
    <ul className="mk-subs">{total ? <>{group("to_mark", "To mark")}{group("marked", "Marked")}{group("sent_back", "Sent back to redo")}{group("not_in", "Not handed in yet")}</>
      : subs.map((x) => <li key={x.sid}><span className="mk-who"><b>{x.student}</b><span>{x.turnedIn ? `Handed in ${dm(x.turnedIn)}` : "Handed in"}</span></span></li>)}</ul>
    {m.link && <p className="mk-all"><a href={m.link} target="_blank" rel="noopener">All hand-ins for this work in Classroom ↗</a></p>}
    {/* 27 Nov (Alfonso): not marking this one? Resolve it: it leaves the list (and the reminders), and can be put back */}
    <form action={resolveWorkAction} className="mk-resolve"><input type="hidden" name="cw" value={m.cw} /><input type="hidden" name="on" value="1" />
      <span className="muted">Not marking this one?</span>
      <select name="why" defaultValue="Not being marked" aria-label="Why it won’t be marked"><option>Not being marked</option><option>Practice or optional task</option><option>Marked in the lesson</option><option>Set by mistake</option><option value="other">Other…</option></select>
      <input name="other" maxLength={200} placeholder="Other reason" aria-label="Other reason" />
      <button className="abtn sm" type="submit">Resolve</button></form>
  </details>;
}

export default async function Marking({ searchParams }: { searchParams: Promise<{ by?: string; ok?: string; err?: string }> }) {
  const [me, sp] = await Promise.all([requireViewer(), searchParams]);
  const [queue, subs, papers] = await Promise.all([markingQueue(me.id), markingSubmissions(me.id), P.teacherPapers(me.id).catch(() => [] as P.PaperJob[])]);
  const byClass = sp.by === "class", onPapers = sp.by === "papers", total = subs.length;
  const openPapers = papers.filter((p) => !p.returned_at).length;
  const classes = [...new Map(queue.map((m) => [m.gid, m.cls])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const subsOf = (cw: string) => subs.filter((s) => s.cw === cw);
  const [roster, archived] = await Promise.all([markingRoster(queue.map((m) => m.cw)), markingArchive(me.id)]);
  const rosterOf = (cw: string) => roster.filter((r) => r.cw === cw);
  return <>
    <div className="top"><div><h1>Marking</h1>
      <div className="sub">{papers.some((p) => !p.returned_at) && `${papers.filter((p) => !p.returned_at).length} past paper${papers.filter((p) => !p.returned_at).length === 1 ? "" : "s"} · `}{total ? `${total} hand-in${total === 1 ? "" : "s"} to mark in ${queue.length} piece${queue.length === 1 ? "" : "s"} of work` : "Nothing waiting"} · mark and return work in Google Classroom within {TURNAROUND_DAYS} days of its due date</div></div>
      <div className="segl"><Link href="/admin/teacher/marking" aria-current={!byClass && !onPapers ? "true" : undefined}>Each piece of work</Link><Link href="/admin/teacher/marking?by=class" aria-current={byClass ? "true" : undefined}>By class</Link>
        <Link href="/admin/teacher/marking?by=papers#papers" aria-current={onPapers ? "true" : undefined}>Past papers{openPapers ? ` (${openPapers})` : ""}</Link></div><span className="grow" /><GuideSlides slides={TEACHER_GUIDES.marking.slides} title={TEACHER_GUIDES.marking.title} /></div>
    {sp.ok && <p className="note msg" role="status">{sp.ok}</p>}{sp.err && <p className="note msg bad" role="alert">{sp.err}</p>}
    {/* 26 Nov: past papers bought on the website have their own tab (always there, even when none are waiting) */}
    {onPapers ? <Papers papers={papers} /> : <>
    {openPapers > 0 && <p className="note msg" role="status"><b>{openPapers} past paper{openPapers === 1 ? "" : "s"} to mark.</b> <Link href="/admin/teacher/marking?by=papers#papers">Open Past papers →</Link></p>}
    {queue.length === 0 ? <section className="card"><p className="empty">All marked. Nothing handed in is waiting to be returned. Work shows here once students hand it in to Google Classroom (read every 2 hours).</p></section>
    : byClass ? classes.map(([gid, cls]) => { const items = queue.filter((m) => m.gid === gid);
        return <section className="card mk-card" key={gid}><h2>{cls} <span className="muted">· {items.reduce((a, m) => a + m.toMark, 0)} to mark</span></h2>
          {items.map((m) => <Piece key={m.cw} m={m} subs={subsOf(m.cw)} roster={rosterOf(m.cw)} showClass={false} />)}</section>; })
    : <section className="card mk-card">{queue.map((m) => <Piece key={m.cw} m={m} subs={subsOf(m.cw)} roster={rosterOf(m.cw)} showClass />)}</section>}
    <p className="note">Marked work counts as done once you return it to the student in Classroom. The list updates each time Classroom is read. Work from an earlier term that’s still not marked moves to Archived.</p>
    {archived.length > 0 && <Archived items={archived} />}</>}
  </>;
}

// 26 Nov: past papers parents paid to have marked (from the website), given to this teacher for their subject:
// download, warn of a delay (the parent and the office are told), send the marked paper back (emailed to the parent).
function Papers({ papers }: { papers: P.PaperJob[] }) {
  const open = papers.filter((p) => !p.returned_at);
  const minDelay = new Date(Date.now() + 60 * 60e3), maxDelay = new Date(Date.now() + 14 * 864e5);
  const local = (d: Date) => new Date(d.toLocaleString("en-US", { timeZone: "Europe/London" })).toLocaleString("sv-SE").slice(0, 16).replace(" ", "T");
  return <section className="card mk-card" id="papers"><h2>Past papers <span className="muted">· {open.length ? `${open.length} to mark` : papers.length ? "all sent back" : "none yet"}</span></h2>
    <p className="cs">Papers parents have paid for on the website. Send each back marked, with feedback in line with the mark scheme and targets for improvement, within {P.TURNAROUND_HOURS} hours of payment. If it’ll take longer, warn of a delay: the parent is emailed the new time.</p>
    {papers.length === 0 && <p className="empty">No past papers yet. When a parent buys past paper marking on the website for a subject you mark, it shows here with the paper to download, and you’re emailed. You send it back marked from here.</p>}
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

// 27 Nov (Alfonso): handed-in work from an earlier term that wasn't marked, and work the teacher resolved
function Archived({ items }: { items: ArchItem[] }) {
  return <details className="card mk-card mk-arch"><summary><h2 style={{ display: "inline", margin: 0 }}>Archived</h2> <span className="muted">· {items.length} piece{items.length === 1 ? "" : "s"} of work, off your list</span></summary>
    <p className="cs">Work from an earlier term that wasn’t marked, and work you chose not to mark. Nothing here counts towards your marking or sends reminders.</p>
    <ul className="mk-arch-list">{items.map((a) => <li key={a.cw}><div className="t"><b>{a.title}</b><span>{a.cls}{a.toMark ? ` · ${a.toMark} handed in, not marked` : ""}{a.due ? ` · due ${dm(a.due)}` : ""}</span></div>
      {a.resolvedAt ? <><span className="pill mute" title={a.note ?? undefined}>Resolved{a.note ? `: ${a.note}` : ""}</span>
        <form action={resolveWorkAction}><input type="hidden" name="cw" value={a.cw} /><input type="hidden" name="on" value="0" /><button className="abtn sm" type="submit">Put back</button></form></>
        : <span className="pill mute">Earlier term</span>}</li>)}</ul>
  </details>;
}
