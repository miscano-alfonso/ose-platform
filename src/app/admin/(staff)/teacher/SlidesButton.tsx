"use client";
import { useState, useTransition } from "react";
import { lessonSlidesAction } from "./slides-actions";

// "Lesson slides" on My day: opens the slides in their own tab; the pencil (or "Add slides" when there's no link yet)
// lets the teacher paste or change the link for that lesson.
export function SlidesButton({ eventId, url, compact }: { eventId: string; url: string | null; compact?: boolean }) {
  const [edit, setEdit] = useState(false), [v, setV] = useState(url ?? ""), [err, setErr] = useState(""), [pending, start] = useTransition();
  const save = (next: string) => start(async () => { const e = await lessonSlidesAction(eventId, next); setErr(e ?? ""); if (!e) setEdit(false); });
  if (edit) return <form className="fx-slides-edit" onSubmit={(e) => { e.preventDefault(); save(v); }}>
    <input type="url" value={v} onChange={(e) => setV(e.target.value)} placeholder="https://docs.google.com/presentation/…" aria-label="Link to the lesson slides" autoFocus required={!url} />
    <button type="submit" className="abtn sm pri" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
    {url && <button type="button" className="abtn sm" disabled={pending} onClick={() => save("")}>Remove</button>}
    <button type="button" className="abtn sm" onClick={() => { setEdit(false); setV(url ?? ""); setErr(""); }}>Cancel</button>
    {err && <span className="fx-slides-err" role="alert">{err}</span>}
  </form>;
  return <span className={`fx-slides${compact ? " compact" : ""}`}>
    {url ? <><a href={url} target="_blank" rel="noopener"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18v12H3zM12 17v4M8 21h8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>{compact ? "Slides" : "Lesson slides"}</a>
      <button type="button" aria-label="Change the slides link" title="Change the link" onClick={() => setEdit(true)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></button></>
      : <button type="button" className="add" onClick={() => setEdit(true)}>+ {compact ? "Slides" : "Add lesson slides"}</button>}
  </span>;
}
