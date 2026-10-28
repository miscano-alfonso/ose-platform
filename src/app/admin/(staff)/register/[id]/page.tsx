import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { getRegister, lessonJoins } from "@/lib/ops";
import { saveRegisterAction, cancelLessonAction, refreshJoinsAction } from "../../../actions";
import { AutoRefresh } from "../../../AutoRefresh";
import { joinLabel } from "@/lib/video";

const LABEL: Record<string, string> = { present: "Present", late: "Late", absent: "Absent", approved_absence: "Approved absence" };
const longDay = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

export default async function RegisterPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const [{ id }, sp, me] = await Promise.all([params, searchParams, requireViewer()]);
  const r = await getRegister(id);
  if (!r || (me.role !== "school_admin" && r.teacher_user !== me.id)) notFound();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const future = r.lesson_date > today;
  const now = Date.now(), st = Date.parse(r.start_at), en = Date.parse(r.end_at);
  const live = r.status !== "cancelled" && now >= st - 30 * 60e3 && now <= en + 15 * 60e3;
  const j = r.lesson_date <= today ? await lessonJoins(r.id) : { joins: [], unknown: [], grace: 5 };
  const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  const SRC: Record<string, string> = { meet_api: "Meet", attendlist: "Meet", checkin: "Join button", zoom: "Zoom" };
  const arrivals = r.students.map((s) => {
    const x = j.joins.find((y) => y.student_id === s.id);
    const lateBy = x ? Math.round((Date.parse(x.first) - st) / 60e3) : 0;
    const state = x ? (lateBy > j.grace ? "late" : "in") : s.notice ? "away" : now > st + j.grace * 60e3 ? "missing" : "waiting";
    return { s, x, lateBy, state };
  });
  const order: Record<string, number> = { missing: 0, late: 1, in: 2, waiting: 3, away: 4 };
  const joinedN = arrivals.filter((a) => a.x).length;
  const backHref = me.role === "school_admin" ? "/admin/attendance" : "/admin/teacher";
  return <>
    <p className="backlink"><a href={backHref}>← Back</a></p>
    <div className="top"><div><h1>{r.name}<span className="h1-code">{r.code}</span></h1>
      <div className="sub">{longDay(r.lesson_date)}, {r.starts_at}–{r.ends_at}{r.teacher ? ` · ${r.teacher}` : ""}</div></div>
      <span className="grow" />{r.status === "taught" ? <span className="pill good">Taught</span> : r.status === "cancelled" ? <span className="pill bad">Cancelled</span> : <span className="pill info">Scheduled</span>}</div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    {r.note && <p className="note">{r.note}</p>}
    {live && <AutoRefresh seconds={45} />}
    {r.status !== "cancelled" && (future
      ? <section className="card"><h2>Who’s expected</h2><p className="cs">{r.students.length} student{r.students.length === 1 ? "" : "s"}{r.tasters.length ? ` and ${r.tasters.length} taster${r.tasters.length === 1 ? "" : "s"}` : ""}. On the day, arrivals show here as students join, and the register opens below.</p>
          <div className="arr">{r.students.map((s) => <div key={s.id} className={`arr-row ${s.notice ? "away" : "waiting"}`}><b>{s.name}</b><span>{s.notice ? `Away: ${s.notice}` : "Expected"}</span></div>)}
            {r.tasters.map((t) => <div key={t.id} className="arr-row waiting"><b>{t.child}</b><span>Taster</span></div>)}</div></section>
      : <section className="card" data-lesson={`${r.name}, ${r.starts_at}`}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}><h2 style={{ margin: 0 }}>{live ? "Arrivals" : "Who joined"}</h2>
            {live && <span className="dx-live">{now < st ? "Starting soon" : now <= en ? "Live now" : "Just finished"}</span>}
            <span className="pill info">{joinedN} of {r.students.length} joined</span><span style={{ flex: 1 }} />
            {r.link && live && <a className="abtn sm pri" href={r.link} target="_blank" rel="noopener">{joinLabel(r.link)}</a>}
            <form action={refreshJoinsAction}><input type="hidden" name="id" value={r.id} /><button className="abtn sm" type="submit">Check Meet now</button></form></div>
          <div className="arr" style={{ marginTop: 12 }}>{arrivals.sort((a, b) => order[a.state] - order[b.state]).map(({ s, x, lateBy, state }) => <div key={s.id} className={`arr-row ${state}`}>
            <b>{s.name}</b>
            <span className="arr-st">{state === "in" ? "On time" : state === "late" ? `Late · ${lateBy} min` : state === "away" ? `Away: ${s.notice}` : state === "missing" ? "Not joined" : "Not joined yet"}</span>
            <span className="arr-t">{x ? <>Joined {hm(x.first)}{x.last ? ` · left ${hm(x.last)}` : live ? " · still in" : ""} · {x.minutes} min{x.joins > 1 ? ` · ${x.joins} joins` : ""} · {x.sources.map((y) => SRC[y] ?? y).join(", ")}</> : ""}</span>
          </div>)}
            {r.tasters.map((t) => <div key={t.id} className={`arr-row ${t.status === "attended" ? "in" : "waiting"}`}><b>{t.child}</b><span className="arr-st">Taster{t.status === "attended" ? " · came" : ""}</span><span className="arr-t" /></div>)}</div>
          {j.unknown.length > 0 && <p className="note" style={{ marginTop: 10 }}>Also joined, not matched to a student: {j.unknown.map((u) => `${u.name} (${hm(u.at)})`).join(", ")}. Match them under Attendance → Check joins.</p>}
          <p className="muted" style={{ fontSize: 13.5, margin: "10px 0 0" }}>Join-button check-ins show straight away. Google Meet’s own log reaches the site a few minutes to an hour later (press Check Meet now); Zoom’s after the lesson. {live ? "This page updates itself every 45 seconds." : ""}</p>
        </section>)}
    {r.status === "cancelled" ? <p className="empty">This lesson was cancelled.</p> : future ? null :
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
