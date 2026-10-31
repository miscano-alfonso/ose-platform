import type { ClassWork } from "@/lib/teacher-area";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
const LABEL = { done: ["Handed in", "good"], marked: ["Marked", "good"], missing: ["Missing", "bad"], todo: ["To do", ""] } as const;

/** The class's Google Classroom assignments (31 Oct): newest first, with how many have handed in, and each student's work one click away.
 *  Private comments stay in Classroom (its API doesn't share them), so each student's line opens their work there to read and reply. */
export function ClassWorkList({ work, classroom }: { work: ClassWork[]; classroom: string | null }) {
  return <section className="cw-sec" id="assignments">
    <div className="top" style={{ marginTop: 28 }}><div><h2 className="cw-h">Assignments</h2>
      <div className="sub">From Google Classroom, updated every few hours. Open a student’s work to read and reply to their private comments in Classroom.</div></div>
      <span className="grow" />{classroom && <div className="acts"><a className="abtn sm" href={classroom} target="_blank" rel="noopener">Open Classroom</a></div>}</div>
    {!work.length ? <p className="empty">{classroom ? "No assignments set in Classroom yet." : "This class isn’t linked to a Google Classroom yet."}</p>
    : <div className="cw-list">{work.map((w) => {
      const total = w.subs.length, overdue = !!w.due_at && new Date(w.due_at) < new Date();
      return <details key={w.id} className="cw-row">
        <summary>
          <span className="cw-t"><b>{w.title}</b><span className="muted">{w.due_at ? `${overdue ? "Was due" : "Due"} ${when(w.due_at)}` : "No due date"}{w.max_points ? ` · out of ${w.max_points}` : ""}</span></span>
          <span className="cw-n">
            <span className="pill good" title="Handed in or marked">{w.done + w.marked}/{total} in</span>
            {w.marked > 0 && <span className="pill">{w.marked} marked</span>}
            {w.missing > 0 && <span className="pill bad">{w.missing} missing</span>}
            {w.late > 0 && <span className="pill warn">{w.late} late</span>}
          </span>
          {w.link && <a className="abtn sm" href={w.link} target="_blank" rel="noopener">Open</a>}
          <span className="cw-chev" aria-hidden="true">▾</span>
        </summary>
        <ul className="cw-subs">{w.subs.map((s) => { const [l, tone] = LABEL[s.status];
          return <li key={s.id}><b>{s.name}</b>
            <span className="cw-st"><span className={`pill ${tone}`}>{l}</span>{s.late && <span className="pill warn">Late</span>}
              {s.points !== null && <span className="muted">{s.points}{w.max_points ? `/${w.max_points}` : ""}</span>}
              {s.at && <span className="muted">{day(s.at)}</span>}</span>
            {s.link ? <a className="abtn sm" href={s.link} target="_blank" rel="noopener" title="Their work and private comments, in Classroom">Work &amp; comments</a> : <span />}
          </li>; })}</ul>
      </details>; })}</div>}
  </section>;
}
