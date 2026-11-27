import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { slidesOwner, allClassFolders } from "@/lib/slides-owner";
import { folderInfo, schoolDriveAccount } from "@/lib/lesson-slides";
import { slidesOwnerAction, adminFolderAction } from "./actions";

export const dynamic = "force-dynamic";

// Settings → Lesson slides (27 Nov): who owns the lesson-slides library (the school or each teacher), and, when the
// school owns it, the Drive folder for each class. My day then shows "Lesson slides" for a teacher's next lesson.
export default async function LessonSlides({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const [sp] = await Promise.all([searchParams, requireStaff()]);
  const [owner, classes, account] = await Promise.all([slidesOwner(), allClassFolders(), schoolDriveAccount()]);
  const school = owner === "school";
  const info = school ? await Promise.all(classes.map((c) => (c.folder ? folderInfo(c.folder).catch(() => null) : Promise.resolve(null)))) : [];
  const acct = account ?? "the school’s Google account";
  const set = classes.filter((c) => c.folder).length;
  return <>
    <div className="top"><div><h1>Lesson slides</h1><div className="sub">Teachers see <b>Lesson slides</b> on My day for their next lesson, found by name in the class’s Google Drive folder (“Lesson 7”, for example). Choose who owns those folders.</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    <section className="card"><h2>Who owns the slides library?</h2>
      <form action={slidesOwnerAction} style={{ display: "grid", gap: 10, marginTop: 6 }}>
        <label className="ls-opt"><input type="radio" name="owner" value="school" defaultChecked={school} /><span><b>The school</b><small>The school keeps a slides folder for each class in its own Google Drive and sets it here. Teachers open their class’s folder from their Google Drive page and work in it, but can’t change which folder it is. Slides stay with the school when a teacher leaves.</small></span></label>
        <label className="ls-opt"><input type="radio" name="owner" value="teacher" defaultChecked={!school} /><span><b>Each teacher</b><small>Teachers keep slides in their own Google Drive, share each class’s folder with {acct} as a Viewer, and choose it on their Google Drive page.</small></span></label>
        <div><button className="abtn pri sm" type="submit">Save</button></div>
      </form></section>
    {school ? <>
      <section className="card"><h2>How to set up a class</h2>
        <ol style={{ margin: "6px 0 0", paddingLeft: 20, display: "grid", gap: 4 }}>
          <li>In the school’s Google Drive ({acct}), make a folder for the class’s slides. A subfolder per term is fine.</li>
          <li>Share the folder with the class’s teacher as an <b>Editor</b>, so they can add and change slides.</li>
          <li>Copy the folder’s address from the browser and paste it in the class’s box below.</li>
          <li>Name each file with its lesson number, e.g. <b>“T2 Lesson 7”</b>. Students never get the folder: they see the slides when the teacher’s Classroom post goes out.</li>
        </ol></section>
      <p className="muted" style={{ margin: "4px 2px 10px" }}>{set} of {classes.length} classes have a folder.</p>
      {classes.length === 0 ? <p className="empty">No classes this year yet.</p> : <div className="ls-list">{classes.map((c, i) => { const r = info[i];
        return <section className="card ls-row" key={c.id} id={`c-${c.id}`}>
          <div className="ls-h"><b>{c.name}</b> <span className="muted">{c.code} · {c.teacher ?? "no teacher"}</span>
            <span className="grow" />{!c.folder ? <span className="pill mute">No folder</span> : r && r.ok ? <span className="pill good">Connected · {r.files.length} file{r.files.length === 1 ? "" : "s"}</span> : <span className="pill bad">Can’t see it</span>}</div>
          <form action={adminFolderAction} className="ls-form">
            <input type="hidden" name="group" value={c.id} />
            <input name="folder" defaultValue={c.folder ? `https://drive.google.com/drive/folders/${c.folder}` : ""} placeholder="https://drive.google.com/drive/folders/…" aria-label={`Slides folder for ${c.name} ${c.code}`} />
            <button className="abtn sm pri" type="submit">Save</button>
            {c.folder && <a className="abtn sm" href={`https://drive.google.com/drive/folders/${c.folder}`} target="_blank" rel="noopener">Open in Drive</a>}
          </form>
          {c.folder && r && !r.ok && <p className="note msg bad" style={{ marginTop: 8 }}>{r.error === "share" ? <>{acct} can’t open this folder. Make sure the folder is in (or shared with) that account.</> : r.error}</p>}
          {c.folder && r && r.ok && <p className="muted" style={{ margin: "6px 0 0", fontSize: 14 }}>{r.name}</p>}
        </section>; })}</div>}
    </> : <section className="card"><h2>Teachers choose their folders</h2><p style={{ margin: "6px 0 0" }}>Each teacher sets their folders on their own <b>Google Drive</b> page (the cog next to Sign out, then Google Drive). {set} of {classes.length} classes have one.</p>
      <p className="muted" style={{ margin: "6px 0 0" }}>Folders teachers have already chosen stay as they are if you switch back to the school owning them. You can then change any of them here.</p></section>}
    <p className="muted" style={{ fontSize: 14 }}>Folders are checked again every 10 minutes, so a new file can take that long to show on My day. Connect the school’s Google account under <Link href="/admin/recordings">Recordings</Link>.</p>
  </>;
}
