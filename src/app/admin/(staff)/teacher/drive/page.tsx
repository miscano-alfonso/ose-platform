import Link from "next/link";
import { SettingsTabs } from "@/app/SettingsTabs";
import { requireViewer } from "@/lib/auth";
import { myClassFolders } from "@/lib/teacher-area";
import { folderInfo, schoolDriveAccount } from "@/lib/lesson-slides";
import { classFolderAction } from "./actions";
import { GuideSlides } from "../../../GuideSlides";
import { DRIVE_SLIDES, DRIVE_SCHOOL_SLIDES } from "../../../guides";
import { slidesOwner } from "@/lib/slides-owner";

export const dynamic = "force-dynamic";

// The teacher's Google Drive page: a lesson-slides folder for each class. The school's Google account reads it, so
// My day can show "Lesson slides" for the next lesson. Students never get the folder: they get each lesson's slides
// when the teacher's scheduled Classroom post goes out after the lesson.
export default async function TeacherDrive({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const [sp, me] = await Promise.all([searchParams, requireViewer()]);
  const [classes, account, owner] = await Promise.all([myClassFolders(me.id), schoolDriveAccount(), slidesOwner()]);
  const info = await Promise.all(classes.map((c) => (c.folder ? folderInfo(c.folder) : Promise.resolve(null))));
  const acct = account ?? "the school’s Google account (ose@)";
  // 27 Nov: when the school owns the slides library (Settings → Lesson slides) the office sets the folders; teachers open and work in them
  if (owner === "school") return <><SettingsTabs area="teacher" here="/admin/teacher/drive" />
    <div className="top-tools"><GuideSlides slides={DRIVE_SCHOOL_SLIDES} title="Lesson slides: how they work" label="How it works" /></div>
    <div className="top"><div><h1>Google Drive</h1><div className="sub">The school keeps a lesson-slides folder for each of your classes. Put each lesson’s slides in it, named with the lesson number (“Lesson 7”, for example), and My day shows <b>Lesson slides</b> for your next lesson.</div></div></div>
    <section className="card"><h2>How it works</h2>
      <ol style={{ margin: "6px 0 0", paddingLeft: 20, display: "grid", gap: 4 }}>
        <li>Press <b>Open in Drive</b> on a class to open its folder. The school has shared it with you so you can add and change slides.</li>
        <li>Name each file with its lesson number, e.g. <b>“T2 Lesson 7”</b>. A subfolder per term is fine.</li>
        <li>Students don’t get the folder. They see each lesson’s slides when your scheduled Classroom post goes out after the lesson.</li>
      </ol></section>
    {classes.length === 0 ? <p className="empty">You have no classes this year.</p> : classes.map((c, i) => { const r = info[i];
      return <section className="card" key={c.id}><div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}><h2 style={{ margin: 0 }}>{c.name} <span className="muted" style={{ fontWeight: 400, fontSize: 15 }}>{c.code}</span></h2><span className="grow" />
        {c.folder && <a className="abtn sm pri" href={`https://drive.google.com/drive/folders/${c.folder}`} target="_blank" rel="noopener">Open in Drive</a>}</div>
        {!c.folder ? <p className="note" style={{ marginTop: 8 }}>The office hasn’t set a slides folder for this class yet.{c.course ? " Until then, slides are looked for in this class’s Classroom posts." : ""} <Link href="/admin/teacher/messages">Message the office</Link></p>
          : r && !r.ok ? <p className="note msg bad" style={{ marginTop: 8 }}>{r.error === "share" ? "The school can’t read this folder at the moment. Let the office know." : r.error}</p>
          : r && r.ok ? <div style={{ marginTop: 8 }}><span className="pill good">Connected</span> <b>{r.name}</b> · {r.files.length} slide file{r.files.length === 1 ? "" : "s"}
            {r.files.length > 0 && <details style={{ marginTop: 6 }}><summary className="muted">See the files</summary><ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{r.files.slice(0, 40).map((f, k) => <li key={k}><a href={f.url} target="_blank" rel="noopener">{f.title}</a>{f.path ? <span className="muted"> · {f.path}</span> : null}</li>)}</ul></details>}</div> : null}
      </section>; })}
    <p className="muted" style={{ fontSize: 14 }}>The folder is checked again every 10 minutes, so a new file can take that long to show on <Link href="/admin/teacher">My day</Link>.</p>
  </>;
  return <><SettingsTabs area="teacher" here="/admin/teacher/drive" />
    <div className="top-tools"><GuideSlides slides={DRIVE_SLIDES} title="Lesson slides: connect your Google Drive" label="How it works" /></div>
    <div className="top"><div><h1>Google Drive</h1><div className="sub">Choose the Drive folder that holds each class’s lesson slides. My day then shows <b>Lesson slides</b> for your next lesson, found by name: “Lesson 7”, for example (a subfolder per term is fine, and “T2” or “Term 2” in the name helps).</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    <section className="card"><h2>How it connects</h2>
      <ol style={{ margin: "6px 0 0", paddingLeft: 20, display: "grid", gap: 4 }}>
        <li>In Google Drive, share each slides folder with <b>{acct}</b> as a <b>Viewer</b>.</li>
        <li>Copy the folder’s address from the browser and paste it below.</li>
        <li>Students don’t get the folder. They see each lesson’s slides when your scheduled Classroom post goes out after the lesson.</li>
      </ol></section>
    {classes.length === 0 ? <p className="empty">You have no classes this year.</p> : classes.map((c, i) => { const r = info[i];
      return <section className="card" key={c.id}><h2>{c.name} <span className="muted" style={{ fontWeight: 400, fontSize: 15 }}>{c.code}</span></h2>
        <form action={classFolderAction} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input type="hidden" name="group" value={c.id} />
          <input name="folder" defaultValue={c.folder ? `https://drive.google.com/drive/folders/${c.folder}` : ""} placeholder="https://drive.google.com/drive/folders/…" aria-label={`Slides folder for ${c.name}`} style={{ flex: "1 1 320px", minWidth: 0, padding: "8px 12px", borderRadius: 10, border: "1.5px solid var(--line)", background: "var(--panel)", color: "var(--ink)", font: "inherit" }} />
          <button className="abtn sm pri" type="submit">Save</button>
          {c.folder && <a className="abtn sm" href={`https://drive.google.com/drive/folders/${c.folder}`} target="_blank" rel="noopener">Open in Drive</a>}
        </form>
        {!c.folder ? <p className="note" style={{ marginTop: 8 }}>No folder yet.{c.course ? " Until you add one, slides are looked for in this class’s Classroom posts." : ""}</p>
          : r && !r.ok ? <p className="note msg bad" style={{ marginTop: 8 }}>{r.error === "share" ? <>The school can’t see this folder yet. Share it with <b>{acct}</b> (Viewer), then reload this page.</> : r.error}</p>
          : r && r.ok ? <div style={{ marginTop: 8 }}><span className="pill good">Connected</span> <b>{r.name}</b> · {r.files.length} slide file{r.files.length === 1 ? "" : "s"}
            {r.files.length > 0 && <details style={{ marginTop: 6 }}><summary className="muted">See the files</summary><ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{r.files.slice(0, 40).map((f, k) => <li key={k}><a href={f.url} target="_blank" rel="noopener">{f.title}</a>{f.path ? <span className="muted"> · {f.path}</span> : null}</li>)}</ul></details>}</div> : null}
      </section>; })}
    <p className="muted" style={{ fontSize: 14 }}>The folder is checked again every 10 minutes, so a new file can take that long to show on <Link href="/admin/teacher">My day</Link>.</p>
  </>;
}
