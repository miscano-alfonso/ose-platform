"use client";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CATALOGUE, DEFAULT_MENUS, ICONS, LOCKED, type MenuArea, type MenuConfig } from "@/lib/menus";
import { saveMenuAction } from "./actions";

const HIDDEN = -1; // the "Not in the menu" box
type Drag = { href: string; from: number } | null;

/** Arrange one dashboard's menu: drag links between groups (or use the arrows and Move to), rename, add and
 *  remove groups, hide links, then save for everyone in the school. */
export function MenuEditor({ area, initial, saved }: { area: MenuArea; initial: MenuConfig; saved: boolean }) {
  const router = useRouter();
  const [cfg, setCfg] = useState<MenuConfig>(initial);
  const [dirty, setDirty] = useState(false);
  const [drag, setDragS] = useState<Drag>(null);
  const dragRef = useRef<Drag>(null); // read in drag events, which can fire before the next render
  const setDrag = (d: Drag) => { dragRef.current = d; setDragS(d); };
  const [over, setOver] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const byHref = useMemo(() => new Map(CATALOGUE[area].map((x) => [x.href, x])), [area]);

  const update = (f: (c: MenuConfig) => MenuConfig) => { setCfg((c) => f(structuredClone(c))); setDirty(true); setMsg(null); };
  const listOf = (c: MenuConfig, g: number) => g === HIDDEN ? c.hidden : c.groups[g].items;
  /** Take a link out of wherever it is and put it into group g (or the hidden box) before position `at`. */
  const move = (href: string, g: number, at?: number) => {
    if (g === HIDDEN && LOCKED.has(href)) { setMsg("That link always stays in the menu."); return; }
    update((c) => {
      let pos = at;
      for (const l of [c.hidden, ...c.groups.map((x) => x.items)]) { const i = l.indexOf(href); if (i >= 0) { l.splice(i, 1); if (pos != null && l === listOf(c, g) && i < pos) pos--; } }
      const l = listOf(c, g); l.splice(pos == null ? l.length : Math.max(0, Math.min(pos, l.length)), 0, href); return c;
    });
  };
  const shift = (g: number, i: number, d: -1 | 1) => update((c) => { const l = listOf(c, g), j = i + d; if (j < 0 || j >= l.length) return c; [l[i], l[j]] = [l[j], l[i]]; return c; });
  const shiftGroup = (g: number, d: -1 | 1) => update((c) => { const j = g + d; if (j < 0 || j >= c.groups.length) return c; [c.groups[g], c.groups[j]] = [c.groups[j], c.groups[g]]; return c; });
  const rename = (g: number, t: string) => update((c) => { c.groups[g].title = t.slice(0, 40); return c; });
  const addGroup = () => update((c) => { let n = 1; while (c.groups.some((x) => x.title === `New group${n > 1 ? " " + n : ""}`)) n++; c.groups.push({ title: `New group${n > 1 ? " " + n : ""}`, items: [] }); return c; });
  const removeGroup = (g: number) => update((c) => {
    if (c.groups.length < 2) return c;
    const [gone] = c.groups.splice(g, 1); c.groups[Math.max(0, g - 1)].items.push(...gone.items); return c; // its links join the group above
  });
  const titles = cfg.groups.map((g) => g.title.trim());
  const dupe = titles.find((t, i) => titles.indexOf(t) !== i);

  const save = (next: MenuConfig | null) => start(async () => {
    if (next && next.groups.some((g) => !g.title.trim())) { setMsg("Every group needs a name."); return; }
    if (next && dupe) { setMsg(`Two groups are called “${dupe}”. Give each a different name.`); return; }
    const r = await saveMenuAction(area, next);
    if (!r.ok) { setMsg(r.error ?? "Couldn’t save."); return; }
    if (!next) setCfg(DEFAULT_MENUS[area]);
    setDirty(false); setMsg(next ? "Saved. Everyone using this dashboard now sees this menu." : "Back to the standard menu."); router.refresh();
  });

  const onDrop = (g: number, at?: number) => (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setOver(null); const d = dragRef.current; if (d) move(d.href, g, at); setDrag(null); };
  const allow = (key: string) => (e: React.DragEvent) => { if (!dragRef.current) return; e.preventDefault(); if (over !== key) setOver(key); };
  const dest = (href: string, from: number) => <select className="me-to" aria-label="Move to" value="" onChange={(e) => { if (e.target.value !== "") move(href, Number(e.target.value)); }}>
    <option value="">Move to…</option>
    {cfg.groups.map((g, i) => i !== from && <option key={i} value={i}>{g.title || "Untitled group"}</option>)}
    {from !== HIDDEN && !LOCKED.has(href) && <option value={HIDDEN}>Not in the menu</option>}
  </select>;
  const row = (href: string, g: number, i: number, n: number) => { const x = byHref.get(href); if (!x) return null; const key = `${g}:${i}`;
    return <li key={href} className={`me-item${over === key ? " over" : ""}${drag?.href === href ? " lift" : ""}`} draggable
      onDragStart={(e) => { setDrag({ href, from: g }); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", href); }} onDragEnd={() => { setDrag(null); setOver(null); }}
      onDragOver={allow(key)} onDrop={onDrop(g, i)}>
      <span className="me-grip" aria-hidden="true">⋮⋮</span>
      <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[x.icon] ?? ICONS.home} /></svg>
      <span className="me-lbl">{x.label}{LOCKED.has(href) && <small className="me-lock" title="Always in the menu"> ●</small>}</span>
      <span className="me-ctl">
        <button type="button" className="abtn sm" aria-label={`Move ${x.label} up`} disabled={i === 0} onClick={() => shift(g, i, -1)}>↑</button>
        <button type="button" className="abtn sm" aria-label={`Move ${x.label} down`} disabled={i === n - 1} onClick={() => shift(g, i, 1)}>↓</button>
        {dest(href, g)}</span>
    </li>; };

  return <div className="me">
    <div className="me-bar">
      <button type="button" className="abtn pri" disabled={pending || !dirty} onClick={() => save(cfg)}>{pending ? "Saving…" : "Save menu"}</button>
      <button type="button" className="abtn" onClick={addGroup}>+ Add a group</button>
      {dirty && <button type="button" className="abtn" onClick={() => { setCfg(initial); setDirty(false); setMsg(null); }}>Undo changes</button>}
      {saved && <button type="button" className="abtn" disabled={pending} onClick={() => save(null)}>Reset to standard</button>}
      <span className="me-state" role="status">{msg ?? (dirty ? "Unsaved changes" : "")}</span>
    </div>
    <div className="me-cols">
      {cfg.groups.map((g, gi) => <section key={gi} className={`me-grp${over === `g${gi}` ? " over" : ""}`} onDragOver={allow(`g${gi}`)} onDrop={onDrop(gi)}>
        <header>
          <input className="me-title" value={g.title} aria-label="Group name" onChange={(e) => rename(gi, e.target.value)} placeholder="Group name" />
          <span className="me-gctl">
            <button type="button" className="abtn sm" aria-label={`Move ${g.title} group up`} disabled={gi === 0} onClick={() => shiftGroup(gi, -1)}>↑</button>
            <button type="button" className="abtn sm" aria-label={`Move ${g.title} group down`} disabled={gi === cfg.groups.length - 1} onClick={() => shiftGroup(gi, 1)}>↓</button>
            {cfg.groups.length > 1 && <button type="button" className="abtn sm" title="Remove this group; its links join the group above" aria-label={`Remove ${g.title} group`} onClick={() => removeGroup(gi)}>✕</button>}
          </span>
        </header>
        {g.items.length ? <ol>{g.items.map((h, i) => row(h, gi, i, g.items.length))}</ol> : <p className="me-empty">Drag links here</p>}
      </section>)}
      <section className={`me-grp me-hid${over === "hid" ? " over" : ""}`} onDragOver={allow("hid")} onDrop={onDrop(HIDDEN)}>
        <header><h3>Not in the menu</h3></header>
        <p className="me-note">Pages here still work from links, they just aren’t listed.</p>
        {cfg.hidden.length ? <ol>{cfg.hidden.map((h, i) => row(h, HIDDEN, i, cfg.hidden.length))}</ol> : <p className="me-empty">Drag a link here to hide it</p>}
      </section>
    </div>
  </div>;
}
