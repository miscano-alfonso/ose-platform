"use client";
import { useState, useTransition, type ReactNode, useRef, useLayoutEffect } from "react";
import { pack, spanOf } from "./bento-pack";
import { saveDashLayoutAction } from "./actions";
import { saveBoardAction } from "../dash-actions";

// A dashboard made of modules. "Customise" lets the person drag modules around, change their width,
// take them off and add them back; the arrangement is saved for that person only.
type Size = "s" | "q" | "m" | "l" | "xl" | "full";
/** size: the width it takes when added back from "Add a module". */
export type BoardModule = { id: string; title: string; node: ReactNode; size?: Size };
type H = "s" | "m" | "l";
type Item = { id: string; size: Size; h?: H };
const HEIGHTS: [H | undefined, string][] = [[undefined, "Auto"], ["s", "S"], ["m", "M"], ["l", "L"]];
const SIZES: [Size, string][] = [["s", "S"], ["q", "S+"], ["m", "M"], ["l", "L"], ["xl", "XL"], ["full", "Full"]];

/** scope "standard": an admin viewing as a teacher, parent or student arranges the school's standard for all of them (audience, e.g. "teachers"). */
export function BentoBoard({ page, modules, layout, defaults, saved, scope = "own", audience, locked }: { page: string; modules: BoardModule[]; layout: Item[]; defaults: Item[]; saved: boolean; scope?: "own" | "standard"; audience?: string; locked?: boolean }) {
  const [items, setItems] = useState<Item[]>(layout);
  const [editing, setEditing] = useState(false);
  const [drag, setDragS] = useState<string | null>(null);
  const dragRef = useRef<string | null>(null); // drag events can fire before the next render
  const setDrag = (d: string | null) => { dragRef.current = d; setDragS(d); };
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const byId = new Map(modules.map((m) => [m.id, m]));
  const hidden = modules.filter((m) => !items.some((i) => i.id === m.id));
  const move = (id: string, to: number) => setItems((xs) => { const i = xs.findIndex((x) => x.id === id); if (i < 0) return xs; const c = [...xs]; const [it] = c.splice(i, 1); c.splice(Math.max(0, Math.min(c.length, to)), 0, it); return c; });
  const std = scope === "standard";
  // place the modules so they fill the space (see bento-pack.ts); phones keep the plain flow
  const gridRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const g = gridRef.current; if (!g) return;
    let raf = 0;
    const run = () => {
      const cells = Array.from(g.children).filter((c): c is HTMLElement => c instanceof HTMLElement && c.classList.contains("bb-cell"));
      const W = g.clientWidth, gap = 16;
      if (W < 560 || !cells.length) { g.classList.remove("packed"); g.style.height = ""; cells.forEach((c) => { c.style.left = c.style.top = c.style.width = c.style.height = ""; }); return; }
      const colW = (W - gap * 11) / 12;
      const ins = cells.map((c) => ({ w: spanOf(c.dataset.size ?? "m", W), fixed: !!c.dataset.h }));
      g.classList.add("packed");
      cells.forEach((c, i) => { const w = ins[i].w; c.classList.remove("grown"); c.style.width = `${w * colW + (w - 1) * gap}px`; c.style.height = ""; });
      const hs = cells.map((c) => c.offsetHeight);
      const { boxes, height } = pack(ins.map((x, i) => ({ ...x, h: hs[i] })), 12, gap);
      cells.forEach((c, i) => { const b = boxes[i]; c.style.left = `${b.x * (colW + gap)}px`; c.style.top = `${b.top}px`; c.style.height = `${b.height}px`; c.classList.toggle("grown", b.height > hs[i] + 1); });
      g.style.height = `${height}px`;
    };
    const again = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(run); };
    run();
    const ro = new ResizeObserver(again); ro.observe(g);
    const mo = new MutationObserver(again); mo.observe(g, { childList: true, subtree: true, characterData: true });
    document.fonts?.ready.then(again).catch(() => {});
    window.addEventListener("load", again);
    return () => { ro.disconnect(); mo.disconnect(); cancelAnimationFrame(raf); window.removeEventListener("load", again); };
  }, [items, editing]);
  const save = (next: Item[] | null) => start(async () => {
    await (page === "admin-home" ? saveDashLayoutAction : saveBoardAction)(page, next);
    setMsg(next ? (std ? `Saved as the standard for all ${audience ?? "people"}.` : "Saved. This is now your dashboard.") : (std ? "Back to the built-in layout." : "Back to the standard layout."));
    if (!next) setItems(defaults); setEditing(false); });
  return <div className={`bb${editing ? " editing" : ""}`}>
    {!locked && <div className="bb-bar">
      {!editing ? <><button type="button" className="abtn sm" onClick={() => { setEditing(true); setMsg(""); }}>
        <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z" /></svg>{std ? `Customise for all ${audience ?? ""}` : "Customise"}</button>
        {msg && <span className="bb-msg" role="status">{msg}</span>}</>
      : <><span className="bb-help">{std ? `Drag modules to move them, pick a width, or take them off. This becomes the dashboard for all ${audience ?? "people"}.` : "Drag modules to move them, pick a width, or take them off. Only you see this arrangement."}</span>
        <button type="button" className="abtn sm pri" disabled={pending} onClick={() => save(items)}>{pending ? "Saving…" : "Save"}</button>
        <button type="button" className="abtn sm" disabled={pending} onClick={() => { setItems(layout); setEditing(false); }}>Cancel</button>
        {saved && <button type="button" className="abtn sm" disabled={pending} onClick={() => save(null)}>{std ? "Reset to built-in" : "Reset to standard"}</button>}</>}
    </div>}
    <div className="bb-grid" ref={gridRef}>
      {items.map((it, i) => { const m = byId.get(it.id); if (!m) return null;
        return <div key={it.id} data-size={it.size} data-h={it.h ?? undefined} className={`bb-cell s-${it.size}${it.h ? ` h-${it.h}` : ""}${drag === it.id ? " dragging" : ""}`}
          draggable={editing} onDragStart={(e) => { setDrag(it.id); e.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => setDrag(null)}
          onDragOver={(e) => { if (editing && dragRef.current) e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); const d = dragRef.current; if (d && d !== it.id) move(d, i); setDrag(null); }}>
          {editing && <div className="bb-tools">
            <span className="bb-grip" aria-hidden="true">⋮⋮</span><b>{m.title}</b>
            <span className="bb-sizes" role="group" aria-label={`Width of ${m.title}`}><i>Width</i>{SIZES.map(([s, l]) => <button key={s} type="button" aria-pressed={it.size === s} onClick={() => setItems((xs) => xs.map((x) => x.id === it.id ? { ...x, size: s } : x))}>{l}</button>)}</span>
            <span className="bb-sizes" role="group" aria-label={`Height of ${m.title}`}><i>Height</i>{HEIGHTS.map(([h, l]) => <button key={l} type="button" aria-pressed={it.h === h} onClick={() => setItems((xs) => xs.map((x) => x.id === it.id ? (h ? { ...x, h } : { id: x.id, size: x.size }) : x))}>{l}</button>)}</span>
            <button type="button" aria-label={`Move ${m.title} earlier`} disabled={i === 0} onClick={() => move(it.id, i - 1)}>←</button>
            <button type="button" aria-label={`Move ${m.title} later`} disabled={i === items.length - 1} onClick={() => move(it.id, i + 1)}>→</button>
            <button type="button" aria-label={`Remove ${m.title}`} onClick={() => setItems((xs) => xs.filter((x) => x.id !== it.id))}>✕</button>
          </div>}
          <div className="bb-body">{m.node}</div>
        </div>; })}
    </div>
    {editing && <div className="bb-add"><b>Add a module</b>{hidden.length === 0 ? <span className="muted">Every module is on your dashboard.</span>
      : hidden.map((m) => <button key={m.id} type="button" className="abtn sm" onClick={() => setItems((xs) => [...xs, { id: m.id, size: defaults.find((d) => d.id === m.id)?.size ?? m.size ?? "m" }])}>+ {m.title}</button>)}</div>}
  </div>;
}
