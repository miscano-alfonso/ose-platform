import Link from "next/link";
import "./recordings.css";
import { recordingsView, recStatus, recLessons, type RecRow } from "@/lib/recordings";
import { runRecordingsAction, recCfgAction, recLessonAction, editCardAction, approveCardsAction, postAnywayAction, disconnectRecAction, importRecordingsAction } from "../../actions";

export const dynamic = "force-dynamic";
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const iso = (d: Date) => d.toISOString().slice(0, 10);
const dm = (s: string) => new Date(s.slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const when = (s: string) => new Date(s).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const drive = (id: string) => `https://drive.google.com/file/d/${id}/view`;
const CL: Record<string, [string, string]> = { posted: ["good", "In Classroom"], already: ["good", "In Classroom"], waiting: ["warn", "Waiting for the teacher’s post"], error: ["bad", "Classroom error"],
  no_course: ["mute", "No Classroom course"], gave_up: ["bad", "Not posted (no teacher post in 14 days)"], not_needed: ["mute", "—"] };
const CS: Record<string, [string, string]> = { awaiting: ["warn", "Awaiting approval"], queued: ["info", "Approved – queued"], processing: ["info", "Processing…"], done: ["good", "Done ✓"],
  error: ["bad", "Error"], edited: ["warn", "Edited – check the preview"] };

export default async function Recordings({ searchParams }: { searchParams: Promise<{ tab?: string; w?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const tab = ["week", "cards", "look", "settings"].includes(sp.tab ?? "") ? sp.tab! : "week";
  const base = /^\d{4}-\d\d-\d\d$/.test(sp.w ?? "") ? new Date(sp.w + "T12:00:00Z") : new Date();
  const mon = new Date(base); mon.setUTCDate(base.getUTCDate() - ((base.getUTCDay() + 6) % 7)); const fri = new Date(mon); fri.setUTCDate(mon.getUTCDate() + 4);
  const days = DAYS.map((_, i) => { const d = new Date(mon); d.setUTCDate(mon.getUTCDate() + i); return iso(d); });
  const prev = new Date(mon); prev.setUTCDate(mon.getUTCDate() - 7); const next = new Date(mon); next.setUTCDate(mon.getUTCDate() + 7);
  const [{ rows, lessons }, st] = await Promise.all([recordingsView(days[0], days[4]), recStatus()]);
  const all = tab === "settings" ? await recLessons() : [];
  const filed = rows.filter((r) => r.status === "filed");
  const week = filed.filter((r) => r.day >= days[0] && r.day <= days[4]);
  const toApprove = filed.filter((r) => r.card_status === "awaiting" || r.card_status === "edited" || r.card_status === "error");
  const look = rows.filter((r) => ["short", "duplicate", "outside_term", "unfiled"].includes(r.status) || r.over_expected || (r.status === "filed" && ["waiting", "error", "gave_up"].includes(r.classroom)));
  const cards = filed.filter((r) => r.card_status && (r.card_status !== "done" || r.day >= days[0]));
  const TABS: [string, string][] = [["week", "This week"], ["cards", `Title cards${toApprove.length ? ` (${toApprove.length})` : ""}`], ["look", `Needs a look${look.length ? ` (${look.length})` : ""}`], ["settings", "Settings"]];
  // one link per recording, coloured by its Classroom post: green = in Classroom, orange = waiting, red = a problem, plain = filed earlier
  const tone = (r: RecRow) => r.classroom === "posted" || r.classroom === "already" ? "var(--good)" : r.classroom === "waiting" ? "var(--warn)" : ["error", "gave_up", "no_course"].includes(r.classroom) ? "var(--bad)" : "inherit";
  const cell = (r: RecRow) => <div key={r.id} className="rec-cell"><a href={drive(r.file_id)} target="_blank" rel="noopener"
    style={{ color: tone(r), fontWeight: 600, textDecoration: "none" }}>T{r.term_number} Lesson {r.lesson_number}</a>{r.over_expected ? " (check)" : ""}
    <span className="rec-pop" role="tooltip">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={`/admin/recordings-api?thumb=${encodeURIComponent(r.file_id)}`} alt="" loading="lazy" width={320} height={180} />
      <span><b>{r.name ?? `T${r.term_number} Lesson ${r.lesson_number}`}</b>{r.card_title ? <><br />{r.card_title}{r.card_teacher ? ` · ${r.card_teacher}` : ""}</> : null}<br /><span style={{ color: tone(r) }}>{CL[r.classroom]?.[1] ?? ""}</span>{r.classroom_note && r.classroom !== "not_needed" ? <span className="muted"> · {r.classroom_note}</span> : null}</span></span></div>;
  return <>
    <div className="top"><div><h1>Recordings</h1><div className="sub">Lesson recordings from Google Meet: renamed, filed in their subject folder, posted to the class’s Classroom, with a title card added. Replaces the “_Recordings” sheet’s script.</div></div>
      <span className="grow" />{st.connected && <form action={runRecordingsAction}><button className="abtn pri" type="submit">Run now</button></form>}</div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    {st.connected && st.cfg.mode !== "live" && <p className="note msg"><b>Watch only.</b> This page reads your Drive and Classroom to show live recordings, but changes nothing: the Apps Script still renames, files and posts them. Switch to “Do the work” under Settings when the new site launches (and delete the Apps Script triggers then).</p>}
    {!st.connected && tab !== "settings" && <p className="note msg">Connect the recordings account (ose@) under <Link href="/admin/recordings?tab=settings">Settings</Link> to start.</p>}
    <div className="tiles">
      <div className="tile"><span className="k">Recorded this week</span><span className="v">{week.length}</span><span className="h">{dm(days[0])} – {dm(days[4])}</span></div>
      <div className={`tile${filed.some((r) => r.classroom === "waiting") ? " alert" : ""}`}><span className="k">Waiting for a Classroom post</span><span className="v">{filed.filter((r) => r.classroom === "waiting").length}</span><span className="h">retried for 14 days</span></div>
      <div className="tile"><span className="k">Title cards to approve</span><span className="v">{toApprove.length}</span><span className="h">{st.cfg.autoCards ? "automatic for new recordings" : "approval needed"}</span></div>
      <div className={`tile${look.length ? " alert" : ""}`}><span className="k">Needs a look</span><span className="v">{look.length}</span><span className="h">short, duplicates, checks</span></div>
    </div>
    <div className="segl" role="tablist" style={{ marginBottom: 14 }}>{TABS.map(([k, l]) => <Link key={k} href={`/admin/recordings?tab=${k}${sp.w ? `&w=${sp.w}` : ""}`} aria-current={tab === k ? "true" : undefined}>{l}</Link>)}</div>

    {tab === "week" && <>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}><Link className="abtn sm" href={`/admin/recordings?w=${iso(prev)}`}>← Previous week</Link>
        <b>{dm(days[0])} – {dm(days[4])}</b><Link className="abtn sm" href={`/admin/recordings?w=${iso(next)}`}>Next week →</Link>{sp.w && <Link className="lnk" href="/admin/recordings">This week</Link>}</div>
      <div className="tw rec-grid"><table><thead><tr><th>Lesson</th>{days.map((d) => <th key={d}>{dm(d)}</th>)}<th>Meet code</th></tr></thead><tbody>
        {lessons.map((l) => <tr key={l.id}><td><b>{l.name}</b>{l.kind === "one" && <span className="muted"> · 1:1</span>}</td>
          {days.map((d) => <td key={d}>{filed.filter((r) => r.lesson_id === l.id && r.day === d).sort((a, b) => (a.lesson_number ?? 0) - (b.lesson_number ?? 0)).map(cell)}</td>)}
          <td className="mono muted" style={{ fontSize: 12.5 }}>{l.meet_code}</td></tr>)}
      </tbody></table></div>
      <p className="note"><span style={{ color: "var(--good)", fontWeight: 600 }}>Green</span>: in Classroom · <span style={{ color: "var(--warn)", fontWeight: 600 }}>Orange</span>: waiting for the teacher’s lesson post · <span style={{ color: "var(--bad)", fontWeight: 600 }}>Red</span>: not posted (see Needs a look). Each opens the recording in Drive; hover for details. {st.run.at ? <>Last run {when(st.run.at)}{st.run.by && st.run.by !== "auto" ? ` by ${st.run.by}` : ""}{st.run.error ? <span className="pill bad" style={{ marginLeft: 6 }}>{st.run.error}</span> : null}.</> : "Not run yet."} Runs every 15 minutes while the admin is open, and every morning.</p>
    </>}

    {tab === "cards" && <>
      {toApprove.length > 1 && <form action={approveCardsAction} style={{ marginBottom: 12 }}>{toApprove.filter((r) => r.fresh && r.has_preview).map((r) => <input key={r.id} type="hidden" name="id" value={r.id} />)}
        <button className="abtn pri" type="submit">Approve all {toApprove.filter((r) => r.fresh && r.has_preview).length} with a preview</button></form>}
      {cards.length === 0 ? <p className="empty">No title cards this week.</p> : <div className="ds-cards">{cards.map((r) => <section key={r.id} className="card" style={{ display: "grid", gridTemplateColumns: "minmax(0,320px) minmax(0,1fr)", gap: 16, alignItems: "start" }}>
        <div>{r.has_preview ? <img src={`/admin/recordings-api?id=${r.id}&k=${encodeURIComponent((r.card_title ?? "") + (r.card_teacher ?? ""))}`} alt="Title card preview" style={{ width: "100%", borderRadius: 8, border: "1px solid var(--line)" }} />
          : <div className="muted" style={{ aspectRatio: "16/9", display: "grid", placeItems: "center", background: "var(--soft)", borderRadius: 8 }}>Preview on the next run</div>}</div>
        <div><div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><b>{r.card_label}</b><span className="muted">{r.card_term_lesson} · {r.card_date}</span>
          {r.card_status && <span className={`pill ${CS[r.card_status]?.[0] ?? "mute"}`}>{CS[r.card_status]?.[1] ?? r.card_status}</span>}</div>
          {r.card_note && <p className="note" style={{ margin: "6px 0" }}>{r.card_note}</p>}
          {r.card_status !== "processing" && <form action={editCardAction} className="eform" style={{ marginTop: 8 }}><input type="hidden" name="id" value={r.id} />
            <label className="fld">Lesson title<input name="title" defaultValue={r.card_title ?? ""} style={{ width: 280 }} /></label>
            <label className="fld">Teacher<input name="teacher" defaultValue={r.card_teacher ?? ""} style={{ width: 180 }} /></label>
            <button className="abtn" type="submit">{r.card_status === "done" ? "Change and redo" : "Update preview"}</button></form>}
          {(r.card_status === "awaiting" || r.card_status === "edited" || r.card_status === "error") && r.has_preview && <form action={approveCardsAction} style={{ marginTop: 8 }}><input type="hidden" name="id" value={r.id} /><button className="abtn pri sm" type="submit">Approve</button></form>}
          <p className="note" style={{ marginTop: 8 }}><a href={drive(r.file_id)} target="_blank" rel="noopener">Open the recording</a> · the card is added to the start of the video in the same file; the original stays in Drive’s version history.</p></div>
      </section>)}</div>}
    </>}

    {tab === "look" && (look.length === 0 ? <p className="empty">Nothing needs a look.</p> : <div className="tw"><table><thead><tr><th>Recorded</th><th>Lesson</th><th>What</th><th>File</th><th /></tr></thead><tbody>
      {look.map((r) => <tr key={r.id}><td>{when(r.recorded_at)}</td><td>{r.lesson ?? "—"}{r.lesson_number ? ` · T${r.term_number} Lesson ${r.lesson_number}` : ""}</td>
        <td>{r.status === "short" ? <><span className="pill warn">Too short</span> {Math.round(r.size_bytes / 1024)} KB, moved to “Flagged - Short Recordings”. Not numbered or posted.</>
          : r.status === "duplicate" ? <><span className="pill warn">Second video</span> the larger one was used; this one has “(check duplicate)” added.</>
          : r.status === "outside_term" ? <><span className="pill mute">Outside term dates</span> left in the Meet folder.</>
          : r.status === "unfiled" ? <><span className="pill bad">No subject folder</span> renamed but left in the Meet folder: add the folder under Settings.</>
          : r.over_expected ? <><span className="pill warn">More lessons than expected</span> the name ends “(check - exceeds expected weekly count)”.</>
          : <><span className={`pill ${CL[r.classroom]?.[0]}`}>{CL[r.classroom]?.[1]}</span> {r.classroom_note}</>}</td>
        <td><a href={drive(r.file_id)} target="_blank" rel="noopener">{r.name ?? "Open"}</a></td>
        <td>{r.status === "filed" && ["waiting", "error", "gave_up"].includes(r.classroom) && <form action={postAnywayAction}><input type="hidden" name="id" value={r.id} /><button className="abtn sm" type="submit" title="For a teacher post titled differently, e.g. “Week 4”">Post anyway</button></form>}</td></tr>)}
    </tbody></table></div>)}

    {tab === "settings" && <>
      <section className="card"><h2>Recordings account</h2>
        {st.connected ? <><p>Connected as <b>{st.account}</b> by {st.by}. This account renames and files the recordings and posts them in Classroom, so it must own the Meet recordings and be a teacher on every class (ose@ohsoed.co.uk).</p>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}><form action={importRecordingsAction}><button className="abtn" type="submit">Bring in earlier recordings</button></form>
            <span className="note">Reads the subject and 1:1 folders for recordings the Apps Script already filed (done automatically the first time). Nothing is renamed or moved.</span></div>
          <form action={disconnectRecAction} style={{ marginTop: 8 }}><button className="lnk" type="submit">Disconnect</button></form></>
        : <><p className="cs">Sign in as <b>ose@ohsoed.co.uk</b> (it owns the recordings and teaches every Classroom). It needs Drive and Classroom posting. In Google Cloud Console (the same project as Meet) turn on the <b>Google Drive API</b> and <b>Google Classroom API</b> first.</p>
          <a className="abtn pri" href="/admin/meet-api?action=login&what=rec">Connect ose@</a></>}
        <p className="note" style={{ marginTop: 10 }}><b>Before switching to “Do the work”:</b> switch off the Apps Script’s triggers (_Recordings → Extensions → Apps Script → Triggers → delete “dailyUpdate” and “applyApprovedTitleCards”), so the two never run at once.</p></section>
      <section className="card"><h2>Folders and title cards</h2>
        <form action={recCfgAction} className="eform">
          <label className="fld">Google Meet folder<input name="meetFolder" defaultValue={st.cfg.meetFolder ?? ""} style={{ width: 300 }} /></label>
          <label className="fld">Transcripts (Archive/_Transcripts)<input name="transcriptsFolder" defaultValue={st.cfg.transcriptsFolder ?? ""} style={{ width: 300 }} /></label>
          <label className="fld">Flagged - Short Recordings<input name="flaggedFolder" defaultValue={st.cfg.flaggedFolder ?? ""} style={{ width: 300 }} /></label>
          <label className="fld">1to1s folder<input name="oneToOneFolder" defaultValue={st.cfg.oneToOneFolder ?? ""} style={{ width: 300 }} /></label>
          <label className="fld">Shorter than this is an accidental join (MB)<input name="minMb" type="number" min="0.25" step="0.25" defaultValue={((st.cfg.minBytes ?? 5242880) / 1048576).toString()} style={{ width: 100 }} /></label>
          <label className="fld">Title-card service URL (Cloud Run)<input name="cardUrl" defaultValue={st.cfg.cardUrl ?? ""} placeholder="https://…run.app" style={{ width: 320 }} autoComplete="off" /></label>
          <label className="fld">Title-card secret<input name="cardSecret" type="text" placeholder={st.cfg.cardSecret ? "Saved (leave blank to keep)" : "TITLE_CARD_SECRET"} style={{ width: 240 }} autoComplete="off" spellCheck={false} data-1p-ignore="" data-lpignore="true" /></label>
          <label className="fld">Mode<select name="mode" defaultValue={st.cfg.mode === "live" ? "live" : "watch"}><option value="watch">Watch only (the Apps Script does the work)</option><option value="live">Do the work (after deleting the Apps Script triggers)</option></select></label>
          <label className="fld" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><input type="checkbox" name="autoCards" value="1" defaultChecked={!!st.cfg.autoCards} style={{ width: "auto" }} />Add title cards automatically (no approval)</label>
          <button className="abtn" type="submit">Save</button></form>
        <p className="note">The URL and secret are the Script properties TITLE_CARD_URL and TITLE_CARD_SECRET in the Apps Script (Project Settings). Paste them yourself.</p></section>
      <section className="card"><h2>Classes and 1:1s</h2><p className="cs">Matched by Meet code. Recordings are named “{new Date().getFullYear()} &lt;name&gt; [Yr1] - T&lt;n&gt; Lesson &lt;n&gt;” (1:1s: “… &lt;label&gt; T&lt;n&gt; Lesson &lt;n&gt;”). Codes not listed here are never touched.</p>
        <div className="tw"><table><thead><tr><th>Name</th><th>Meet code</th><th>Classroom course</th><th>Folder</th><th className="n">Per week</th><th>Year</th><th>On</th><th /></tr></thead><tbody>
          {all.map((l) => <tr key={l.id}><td colSpan={8} style={{ padding: 0 }}><form action={recLessonAction} style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 1.2fr 1.6fr .6fr .7fr .5fr auto", gap: 6, padding: 8, alignItems: "center" }}>
            <input type="hidden" name="id" value={l.id} /><input type="hidden" name="kind" value={l.kind} />
            <input className="mini" name="name" defaultValue={l.name} title={l.group ?? ""} /><input className="mini mono" name="meet_code" defaultValue={l.meet_code} /><input className="mini" name="course_id" defaultValue={l.course_id ?? ""} />
            <input className="mini" name="folder_id" defaultValue={l.folder_id ?? ""} placeholder={l.kind === "one" ? "made automatically" : ""} />
            <input className="mini" name="per_week" type="number" min="1" max="9" defaultValue={l.per_week ?? ""} disabled={l.kind === "one"} />
            <select className="mini" name="year_suffix" defaultValue={l.year_suffix ?? ""} disabled={l.kind === "one"}><option value="">—</option><option>Yr1</option><option>Yr2</option></select>
            <select className="mini" name="active" defaultValue={l.active ? "1" : "0"}><option value="1">On</option><option value="0">Off</option></select>
            <button className="abtn sm" type="submit">Save</button></form></td></tr>)}
        </tbody></table></div>
        <details style={{ marginTop: 12 }}><summary className="abtn sm">Add a class or 1:1</summary>
          <form action={recLessonAction} className="eform" style={{ marginTop: 10 }}>
            <label className="fld">Type<select name="kind"><option value="class">Class</option><option value="one">1:1</option></select></label>
            <label className="fld">Name or label<input name="name" placeholder="GCSE Geography / Luke Withers - GCSE Chemistry" style={{ width: 280 }} /></label>
            <label className="fld">Meet code<input name="meet_code" placeholder="abc-defg-hij" /></label>
            <label className="fld">Classroom course ID<input name="course_id" /></label>
            <label className="fld">Subject folder (classes)<input name="folder_id" placeholder="Drive folder link" /></label>
            <label className="fld">Lessons per week<input name="per_week" type="number" min="1" max="9" style={{ width: 80 }} /></label>
            <label className="fld">Year (2-year GCSE)<select name="year_suffix"><option value="">—</option><option>Yr1</option><option>Yr2</option></select></label>
            <button className="abtn" type="submit">Add</button></form>
          <p className="note">The Classroom course ID: open the class in Classroom, copy the code at the end of the address (classroom.google.com/c/XXXX) and decode it from base64, or ask me to.</p></details>
        <p className="note">Every September: change the 2-year GCSE classes from Yr1 to Yr2, and add new classes for the new intake.</p></section>
    </>}
  </>;
}
