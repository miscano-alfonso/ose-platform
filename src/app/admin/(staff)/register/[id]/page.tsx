import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { getRegister } from "@/lib/ops";
import { saveRegisterAction, cancelLessonAction } from "../../../actions";

const LABEL: Record<string, string> = { present: "Present", late: "Late", absent: "Absent", approved_absence: "Approved absence" };
const longDay = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

export default async function RegisterPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const [{ id }, sp, me] = await Promise.all([params, searchParams, requireViewer()]);
  const r = await getRegister(id);
  if (!r || (me.role !== "school_admin" && r.teacher_user !== me.id)) notFound();
  const future = r.lesson_date > new Date().toISOString().slice(0, 10);
  const backHref = me.role === "school_admin" ? "/admin/attendance" : "/admin/teacher";
  return <>
    <p><a href={backHref}>← Back</a></p>
    <div className="top"><div><h1>{r.name} <span className="muted" style={{ fontWeight: 400 }}>{r.code}</span></h1>
      <div className="sub">{longDay(r.lesson_date)}, {r.starts_at}–{r.ends_at}{r.teacher ? ` · ${r.teacher}` : ""}</div></div>
      <span className="grow" />{r.status === "taught" ? <span className="pill good">Taught</span> : r.status === "cancelled" ? <span className="pill bad">Cancelled</span> : <span className="pill info">Scheduled</span>}</div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    {r.note && <p className="note">{r.note}</p>}
    {r.status === "cancelled" ? <p className="empty">This lesson was cancelled.</p> : future ? <p className="empty">The register opens on the day of the lesson.</p> :
    <form action={saveRegisterAction} className="card">
      <input type="hidden" name="id" value={r.id} />
      {r.students.length === 0 && <p className="empty">No students in this class yet.</p>}
      {r.students.map((s) => <fieldset key={s.id} className="regrow">
        <legend><b>{s.name}</b>{s.notice && <span className="pill info">Parent reported: {s.notice}</span>}</legend>
        {(["present", "late", "absent", "approved_absence"] as const).map((m) => <label key={m} className={`regopt r-${m}`}>
          <input type="radio" name={`m_${s.id}`} value={m} defaultChecked={(s.mark ?? (s.notice ? "approved_absence" : "present")) === m} />{LABEL[m]}</label>)}
      </fieldset>)}
      {r.tasters.map((t) => <fieldset key={t.id} className="regrow">
        <legend><b>{t.child}</b> <span className="pill mute">Taster</span></legend>
        {(["attended", "no_show"] as const).map((m) => <label key={m} className="regopt">
          <input type="radio" name={`t_${t.id}`} value={m} defaultChecked={(t.status === "booked" ? "attended" : t.status) === m} />{m === "attended" ? "Attended" : "Didn’t come"}</label>)}
      </fieldset>)}
      <label className="fld" style={{ marginTop: 12 }}>Lesson note (optional)<input name="note" maxLength={300} placeholder="e.g. Covered by Jade" defaultValue={r.note ?? ""} /></label>
      <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "12px 0" }}><input type="checkbox" name="taught" defaultChecked /> This lesson was taught</label>
      <button className="abtn pri" type="submit">{r.status === "taught" ? "Update register" : "Save register"}</button>
    </form>}
    {me.role === "school_admin" && r.status === "scheduled" && <form action={cancelLessonAction} className="eform" style={{ marginTop: 16 }}>
      <input type="hidden" name="id" value={r.id} />
      <label className="fld">Cancel this lesson — reason<input name="note" required maxLength={200} placeholder="e.g. Teacher ill" /></label>
      <button className="abtn" type="submit">Cancel lesson</button></form>}
  </>;
}
