"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { SYMBOLS, SYMBOL_NAMES, HOME_DEFAULT, timing, type Mark } from "./hero-marks";
import { saveHeroMarksAction, stopArrangingAction } from "./hero-actions";

// Arranging the home page symbols on the page itself: drag any symbol, click one to change its symbol or size or take it
// off, add new ones, then Save. Only shown to an OH-SO ED admin who opened Admin → Website → Home page symbols.
export function HeroComposer({ initial }: { initial: Mark[] }) {
  const [list, setList] = useState<Mark[]>(initial);
  const [sel, setSel] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const box = useRef<HTMLDivElement>(null), drag = useRef<{ i: number; moved: boolean } | null>(null);
  const router = useRouter();
  const [ready, setReady] = useState(false);   // the bar goes on <body>: the hero clips anything fixed inside it
  useEffect(() => setReady(true), []);
  const change = (fn: (l: Mark[]) => Mark[]) => { setList((l) => fn(l.map((m) => ({ ...m })))); setDirty(true); setMsg(null); };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current, el = box.current; if (!d || !el) return;
      const r = el.getBoundingClientRect(), r1 = (v: number) => Math.round(v * 10) / 10;
      const x = r1(Math.min(105, Math.max(-5, (e.clientX - r.left) / r.width * 100))), y = r1(Math.min(105, Math.max(-5, (e.clientY - r.top) / r.height * 100)));
      d.moved = true; change((l) => { l[d.i].x = x; l[d.i].y = y; return l; });
    };
    const up = () => { drag.current = null; document.body.style.userSelect = ""; };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    const warn = (e: BeforeUnloadEvent) => { if (dirtyRef.current) e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("beforeunload", warn); };
  }, []);
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;

  const save = (l: Mark[] | null, done: string) => start(async () => { const r = await saveHeroMarksAction(l); if (r.ok) { setDirty(false); setMsg(done); router.refresh(); } else setMsg("Your editing time ran out. Open it again from Admin → Website → Home page symbols."); });
  const m = sel != null ? list[sel] : null;

  return <>
    <div ref={box} className="bh-marks edit">
      {list.map((k, i) => { const t = timing(i);
        return <svg key={i} className={`mk${sel === i ? " on" : ""}`} data-k={k.k} viewBox="-30 -30 60 60" role="button" aria-label={`${SYMBOL_NAMES[k.k]}, drag to move`}
          style={{ ["--x" as string]: `${k.x}%`, ["--y" as string]: `${k.y}%`, ["--s" as string]: k.s, ["--d" as string]: `${t.d}s`, ["--dl" as string]: `${t.dl}s` }}
          onPointerDown={(e) => { e.preventDefault(); window.getSelection()?.removeAllRanges(); document.body.style.userSelect = "none"; drag.current = { i, moved: false }; setSel(i); }}><g dangerouslySetInnerHTML={{ __html: SYMBOLS[k.k] }} /></svg>; })}
    </div>
    {ready && createPortal(<div className="hc-bar" role="region" aria-label="Arrange the home page symbols">
      <span className="hc-t"><b>Home page symbols</b><small>{msg ?? (busy ? "Saving…" : dirty ? "Not saved yet" : "Drag a symbol to move it. Click one to change it.")}</small></span>
      <label>Add<select value="" onChange={(e) => { const k = e.target.value; if (!k) return; change((l) => [...l, { k, x: 60, y: 45, s: 1 }]); setSel(list.length); }}>
        <option value="">Symbol…</option>{Object.keys(SYMBOLS).map((k) => <option key={k} value={k}>{SYMBOL_NAMES[k]}</option>)}</select></label>
      {m && sel != null && <span className="hc-sel">
        <select aria-label="Symbol" value={m.k} onChange={(e) => change((l) => { l[sel].k = e.target.value; return l; })}>{Object.keys(SYMBOLS).map((k) => <option key={k} value={k}>{SYMBOL_NAMES[k]}</option>)}</select>
        <label>Size<input type="range" min={0.5} max={2.2} step={0.1} value={m.s} onChange={(e) => change((l) => { l[sel].s = Number(e.target.value); return l; })} /></label>
        <button type="button" onClick={() => { change((l) => l.filter((_, j) => j !== sel)); setSel(null); }}>Remove</button></span>}
      <button type="button" disabled={busy} onClick={() => { setList(HOME_DEFAULT); setSel(null); setDirty(true); }}>Original layout</button>
      <button type="button" className="pri" disabled={busy || !dirty} onClick={() => save(list, "Saved: everyone sees this now")}>Save</button>
      <button type="button" disabled={busy} onClick={() => { if (dirty && !window.confirm("Leave without saving your changes?")) return; start(async () => { await stopArrangingAction(); location.reload(); }); }}>Done</button>
      <span className="hc-phone">Arrange the symbols on a computer: they’re hidden on phones.</span>
    </div>, document.body)}
  </>;
}
