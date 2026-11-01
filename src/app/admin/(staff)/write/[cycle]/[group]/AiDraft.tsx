"use client";
import { useState, useTransition } from "react";
import { draftCommentAction } from "./draft-action";

const box = (id: string) => document.getElementById(`comment_${id}`) as HTMLTextAreaElement | null;
const num = (id: string, name: string) => { const el = document.querySelector<HTMLSelectElement>(`select[name="${name}_${id}"]`); const v = Number(el?.value); return v > 0 ? v : null; };
const autoOf = (id: string) => { const t = document.querySelector<HTMLSelectElement>(`select[name="progress_${id}"]`)?.options[0]?.text ?? ""; const m = /\((\d)\)/.exec(t); return m ? Number(m[1]) : null; };
const scoresOf = (id: string, auto: number | null) => ({ effort: num(id, "effort"), progress: num(id, "progress") ?? auto, working: num(id, "working"), predicted: num(id, "predicted") });
function put(t: HTMLTextAreaElement, text: string) { t.value = text; t.dispatchEvent(new Event("input", { bubbles: true })); }

/** In each comment box: "Draft with AI" for an empty box, "Redo with AI" once there's a comment; Undo puts back what was there (31 Oct, 1 Nov). */
export function AiDraft({ id, auto, has }: { id: string; auto: number | null; has?: boolean }) {
  const [busy, start] = useTransition();
  const [err, setErr] = useState("");
  const [prev, setPrev] = useState<string | null>(null);
  const [filled, setFilled] = useState(!!has);
  const go = () => start(async () => {
    setErr("");
    const r = await draftCommentAction(id, scoresOf(id, auto));
    const t = box(id);
    if (r.error || !r.text || !t) { setErr(r.error ?? "Couldn’t draft it."); return; }
    setPrev(t.value); put(t, r.text); setFilled(true); t.focus();
  });
  return <div className="aid">
    {err && <span className="aid-err" role="alert">{err}</span>}
    {prev !== null && !busy && <button type="button" className="lnk" onClick={() => { const t = box(id); if (t) put(t, prev); setPrev(null); setFilled(!!prev); }}>Undo</button>}
    <button type="button" className="abtn sm aid-go" data-aid={id} onClick={go} disabled={busy} title="A first attempt in your voice, from this term’s Classroom work, reward points, lesson chat and earlier reports. Read and edit it before saving.">
      <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" fill="currentColor"/></svg>
      {busy ? "Drafting…" : filled ? "Redo with AI" : "Draft with AI"}</button>
  </div>;
}

/** "Draft all with AI" in the page heading: fills every empty comment box on the page, one at a time (comments already written are left alone). */
export function AiDraftAll() {
  const [state, setState] = useState<{ n: number; of: number } | null>(null);
  const [msg, setMsg] = useState("");
  const run = async () => {
    const ids = Array.from(document.querySelectorAll<HTMLTextAreaElement>('textarea[id^="comment_"]')).filter((t) => !t.disabled && !t.value.trim()).map((t) => t.id.slice(8));
    if (!ids.length) { setMsg("Every report already has a comment. Use Redo with AI on one to rewrite it."); return; }
    setMsg(""); let done = 0, failed = 0;
    for (let i = 0; i < ids.length; i++) {
      setState({ n: i + 1, of: ids.length });
      const r = await draftCommentAction(ids[i], scoresOf(ids[i], autoOf(ids[i]))).catch(() => ({ error: "x" } as { text?: string; error?: string }));
      const t = box(ids[i]);
      if (r.text && t && !t.value.trim()) { put(t, r.text); done++; } else failed++;
      if (r.error && /credit|key|today/i.test(r.error)) { setMsg(r.error); break; }
    }
    setState(null);
    setMsg((m) => m || `${done} comment${done === 1 ? "" : "s"} drafted${failed ? `, ${failed} couldn’t be` : ""}. Read each one, then save.`);
  };
  return <span className="aid-all">
    {msg && <span className="aid-all-msg" role="status">{msg}</span>}
    <button type="button" className="abtn sm aid-go" onClick={run} disabled={!!state}>
      <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" fill="currentColor"/></svg>
      {state ? `Drafting ${state.n} of ${state.of}…` : "Draft all with AI"}</button>
  </span>;
}
