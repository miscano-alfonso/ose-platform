"use client";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { classroomCoursesAction, connectClassroomAction } from "./actions";

// 28 Nov (Alfonso): one button per class. It opens the school's Google Classrooms to choose from; choosing one links it
// and pulls the Classroom link, its invitation link (class code) and the Meet link in one go.
type Course = { id: string; name: string; section: string; link: string | null; code: string | null; owner: string | null; linkedTo: string | null };
type Done = Awaited<ReturnType<typeof connectClassroomAction>>;

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 1);
/** How well a Classroom's name matches the class: words they share, the level counting double. */
function score(c: Course, cls: string, level: string) {
  const cw = new Set(words(`${c.name} ${c.section}`)), lv = new Set(words(level));
  return words(cls).reduce((n, w) => n + (cw.has(w) ? (lv.has(w) ? 2 : 1) : 0), 0);
}

export function ClassroomPicker({ groupId, cls, level, code, linked }: { groupId: string; cls: string; level: string; code: string; linked: boolean }) {
  const dlg = useRef<HTMLDialogElement>(null), router = useRouter();
  const [list, setList] = useState<Course[] | null>(null), [err, setErr] = useState(""), [busy, setBusy] = useState(""), [q, setQ] = useState(""), [done, setDone] = useState<Done | null>(null);
  const open = async () => {
    setDone(null); setErr(""); setQ(""); dlg.current?.showModal();
    if (list) return;
    setBusy("list"); const r = await classroomCoursesAction().catch(() => ({ error: "Couldn’t reach Google Classroom." })); setBusy("");
    if ("error" in r) setErr(r.error); else setList(r.courses);
  };
  const pick = async (c: Course, replaceMeet = false) => {
    setBusy(c.id); const r = await connectClassroomAction(groupId, c.id, replaceMeet).catch(() => ({ ok: false as const, error: "Couldn’t connect it. Try again." })); setBusy("");
    setDone(r); if (r.ok) router.refresh();
  };
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase(), l = (list ?? []).filter((c) => !t || `${c.name} ${c.section}`.toLowerCase().includes(t));
    return l.map((c) => ({ c, s: score(c, cls, level) })).sort((a, b) => b.s - a.s || a.c.name.localeCompare(b.c.name));
  }, [list, q, cls, level]);
  const best = shown[0]?.s ? shown[0].c.id : null;
  const copy = (t: string) => navigator.clipboard?.writeText(t).catch(() => null);

  return <>
    <button type="button" className={`abtn sm${linked ? "" : " pri"}`} onClick={open} title={linked ? "Change the Google Classroom" : "Connect a Google Classroom"}>{linked ? "Change" : "Connect"}</button>
    <dialog ref={dlg} className="crp" aria-label={`Choose the Google Classroom for ${cls}`} onClick={(e) => { if (e.target === dlg.current) dlg.current?.close(); }}>
      <div className="crp-in">
        <header><div><h2>Choose the Google Classroom</h2><p className="muted">for <b>{cls}</b> ({code}). Its Classroom link, invitation link and Meet link are filled in for you.</p></div>
          <button type="button" className="abtn sm" onClick={() => dlg.current?.close()} aria-label="Close">✕</button></header>
        {done ? done.ok ? <div className="crp-done">
            <p className="crp-ok">Connected to <b>{done.name}</b></p>
            <ul>
              <li><span className="pill good">Classroom</span>{done.classroom ? <a href={done.classroom} target="_blank" rel="noopener">Open it in Classroom ↗</a> : "Linked"}</li>
              <li><span className={`pill ${done.invite ? "good" : "warn"}`}>Invitation link</span>{done.invite ? <><code>{done.invite.replace("https://", "")}</code><button type="button" className="abtn sm" onClick={() => copy(done.invite!)}>Copy</button></>
                : <span className="muted">The class code is switched off in Classroom (Settings → Class code). Students are still invited by email.</span>}</li>
              <li><span className={`pill ${done.meet ? "good" : "warn"}`}>Meet link</span>{done.meet ? <><code>{done.meet.replace("https://", "")}</code>
                <span className="muted">{done.meetKept ? "the one this class already had" : done.meetSource ? `found in ${done.meetSource}` : ""}</span></>
                : <span className="muted">Not found: Google doesn’t share a Classroom’s Meet link, and it isn’t in the Classroom’s posts or the Meet log yet. Paste it under Edit.</span>}</li>
            </ul>
            <div className="crp-acts"><button type="button" className="abtn pri" onClick={() => dlg.current?.close()}>Done</button></div>
          </div>
          : <p className="note msg bad">{done.error}</p>
        : <>
          {busy === "list" && <p className="muted">Getting the school’s Classrooms…</p>}
          {err && <p className="note msg bad">{err}</p>}
          {list && <>
            <input className="crp-q" type="search" placeholder={`Search ${list.length} Classrooms`} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            <div className="crp-grid">{shown.map(({ c }) => <button key={c.id} type="button" className={`crp-card${c.id === best ? " best" : ""}`} disabled={!!busy} onClick={() => pick(c)}>
              <b>{c.name}</b><span>{c.section || " "}</span>
              <span className="crp-tags">{c.id === best && <i className="pill info">Best match</i>}{c.linkedTo && <i className={`pill ${c.linkedTo === code ? "good" : "warn"}`}>{c.linkedTo === code ? "This class" : `Linked to ${c.linkedTo}`}</i>}</span>
              {busy === c.id && <span className="muted">Connecting…</span>}</button>)}
              {!shown.length && <p className="muted">No Classroom matches “{q}”.</p>}</div></>}
        </>}
      </div>
    </dialog>
  </>;
}
