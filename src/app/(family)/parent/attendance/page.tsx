import { requireParent } from "@/lib/family-auth";
import { kids, parentAttendance, REASONS } from "@/lib/family";
import { reportAbsenceAction, cancelAbsenceAction } from "../../actions";
import { Head, Flash, dm, dlong, MARK } from "../../fmt";

export default async function ParentAttendance({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; kid?: string }> }) {
  const [sp, f] = await Promise.all([searchParams, requireParent()]);
  const [ks, a] = await Promise.all([kids(f.id), parentAttendance(f.id)]);
  const kid = ks.find((k) => k.id === sp.kid) ?? ks[0];
  const up = a.upcoming.filter((l) => l.student_id === kid?.id), days = [...new Set(up.map((l) => l.date))];
  return <>
    <Head title="Attendance" sub="Your children’s attendance, and absences you’ve told us about" />
    <Flash sp={sp} />
    <div className="dgrid">{ks.map((st) => { const m = a.marks.filter((x) => x.student_id === st.id), held = m.filter((x) => x.mark !== "approved_absence").length,
      att = m.filter((x) => x.mark === "present" || x.mark === "late").length, appr = m.filter((x) => x.mark === "approved_absence").length;
      return <section className="card" key={st.id} style={{ margin: 0 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}><h2 style={{ margin: 0 }}>{st.first}</h2>{st.att != null && <span className={`pill ${st.att < 50 ? "warn" : "good"}`}>Attendance {st.att}%</span>}</div>
        <p className="cs" style={{ marginTop: 6 }}>{m.length ? `${att} of ${held} lessons attended this term · ${appr} approved absence${appr === 1 ? "" : "s"} · ${held - att} unexplained` : "No lessons yet this term."}</p>
        {m.slice(0, 8).map((x, i) => <div className="li" key={i}><span className={`mark ${MARK[x.mark]?.[1]}`}>{MARK[x.mark]?.[2]}{x.early ? "↘" : ""}</span>
          <div className="t"><b>{x.class} · {dm(x.date)} {x.time}</b><span>{MARK[x.mark]?.[0]}{x.early ? " · left early" : ""}</span></div></div>)}
      </section>; })}</div>

    {kid && <section className="card" style={{ marginTop: 16 }}><h2>Report an absence</h2><p className="cs">Tell us in advance and the lesson is recorded as an approved absence, so it doesn’t count against attendance. Teachers are told before the lesson.</p>
      {ks.length > 1 && <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>{ks.map((k) => <a key={k.id} className={`abtn sm${k.id === kid.id ? " pri" : ""}`} href={`/parent/attendance?kid=${k.id}`}>{k.first}</a>)}</div>}
      <form action={reportAbsenceAction} style={{ display: "grid", gap: 10 }}><input type="hidden" name="student" value={kid.id} />
        <b style={{ fontSize: 15 }}>Which lessons will {kid.first} miss? (next 4 weeks)</b>
        <div style={{ maxHeight: 300, overflow: "auto", border: "1px solid var(--line)", borderRadius: 10, padding: "4px 10px" }}>
          {days.length === 0 ? <p className="empty">No lessons coming up.</p> : days.map((d) => <div className="li" key={d} style={{ alignItems: "flex-start" }}><span className="mono" style={{ width: 96, flex: "none" }}>{dlong(d)}</span>
            <div style={{ display: "grid", gap: 4 }}>{up.filter((l) => l.date === d).map((l) => <label key={l.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" name="lesson" value={l.id} disabled={!!l.absent} defaultChecked={!!l.absent} /> {l.time} · {l.class}{l.absent && <span className="pill mute">Already reported</span>}</label>)}</div></div>)}</div>
        <div className="eform"><label className="fld">Reason<select name="reason">{REASONS.map((r) => <option key={r}>{r}</option>)}</select></label>
          <label className="fld">Anything the teacher should know? (optional)<input name="note" maxLength={500} placeholder="e.g. please share the lesson notes" style={{ width: 320 }} /></label></div>
        <div><button className="abtn pri" type="submit">Report absence</button></div></form></section>}

    <section className="card"><h2>Absences you’ve reported</h2>
      <div className="tw" style={{ border: 0, marginBottom: 0 }}><table><thead><tr><th>Lesson</th><th>Child</th><th>Class</th><th>Reason</th><th>Status</th><th /></tr></thead><tbody>
        {a.notices.length === 0 ? <tr><td colSpan={6} className="muted">No absences reported.</td></tr> : a.notices.map((n) => <tr key={n.id}><td><b>{dm(n.date)}</b> {n.time}</td><td>{n.student}</td><td>{n.class}</td>
          <td>{n.reason}{n.note && <><br /><span className="muted">{n.note}</span></>}</td><td><span className={`pill ${n.upcoming ? "info" : "mute"}`}>{n.upcoming ? "Approved · coming up" : "Approved absence"}</span></td>
          <td>{n.upcoming && <form action={cancelAbsenceAction}><input type="hidden" name="id" value={n.id} /><button className="abtn sm" type="submit">Cancel</button></form>}</td></tr>)}
      </tbody></table></div></section>
  </>;
}
