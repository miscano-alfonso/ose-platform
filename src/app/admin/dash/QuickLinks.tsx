"use client";
import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { saveQuickLinksAction } from "../actions";

type L = { href: string; label: string };
// The greeting's quick links, with a pencil to choose them (5 Nov). Only this person sees their choice.
export function QuickLinks({ links, options, isDefault, locked }: { links: L[]; options: L[]; isDefault: boolean; locked?: boolean }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [pick, setPick] = useState<string[]>(links.map((l) => l.href));
  const [pending, start] = useTransition();
  const label = (h: string) => options.find((o) => o.href === h)?.label ?? h;
  const open = () => { setPick(links.map((l) => l.href)); dlg.current?.showModal(); };
  const save = (v: string[] | null) => start(async () => { await saveQuickLinksAction(v); dlg.current?.close(); });
  const move = (i: number, d: number) => setPick((p) => { const c = [...p]; [c[i], c[i + d]] = [c[i + d], c[i]]; return c; });
  return <div className="dx-acts">
    {links.map((l) => <Link key={l.href} href={l.href}>{l.label}</Link>)}
    {!locked && <button type="button" className="dx-acts-edit" onClick={open} aria-label="Choose your quick links" title="Choose your quick links">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" /></svg></button>}
    <dialog ref={dlg} className="ql-dlg" aria-labelledby="ql-h">
      <h2 id="ql-h">Your quick links</h2>
      <p className="cs">Up to 8 links in your greeting. Only you see these.</p>
      {pick.length === 0 ? <p className="empty">No links. Add one below.</p> : <ol className="ql-list">{pick.map((h, i) => <li key={h}><span>{label(h)}</span>
        <button type="button" aria-label={`Move ${label(h)} earlier`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
        <button type="button" aria-label={`Move ${label(h)} later`} disabled={i === pick.length - 1} onClick={() => move(i, 1)}>↓</button>
        <button type="button" aria-label={`Remove ${label(h)}`} onClick={() => setPick((p) => p.filter((x) => x !== h))}>✕</button></li>)}</ol>}
      {pick.length < 8 && <label className="fld">Add a link<select value="" onChange={(e) => { const v = e.target.value; if (v) setPick((p) => [...p, v]); }}>
        <option value="">Choose a page…</option>{options.filter((o) => !pick.includes(o.href)).map((o) => <option key={o.href} value={o.href}>{o.label}</option>)}</select></label>}
      <div className="ql-btns"><button type="button" className="abtn pri" disabled={pending} onClick={() => save(pick)}>{pending ? "Saving…" : "Save"}</button>
        <button type="button" className="abtn" disabled={pending} onClick={() => dlg.current?.close()}>Cancel</button>
        {!isDefault && <button type="button" className="abtn" disabled={pending} onClick={() => save(null)}>Back to the standard links</button>}</div>
    </dialog>
  </div>;
}
