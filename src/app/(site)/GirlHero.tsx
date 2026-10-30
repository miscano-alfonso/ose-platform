"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { PLATE, BOX, EXTRA, SPRITES, type GirlMarks, type Sym } from "./hero-girl";
import { saveGirlMarksAction, stopArrangingAction } from "./hero-actions";

// The home hero illustration with its floating drawn symbols. For an admin who opened Admin → Website → Home page symbols
// it becomes the arranger: drag any symbol (the ones round the girl move with the picture, the rest sit across the hero),
// click one to resize or remove it, add new ones, then Save.
type Layer = "box" | "extra";
export function GirlHero({ marks, edit = false }: { marks: GirlMarks; edit?: boolean }) {
  const [m, setM] = useState<GirlMarks>(marks);
  const [sel, setSel] = useState<{ l: Layer; i: number } | null>(null);
  const [dirty, setDirty] = useState(false), [msg, setMsg] = useState<string | null>(null), [busy, start] = useTransition();
  const [ready, setReady] = useState(false); useEffect(() => setReady(true), []);
  const boxRef = useRef<HTMLDivElement>(null), heroRef = useRef<HTMLDivElement>(null), drag = useRef<{ l: Layer; i: number; dx: number; dy: number } | null>(null);
  const router = useRouter();
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  const change = (fn: (v: GirlMarks) => void) => { setM((v) => { const c = { box: v.box.map((x) => ({ ...x })), extra: v.extra.map((x) => ({ ...x })) }; fn(c); return c; }); setDirty(true); setMsg(null); };

  useEffect(() => {
    if (!edit) return;
    const move = (e: PointerEvent) => {
      const d = drag.current; if (!d) return;
      const el = d.l === "box" ? boxRef.current : heroRef.current; if (!el) return;
      const r = el.getBoundingClientRect(), r2 = (v: number) => Math.round(v * 100) / 100;
      const x = r2(Math.min(110, Math.max(-10, (e.clientX - d.dx - r.left) / r.width * 100))), y = r2(Math.min(110, Math.max(-10, (e.clientY - d.dy - r.top) / r.height * 100)));
      change((v) => { v[d.l][d.i].x = x; v[d.l][d.i].y = y; });
    };
    const up = () => { drag.current = null; document.body.style.userSelect = ""; };
    const warn = (e: BeforeUnloadEvent) => { if (dirtyRef.current) e.preventDefault(); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("beforeunload", warn);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("beforeunload", warn); };
  }, [edit]);

  const sym = (l: Layer, s: Sym, i: number) => <img key={`${l}${i}`} className={`bg-sym${l === "extra" ? " bg-extra" : ""}${sel && sel.l === l && sel.i === i ? " on" : ""}`} src={`/hero/girl/${s.f}.webp`} alt={edit ? SPRITES[s.f] : ""} draggable={false}
    style={{ left: `${s.x}%`, top: `${s.y}%`, width: l === "box" ? `${s.w}%` : `${s.w}px`, ["--d" as string]: `${s.d}s`, ["--dl" as string]: `${s.dl}s` }}
    onPointerDown={edit ? (e) => { e.preventDefault(); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); drag.current = { l, i, dx: e.clientX - r.left, dy: e.clientY - r.top }; document.body.style.userSelect = "none"; setSel({ l, i }); } : undefined} />;
  const save = (v: GirlMarks | null, done: string) => start(async () => { const r = await saveGirlMarksAction(v); if (r.ok) { setDirty(false); setMsg(done); router.refresh(); } else setMsg("Your editing time ran out. Open it again from Admin → Website → Home page symbols."); });
  const cur = sel ? m[sel.l][sel.i] : null;

  return <>
    <div ref={heroRef} className={`bh-girl${edit ? " edit" : ""}`} role="img" aria-label="A sketch of a student working at her laptop, with maths and science symbols floating round her">
      <div ref={boxRef} className="bg-box">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="bg-plate" src={PLATE.src} alt="" width={PLATE.w} height={PLATE.h} fetchPriority="high" draggable={false} />
        {m.box.map((s, i) => sym("box", s, i))}
      </div>
      {m.extra.map((s, i) => sym("extra", s, i))}
    </div>
    {edit && ready && createPortal(<div className="hc-bar" role="region" aria-label="Arrange the home page symbols">
      <span className="hc-t"><b>Home page symbols</b><small>{msg ?? (busy ? "Saving…" : dirty ? "Not saved yet" : "Drag a symbol to move it. Click one to change it.")}</small></span>
      <label>Add<select value="" onChange={(e) => { const f = e.target.value; if (!f) return; change((v) => { v.extra.push({ f, x: 45, y: 30, w: 50, d: 12, dl: -3 }); }); setSel({ l: "extra", i: m.extra.length }); }}>
        <option value="">Symbol…</option>{Object.entries(SPRITES).map(([f, n]) => <option key={f} value={f}>{n}</option>)}</select></label>
      {cur && sel && <span className="hc-sel"><b style={{ fontWeight: 500 }}>{SPRITES[cur.f]}</b>
        <label>Size<input type="range" min={sel.l === "box" ? 1.5 : 16} max={sel.l === "box" ? 20 : 200} step={sel.l === "box" ? 0.25 : 2} value={cur.w} onChange={(e) => change((v) => { v[sel.l][sel.i].w = Number(e.target.value); })} /></label>
        <button type="button" onClick={() => { change((v) => { v[sel.l].splice(sel.i, 1); }); setSel(null); }}>Remove</button></span>}
      <button type="button" disabled={busy} onClick={() => { setM({ box: BOX, extra: EXTRA }); setSel(null); setDirty(true); }}>Original layout</button>
      <button type="button" className="pri" disabled={busy || !dirty} onClick={() => save(m, "Saved: everyone sees this now")}>Save</button>
      <button type="button" disabled={busy} onClick={() => { if (dirty && !window.confirm("Leave without saving your changes?")) return; start(async () => { await stopArrangingAction(); location.reload(); }); }}>Done</button>
      <span className="hc-phone">Arrange the symbols on a computer: they’re hidden on phones.</span>
    </div>, document.body)}
  </>;
}
