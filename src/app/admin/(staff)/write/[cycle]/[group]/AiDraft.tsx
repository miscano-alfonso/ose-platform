"use client";
import { useState, useTransition } from "react";
import { draftCommentAction } from "./draft-action";

/** The "Draft with AI" button in a report's comment box: fills the box with a first attempt, with Undo (31 Oct). */
export function AiDraft({ id, auto }: { id: string; auto: number | null }) {
  const [busy, start] = useTransition();
  const [err, setErr] = useState("");
  const [prev, setPrev] = useState<string | null>(null);
  const box = () => document.getElementById(`comment_${id}`) as HTMLTextAreaElement | null;
  const num = (name: string) => { const el = document.querySelector<HTMLSelectElement>(`select[name="${name}_${id}"]`); const v = Number(el?.value); return v > 0 ? v : null; };
  const go = () => start(async () => {
    setErr("");
    const r = await draftCommentAction(id, { effort: num("effort"), progress: num("progress") ?? auto, working: num("working"), predicted: num("predicted") });
    const t = box();
    if (r.error || !r.text || !t) { setErr(r.error ?? "Couldn’t draft it."); return; }
    setPrev(t.value); t.value = r.text; t.dispatchEvent(new Event("input", { bubbles: true })); t.focus();
  });
  return <div className="aid">
    {err && <span className="aid-err" role="alert">{err}</span>}
    {prev !== null && !busy && <button type="button" className="lnk" onClick={() => { const t = box(); if (t) t.value = prev; setPrev(null); }}>Undo</button>}
    <button type="button" className="abtn sm aid-go" onClick={go} disabled={busy} title="A first attempt from this term’s Classroom work, reward points, lesson chat and earlier reports. Read and edit it before saving.">
      <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" fill="currentColor"/></svg>
      {busy ? "Drafting…" : prev !== null ? "Draft again" : "Draft with AI"}</button>
  </div>;
}
