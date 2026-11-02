import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { getRegister, lessonJoins } from "@/lib/ops";
import { correctMarksAction, cancelLessonAction, refreshJoinsAction } from "../../../actions";
import { AutoRefresh } from "../../../AutoRefresh";
import { sendLabels } from "@/lib/send";

const LABEL: Record<string, string> = { present: "Present", late: "Late", absent: "Absent", approved_absence: "Approved absence" };
const longDay = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

export default async function RegisterPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string; fix?: string }> }) {
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
  // 2 Nov: attendance comes from Google Meet's log. A teacher only corrects a mark now and then: "Correct a mark" opens a
  // choice on each row and asks why; nothing here is a daily task.
  const started = now >= st, fix = sp.fix === "1" && started && r.status !== "cancelled" && !me.viewing;
  const fromJoins: Record<string, string> = { in: "present", late: "late", missing: "absent", away: "approved_absence", waiting: "absent" };
  const corrected = (s: (typeof r.students)[number]) => s.mark_source === "teacher" || s.mark_source === "admin";
  return <>
    <p className="backlink"><a className="abtn sm" href={backHref}>← Back</a></p>
    <div className="top"><div><h1>{r.name}<span className="h1-code">{r.code}</span></h1>
      <div className="sub">{longDay(r.lesson_date)}, {r.starts_at}–{r.ends_at}{r.teacher ? ` · ${r.teacher}` : ""}</div></div>
      <span className="grow" />{r.status === "taught" ? <span className="pill good">Taught</span> : r.status === "cancelled" ? <span className="pill bad">Cancelled</span> : <span className="pill info">Scheduled</span>}</div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    {r.note && <p className="note">{r.note}</p>}
    {/* 31 Oct: SEND in a second column beside who's expected and the register (one column on narrow screens) */}
    <div className={r.students.some((s) => s.send) || r.tasters.length ? "reg-cols" : undefined}><div className="reg-main">
    {live && !fix && <AutoRefresh seconds={45} />}
    {r.status !== "cancelled" && (future
      ? <section className="card"><h2>Who’s expected</h2><p className="cs">{r.students.length} student{r.students.length === 1 ? "" : "s"}{r.tasters.length ? ` and ${r.tasters.length} taster${r.tasters.length === 1 ? "" : "s"}` : ""}. On the day, arrivals show here as students join; attendance is taken from Google Meet.</p>
          <div className="arr">{r.students.map((s) => <div key={s.id} className={`arr-row ${s.notice ? "away" : "waiting"}`}><b>{s.name}</b><span>{s.notice ? `Away: ${s.notice}` : "Expected"}</span><span className="arr-t" />{s.send && <span className="arr-needs">{sendLabels(s.needs, s.send_details).map((n) => <span key={n} className="pill warn">{n}</span>)}</span>}</div>)}
            {r.tasters.map((t) => <div key={t.id} className="arr-row waiting"><b>{t.child}</b><span>Taster</span></div>)}</div></section>
      : <section className="card" data-lesson={`${r.name}, ${r.starts_at}`}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}><h2 style={{ margin: 0 }}>{live ? "Arrivals" : "Who joined"}</h2>
            {live && <span className="dx-live">{now < st ? "Starting soon" : now <= en ? "Live now" : "Just finished"}</span>}
            <span className="pill info">{joinedN} of {r.students.length} joined</span><span style={{ flex: 1 }} />
            {started && !fix && r.status !== "cancelled" && !me.viewing && <a className="abtn sm" href={`/admin/register/${r.id}?fix=1`} title="Only if Meet got someone wrong, e.g. they joined on another account">Correct a mark</a>}
            <form action={refreshJoinsAction}><input type="hidden" name="id" value={r.id} /><button className="abtn sm" type="submit">Check Meet now</button></form></div>
          <form action={correctMarksAction} id="fix-form"><input type="hidden" name="id" value={r.id} />
          <div className="arr" style={{ marginTop: 12 }}>{arrivals.sort((a, b) => order[a.state] - order[b.state]).map(({ s, x, lateBy, state }) => <div key={s.id} className={`arr-row ${corrected(s) && s.mark ? ({ present: "in", late: "late", absent: "missing", approved_absence: "away" } as Record<string, string>)[s.mark] ?? state : state}${fix ? " fixing" : ""}`}>
            <b>{s.name}</b>
            <span className="arr-st">{corrected(s) && s.mark ? `${LABEL[s.mark]} · corrected` : state === "in" ? "On time" : state === "late" ? `Late · ${lateBy} min` : state === "away" ? `Away: ${s.notice}` : state === "missing" ? "Not joined" : "Not joined yet"}</span>
            <span className="arr-t">{corrected(s) ? <>By {s.corrected_by_name ?? "the school"}{s.correction_note ? `: ${s.correction_note}` : ""}</> : x ? <>Joined {hm(x.first)}{x.last ? ` · left ${hm(x.last)}` : live ? " · still in" : ""} · {x.minutes} min{x.joins > 1 ? ` · ${x.joins} joins` : ""} · {x.sources.map((y) => SRC[y] ?? y).join(", ")}</> : ""}</span>
            {s.send && !fix && <span className="arr-needs">{sendLabels(s.needs, s.send_details).map((n) => <span key={n} className="pill warn">{n}</span>)}</span>}
            {fix && <input type="hidden" name={`o_${s.id}`} value={s.mark ?? fromJoins[state]} />}
            {fix && <select name={`m_${s.id}`} className="mini arr-fix" defaultValue={s.mark ?? fromJoins[state]} aria-label={`${s.name}: mark`}>
              {(["present", "late", "absent", "approved_absence"] as const).map((m) => <option key={m} value={m}>{LABEL[m]}</option>)}</select>}
          </div>)}
            {r.tasters.map((t) => <div key={t.id} className={`arr-row ${t.status === "attended" ? "in" : "waiting"}`}><b>{t.child}</b><span className="arr-st">Taster{t.status === "attended" ? " · came" : ""}</span><span className="arr-t" /></div>)}</div>
          {fix && <div className="fix-bar"><label className="fld">Why are you correcting it?<input name="reason" required minLength={3} maxLength={300} placeholder="e.g. Joined on her mum’s account" /></label>
            <button className="abtn pri" type="submit">Save corrections</button><a className="abtn" href={`/admin/register/${r.id}`}>Cancel</a>
            <p className="muted" style={{ fontSize: 13.5, margin: 0, flexBasis: "100%" }}>Only marks you change are saved, with your name and reason. Google Meet won’t change them back.</p></div>}
          </form>
          {j.unknown.length > 0 && <p className="note" style={{ marginTop: 10 }}>Also joined, not matched to a student: {j.unknown.map((u) => `${u.name} (${hm(u.at)})`).join(", ")}. Match them under Attendance → Check joins.</p>}
          <p className="muted" style={{ fontSize: 13.5, margin: "10px 0 0" }}>Attendance is taken from Google Meet’s log, which reaches the site a few minutes to an hour after students join (Check Meet now fetches it); Zoom’s after the lesson. {live && !fix ? "This page updates itself every 45 seconds." : ""}</p>
        </section>)}
    {r.status === "cancelled" && <p className="empty">This lesson was cancelled.</p>}
    </div>
    {(r.students.some((s) => s.send) || r.tasters.length > 0) && <div className="reg-side">
    {r.students.some((s) => s.send) && <section className="card send-card"><h2>SEND in this class</h2>
      <p className="cs">Shared by the parents so you can plan for them. Please keep it to yourself.</p>
      {r.students.filter((s) => s.send).map((s) => <div key={s.id} className="li" style={{ alignItems: "flex-start" }}><span className="arr-needs">{sendLabels(s.needs, s.send_details).map((n) => <span key={n} className="pill warn">{n}</span>)}</span>
        <div className="t"><b>{s.name}</b><span>{s.send_details}</span>{s.adjustments && <span><b style={{ fontWeight: 500 }}>What helps:</b> {s.adjustments}</span>}</div></div>)}</section>}
    {r.tasters.length > 0 && <section className="card taster-card"><h2>Tasters</h2>
      <p className="cs">Trying a lesson before they book. Let them in to the Meet with the Google account below and make them welcome.</p>
      {r.tasters.map((t) => <div key={t.id} className="li" style={{ alignItems: "flex-start" }}>
        <div className="t"><b>{t.child}</b>{t.email && <span>{t.email}</span>}{t.message && <span><b style={{ fontWeight: 500 }}>From the parent:</b> {t.message}</span>}</div>
        <span className={`pill ${t.status === "attended" ? "good" : t.status === "no_show" ? "bad" : "info"}`}>{t.status === "attended" ? "Came" : t.status === "no_show" ? "Didn’t come" : "Booked"}</span></div>)}</section>}
    </div>}
    </div>
    {me.role === "school_admin" && r.status === "scheduled" && <form action={cancelLessonAction} className="eform" style={{ marginTop: 16 }}>
      <input type="hidden" name="id" value={r.id} />
      <label className="fld">Cancel this lesson — reason<input name="note" required maxLength={200} placeholder="e.g. Teacher ill" /></label>
      <button className="abtn" type="submit">Cancel lesson</button></form>}
  </>;
}
