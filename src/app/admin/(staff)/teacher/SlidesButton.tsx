"use client";
import { useState, useTransition } from "react";
import { lessonSlidesAction } from "./slides-actions";

// "Lesson slides" on My day. The slides are found on their own (the class's Classroom post for "Lesson N", or a
// Slides file named "Lesson N" in the course's Drive folder); the pencil lets the teacher point it at a different file.
export function SlidesButton({ eventId, url, found, n, compact }: { eventId: string; url: string | null; found?: { url: string; title: string; from: string } | null; n?: number | null; compact?: boolean }) {
  const [edit, setEdit] = useState(false), [v, setV] = useState(url ?? ""), [err, setErr] = useState(""), [pending, start] = useTransition();
  const save = (next: string) => start(async () => { const e = await lessonSlidesAction(eventId, next); setErr(e ?? ""); if (!e) setEdit(false); });
  const href = url || found?.url || null;
  const tip = url ? "Link set by hand" : found ? `${found.title} (found in ${found.from === "folder" ? "your slides folder" : found.from === "drive" ? "the class’s Classroom Drive folder" : "Google Classroom"})` : "";
  if (edit) return <form className="fx-slides-edit" onSubmit={(e) => { e.preventDefault(); save(v); }}>
    <input type="url" value={v} onChange={(e) => setV(e.target.value)} placeholder="https://docs.google.com/presentation/…" aria-label="Link to the lesson slides" autoFocus required={!url} />
    <button type="submit" className="abtn sm pri" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
    {url && <button type="button" className="abtn sm" disabled={pending} onClick={() => save("")}>{found ? "Use the found slides" : "Remove"}</button>}
    <button type="button" className="abtn sm" onClick={() => { setEdit(false); setV(url ?? ""); setErr(""); }}>Cancel</button>
    {err && <span className="fx-slides-err" role="alert">{err}</span>}
  </form>;
  if (!href && compact) return null;
  const pencil = <button type="button" aria-label={href ? "Use different slides" : "Add a link to the slides"} title={href ? "Use different slides" : "Add a link"} onClick={() => setEdit(true)}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></button>;
  return <span className={`fx-slides${compact ? " compact" : ""}`}>
    {href ? <a href={href} target="_blank" rel="noopener" title={tip}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18v12H3zM12 17v4M8 21h8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>{compact ? "Slides" : "Lesson slides"}</a>
      : <span className="none" title={n ? `Name the file “Lesson ${n}” in this class’s slides folder (set it on your Google Drive page).` : undefined}>No slides found{n ? ` for Lesson ${n}` : ""}</span>}
    {!compact && pencil}
  </span>;
}
