import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { getRegister, lessonJoins } from "@/lib/ops";
import { correctMarksAction, cancelLessonAction, refreshJoinsAction } from "../../../actions";
import { AutoRefresh } from "../../../AutoRefresh";
import { sendLabels } from "@/lib/send";
import { liveArrivals, studentFirsts } from "@/lib/meet-live";

const LABEL: Record<string, string> = { present: "Present", late: "Late", absent: "Absent", approved_absence: "Approved absence" };
const longDay = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

export default async function RegisterPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string; fix?: string; back?: string }> }) {
  const [{ id }, sp, me] = await Promise.all([params, searchParams, requireViewer()]);
  const r = await getRegister(id);
  if (!r || (me.role !== "school_admin" && r.teacher_user !== me.id)) notFound();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const future = r.lesson_date > today;
  const now = Date.now(), st = Date.parse(r.start_at), en = Date.parse(r.end_at);
  const live = r.status !== "cancelled" && now >= st - 30 * 60e3 && now <= en + 15 * 60e3;
  const j = r.lesson_date <= today ? await lessonJoins(r.id) : { joins: [], unknown: [], grace: 5 };
  const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  // 3 Nov: during (and just after) the lesson, who is in the Meet right now, from the Google Meet API: Meet's log only has people once they leave
  const firsts = live || (now >= st - 30 * 60e3 && now <= en + 90 * 60e3) ? await studentFirsts(r.students.map((s) => s.id)) : new Map<string, string>();
  const lv = firsts.size ? await liveArrivals(r.id, r.link, r.start_at, r.students.map((s) => ({ id: s.id, name: s.name, first: firsts.get(s.id) ?? s.name.split(" ")[0] }))) : null;
  const liveOf = (id: string) => (lv?.ok ? lv.matched[id] : undefined);
  const SRC: Record<string, string> = { meet_api: "Meet", attendlist: "Meet", checkin: "Join button", zoom: "Zoom" };
  const arrivals = r.students.map((s) => {
    const x = j.joins.find((y) => y.student_id === s.id), lp = x ? undefined : liveOf(s.id);
    const first = x?.first ?? lp?.joined;
    const lateBy = first ? Math.round((Date.parse(first) - st) / 60e3) : 0;
    const state = first ? (lateBy > j.grace ? "late" : "in") : s.notice ? "away" : now > st + j.grace * 60e3 ? "missing" : "waiting";
    return { s, x, lp, lateBy, state };
  });
  const others = lv?.ok ? lv.participants.filter((p) => !Object.values(lv.matched).includes(p) && p.name !== r.teacher) : [];
  const order: Record<string, number> = { missing: 0, late: 1, in: 2, waiting: 3, away: 4 };
  const joinedN = arrivals.filter((a) => a.x || a.lp).length;
  // back to wherever the lesson was opened from (the timetable, tasters, a class…), else Attendance or My day
  const back = /^\/admin\/[A-Za-z0-9/_-]*(\?[A-Za-z0-9=&_%.-]*)?$/.test(sp.back ?? "") && !(sp.back ?? "").startsWith("/admin/register") ? sp.back! : null;
  const backHref = back ?? (me.role === "school_admin" ? "/admin/attendance" : "/admin/teacher");
  const bq = back ? `back=${encodeURIComponent(back)}` : "";
  const backInput = back ? <input type="hidden" name="back" value={back} /> : null;
  // 2 Nov: attendance comes from Google Meet's log. A teacher only corrects a mark now and then: "Correct a mark" opens a
  // choice on each row and asks why; nothing here is a daily task.
  const started = now >= st, fix = sp.fix === "1" && started && r.status !== "cancelled" && !me.viewing;
  const fromJoins: Record<string, string> = { in: "present", late: "late", missing: "absent", away: "approved_absence", waiting: "absent" };
  const corrected = (s: (typeof r.students)[number]) => s.mark_source === "teacher" || s.mark_source === "admin";
  return <>
    <p className="backlink"><a className="abtn sm" href={backHref}>← Back</a></p>
    <div className="top"><div><h1>{r.name}<span className="h1-code">{r.code}</span></h1>
      <div className="sub">{longDay(r.lesson_date)}, {r.starts_at}–{r.ends_at}{r.teacher ? ` · ${r.teacher}` : ""}</div></div>
      <span className="grow" />{r.status === "cancelled" ? <span className="pill bad">Cancelled</span> : now >= st && now <= en ? <span className="pill good">Live now</span>
        : now > en ? <span className="pill warn">Finished</span> : <span className="pill info">Scheduled</span>}</div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    {r.note && <p className="note">{r.note}</p>}
    {/* 31 Oct: SEND in a second column beside who's expected and the register (one column on narrow screens) */}
    <div className={r.students.some((s) => s.send) || r.tasters.length ? "reg-cols" : undefined}><div className="reg-main">
    {live && !fix && <AutoRefresh seconds={45} />}
    {r.status !== "cancelled" && (future
      ? <section className="card"><h2>Who’s expected</h2><p className="cs">{r.students.length} student{r.students.length === 1 ? "" : "s"}{r.tasters.length ? ` and ${r.tasters.length} taster${r.tasters.length === 1 ? "" : "s"}` : ""}. On the day, arrivals show here as students join; attendance is taken from Google Meet.</p>
          <div className="arr">{r.students.map((s) => <div key={s.id} className={`arr-row ${s.notice ? "away" : "waiting"}`}><b>{s.name}{s.leaving && <span className="pill mute arr-leave">{s.leaving}</span>}</b><span>{s.notice ? `Away: ${s.notice}` : "Expected"}</span><span className="arr-t" />{s.send && <span className="arr-needs">{sendLabels(s.needs, s.send_details).map((n) => <span key={n} className="pill warn">{n}</span>)}</span>}</div>)}
            {r.tasters.map((t) => <div key={t.id} className="arr-row waiting"><b>{t.child}</b><span>Taster</span></div>)}</div></section>
      : <section className={`card${now > en ? " lesson-done" : now >= st ? " lesson-live" : ""}`} data-lesson={`${r.name}, ${r.starts_at}`}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}><h2 style={{ margin: 0 }}>{live ? "Arrivals" : "Who joined"}</h2>
            {live && <span className={`dx-live${now > en ? " done" : now < st ? " soon" : ""}`}>{now < st ? "Starting soon" : now <= en ? "Live now" : "Just finished"}</span>}
            <span className="pill info">{joinedN} of {r.students.length} joined</span><span style={{ flex: 1 }} />
            {started && !fix && r.status !== "cancelled" && !me.viewing && <a className="abtn sm" href={`/admin/register/${r.id}?fix=1${bq ? "&" + bq : ""}`} title="Only if Meet got someone wrong, e.g. they joined on another account">Correct a mark</a>}
            <form action={refreshJoinsAction}><input type="hidden" name="id" value={r.id} />{backInput}<button className="abtn sm" type="submit">Check Meet now</button></form></div>
          <form action={correctMarksAction} id="fix-form"><input type="hidden" name="id" value={r.id} />{backInput}
          <div className="arr" style={{ marginTop: 12 }}>{arrivals.sort((a, b) => order[a.state] - order[b.state]).map(({ s, x, lp, lateBy, state }) => <div key={s.id} className={`arr-row ${corrected(s) && s.mark ? ({ present: "in", late: "late", absent: "missing", approved_absence: "away" } as Record<string, string>)[s.mark] ?? state : state}${fix ? " fixing" : ""}`}>
            <b>{s.name}{s.leaving && <span className="pill mute arr-leave">{s.leaving}</span>}</b>
            <span className="arr-st">{corrected(s) && s.mark ? `${LABEL[s.mark]} · corrected` : state === "in" ? "On time" : state === "late" ? `Late · ${lateBy} min` : state === "away" ? `Away: ${s.notice}` : state === "missing" ? "Not joined" : "Not joined yet"}</span>
            <span className="arr-t">{corrected(s) ? <>By {s.corrected_by_name ?? "the school"}{s.correction_note ? `: ${s.correction_note}` : ""}</> : x ? <>Joined {hm(x.first)}{x.last ? ` · left ${hm(x.last)}` : live ? " · still in" : ""} · {x.minutes} min{x.joins > 1 ? ` · ${x.joins} joins` : ""} · {x.sources.map((y) => SRC[y] ?? y).join(", ")}</>
              : lp ? <>Joined {hm(lp.joined)}{lp.left ? ` · left ${hm(lp.left)}` : " · in the lesson now"} · Meet</> : ""}</span>
            {s.send && !fix && <span className="arr-needs">{sendLabels(s.needs, s.send_details).map((n) => <span key={n} className="pill warn">{n}</span>)}</span>}
            {fix && <input type="hidden" name={`o_${s.id}`} value={s.mark ?? fromJoins[state]} />}
            {fix && <select name={`m_${s.id}`} className="mini arr-fix" defaultValue={s.mark ?? fromJoins[state]} aria-label={`${s.name}: mark`}>
              {(["present", "late", "absent", "approved_absence"] as const).map((m) => <option key={m} value={m}>{LABEL[m]}</option>)}</select>}
          </div>)}
            {r.tasters.map((t) => <div key={t.id} className={`arr-row ${t.status === "attended" ? "in" : "waiting"}`}><b>{t.child}</b><span className="arr-st">Taster{t.status === "attended" ? " · came" : ""}</span><span className="arr-t" /></div>)}</div>
          {fix && <div className="fix-bar"><label className="fld">Why are you correcting it?<input name="reason" required minLength={3} maxLength={300} placeholder="e.g. Joined on her mum’s account" /></label>
            <button className="abtn pri" type="submit">Save corrections</button><a className="abtn" href={`/admin/register/${r.id}${bq ? "?" + bq : ""}`}>Cancel</a>
            <p className="muted" style={{ fontSize: 13.5, margin: 0, flexBasis: "100%" }}>Only marks you change are saved, with your name and reason. Google Meet won’t change them back.</p></div>}
          </form>
          {others.length > 0 && <p className="note" style={{ marginTop: 10 }}>Also in the call: {others.map((o) => `${o.name}${o.left ? "" : " (in now)"}`).join(", ")}.</p>}
          {/* 3 Nov: why the live view has nobody, for the office (also while Viewing as a teacher) */}
          {lv && (me.role === "school_admin" || me.viewing) && (!lv.ok || lv.calls === 0) && <p className="note" style={{ marginTop: 10 }}>
            <b>Live view (office only):</b> {!lv.ok ? (lv.reason === "reconnect" ? <>the recordings account (ose@) hasn’t been given the Google Meet permission. <a href="/admin/meet-api?action=login&what=rec"><b>Connect ose@ again</b></a>, sign in as ose@ and tick every box Google shows.</>
              : lv.reason === "none" ? "the recordings account (ose@) isn’t connected (Admin → Recordings → Settings)."
              : lv.reason === "no_code" ? "this class has no Google Meet link saved, so there’s no call to look for."
              : `Google answered with an error: ${lv.message ?? "unknown"}.`)
              : `Google Meet shows no call on this class’s link (${lv.code}) since an hour before the lesson that ose@ can see. The lesson may be running on a different Meet link (for example one made in Classroom or a teacher’s own calendar), which only its own organiser can read.`}</p>}
          {j.unknown.length > 0 && <p className="note" style={{ marginTop: 10 }}>Also joined, not matched to a student: {j.unknown.map((u) => `${u.name} (${hm(u.at)})`).join(", ")}. Match them under Attendance → Check joins.</p>}
          <p className="muted" style={{ fontSize: 13.5, margin: "10px 0 0" }}>{lv?.ok ? "Who’s in the call shows live from Google Meet. " : ""}Attendance is taken from Google Meet’s log, which reaches the site a few minutes to an hour after students leave the call (Check Meet now fetches it); Zoom’s after the lesson. {live && !fix ? "This page updates itself every 45 seconds." : ""}</p>
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
      <input type="hidden" name="id" value={r.id} />{backInput}
      <label className="fld">Cancel this lesson — reason<input name="note" required maxLength={200} placeholder="e.g. Teacher ill" /></label>
      <button className="abtn" type="submit">Cancel lesson</button></form>}
  </>;
}
