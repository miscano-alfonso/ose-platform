"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { loadBoxesAction, saveBoxesAction, type Loaded } from "./boxes-actions";
import type { Box } from "@/lib/page-boxes";

// Summary boxes under the title of any admin page in the menu (5 Nov). "Boxes" beside the title lets each person choose
// which. The boxes are placed straight after the page's header (.top), and the button inside it.
const ICONS: Record<string, string> = {
  users: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3 3-5 6-5s6 2 6 5M17 11a3 3 0 1 0 0-6M22 20c0-3-2-5-4-5",
  pound: "M16 6a4 4 0 0 0-7 2v4H6M6 12h8M9 12v3c0 2-1 4-3 5h12", cal: "M4 6h16v14H4zM4 10h16M9 3v5M15 3v5", check: "M4 12l5 5L20 6",
  alert: "M12 3l10 18H2zM12 10v5M12 18h.01", mail: "M3 6h18v12H3zM3 7l9 6 9-6", star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
  inbox: "M3 13h5l1 3h6l1-3h5M5 5h14l2 8v6H3v-6z",
};
const Ico = ({ d }: { d: string }) => <span className="dx-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg></span>;
function Ring({ pct, tone }: { pct: number | null; tone: string }) {
  const r = 26, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, pct ?? 0));
  return <svg className={`dx-ring ${tone}`} viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r={r} className="trk" /><circle cx="32" cy="32" r={r} className="val" strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 32 32)" /></svg>;
}
function Tile({ b }: { b: Box }) {
  const cls = `dx-kpi${b.ring ? " ring" : ""}${b.tone ? ` ${b.tone}` : ""}`;
  const inner = b.ring ? <><div><span className="k">{b.k}</span><span className="v">{b.v}</span><span className="h">{b.h}</span></div><Ring pct={b.ring.pct} tone={b.ring.tone} /></>
    : <><Ico d={ICONS[b.icon]} /><span className="k">{b.k}</span><span className="v">{b.v}</span>
      {b.meter != null && <div className="dx-meter" role="img" aria-label={`${Math.round(b.meter)}%`}><i style={{ width: `${b.meter}%` }} /></div>}<span className="h">{b.h}</span></>;
  return b.href ? <a className={cls} href={b.href}>{inner}</a> : <div className={cls}>{inner}</div>;
}

export function PageBoxes() {
  const path = usePathname() ?? "";
  const [d, setD] = useState<Loaded>(null);
  const [host, setHost] = useState<{ strip: HTMLElement; btn: HTMLElement } | null>(null);
  const [edit, setEdit] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { let off = false; setD(null); setEdit(null); loadBoxesAction(path).then((r) => { if (!off) setD(r); }).catch(() => {}); return () => { off = true; }; }, [path]);
  useEffect(() => {
    if (!d) { setHost(null); return; }
    const main = document.querySelector<HTMLElement>(".adm main.main"); if (!main) return;
    const top = Array.from(main.querySelectorAll<HTMLElement>(".top")).find((el) => !el.closest(".topbar, .card, .modal"));
    const strip = document.createElement("div"); strip.className = "pb-host";
    const btn = document.createElement("span"); btn.className = "pb-btn-host";
    if (top) { top.after(strip); top.append(btn); } else { const first = main.querySelector(":scope > .adm-tabs"); (first ?? main.firstElementChild)?.after(strip); strip.prepend(btn); }
    setHost({ strip, btn });
    return () => { strip.remove(); btn.remove(); };
  }, [d, path]);
  if (!d || !host) return null;
  const save = (ids: string[] | null) => { setBusy(true); saveBoxesAction(path, ids).then((r) => { setD(r); setEdit(null); }).finally(() => setBusy(false)); };
  const title = (id: string) => d.catalogue.find((c) => c.id === id)?.title ?? id;
  const btn = <button type="button" className={`abtn sm pb-btn${edit ? " pri" : ""}`} aria-expanded={!!edit} onClick={() => setEdit(edit ? null : d.ids)} title="Choose the summary boxes for this page">
    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" /></svg>Boxes</button>;
  return <>
    {createPortal(btn, host.btn)}
    {createPortal(<>
      {edit && <div className="pb-edit" role="group" aria-label="Summary boxes for this page">
        <p className="pb-help">Choose the boxes for this page{edit.length ? "; use the arrows to order them" : ""}. Only you see this.</p>
        <div className="pb-chips">{d.catalogue.map((c) => { const on = edit.includes(c.id);
          return <button key={c.id} type="button" className={`pb-chip${on ? " on" : ""}`} aria-pressed={on} onClick={() => setEdit(on ? edit.filter((x) => x !== c.id) : [...edit, c.id].slice(0, 8))}>{on ? "✓ " : "+ "}{c.title}</button>; })}</div>
        {edit.length > 1 && <ol className="pb-order">{edit.map((id, i) => <li key={id}><span>{title(id)}</span>
          <button type="button" aria-label={`Move ${title(id)} earlier`} disabled={i === 0} onClick={() => { const c = [...edit]; [c[i - 1], c[i]] = [c[i], c[i - 1]]; setEdit(c); }}>←</button>
          <button type="button" aria-label={`Move ${title(id)} later`} disabled={i === edit.length - 1} onClick={() => { const c = [...edit]; [c[i + 1], c[i]] = [c[i], c[i + 1]]; setEdit(c); }}>→</button></li>)}</ol>}
        <div className="pb-btns"><button type="button" className="abtn sm pri" disabled={busy} onClick={() => save(edit)}>{busy ? "Saving…" : "Save"}</button>
          <button type="button" className="abtn sm" disabled={busy} onClick={() => setEdit(null)}>Cancel</button>
          {d.saved && <button type="button" className="abtn sm" disabled={busy} onClick={() => save(null)}>Back to the standard boxes</button>}</div>
      </div>}
      {d.boxes.length > 0 && <div className="pb-strip">{d.boxes.map((b) => <Tile key={b.id} b={b} />)}</div>}
    </>, host.strip)}
  </>;
}
