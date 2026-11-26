"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Hit = { title: string; sub?: string; href: string; tag?: string };
type Group = { key: string; label: string; hits: Hit[]; more?: boolean };

/** 27 Nov: the search box at the top of the admin and teacher side menus. Suggestions appear as you type (students,
 *  families, teachers, classes, workshops, pages; teachers: their students and classes); ↑ ↓ to move, Enter to open,
 *  Enter on nothing chosen (or "See all results") opens the full results page. Ctrl/⌘ K or "/" jumps to it from anywhere. */
export function MenuSearch({ area, page }: { area: "admin" | "teacher"; page: string }) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState(""), [groups, setGroups] = useState<Group[]>([]), [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [sel, setSel] = useState(-1);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null), seq = useRef(0);
  const flat = groups.flatMap((g) => g.hits);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  // the side menu scrolls (overflow), so the list is placed on the page, under the box, rather than inside the menu
  useEffect(() => {
    if (!open) return;
    const place = () => { const r = input.current?.getBoundingClientRect(); if (r) setPos({ left: r.left, top: r.bottom + 6, width: Math.max(r.width, Math.min(420, window.innerWidth - r.left - 12)) }); };
    place(); window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if (((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") || (e.key === "/" && !typing)) {
        e.preventDefault();
        const el = input.current;
        if (el && el.offsetParent !== null) { el.focus(); el.select(); } else router.push(page);   // the side menu is hidden: open the search page
      }
    };
    const click = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("keydown", key); document.addEventListener("mousedown", click);
    return () => { window.removeEventListener("keydown", key); document.removeEventListener("mousedown", click); };
  }, [page, router]);

  const look = (v: string) => {
    setQ(v); setSel(-1);
    if (t.current) clearTimeout(t.current);
    if (v.trim().length < 2) { setGroups([]); setOpen(false); return; }
    t.current = setTimeout(async () => {
      const n = ++seq.current; setBusy(true);
      try {
        const r = await fetch(`/admin/search-api?area=${area}&q=${encodeURIComponent(v.trim())}`, { cache: "no-store" });
        const j = await r.json();
        if (n === seq.current) { setGroups(j.groups ?? []); setOpen(true); }
      } catch { /* offline: keep what's shown */ } finally { if (n === seq.current) setBusy(false); }
    }, 160);
  };
  const go = (href: string) => { setOpen(false); setQ(""); setGroups([]); router.push(href); };
  const all = () => q.trim() && go(`${page}?q=${encodeURIComponent(q.trim())}`);

  let i = -1;
  return <div className="msr" ref={box} role="search">
    <svg className="msr-i" viewBox="0 0 20 20" aria-hidden="true"><path d="M8.5 3a5.5 5.5 0 1 0 0 11a5.5 5.5 0 1 0 0-11 M12.6 12.6L17 17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
    <input ref={input} value={q} onChange={(e) => look(e.target.value)} onFocus={() => groups.length && setOpen(true)}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setSel((s) => Math.min(flat.length, s + 1)); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(-1, s - 1)); }
        else if (e.key === "Enter") { e.preventDefault(); if (sel >= 0 && sel < flat.length) go(flat[sel].href); else all(); }
        else if (e.key === "Escape") { if (open) setOpen(false); else { look(""); input.current?.blur(); } }
      }}
      placeholder={area === "admin" ? "Search everything" : "Search my students, classes…"} aria-label="Search" autoComplete="off" spellCheck={false} data-lpignore="true"
      role="combobox" aria-expanded={open} aria-controls="msr-list" aria-activedescendant={sel >= 0 ? `msr-${sel}` : undefined} />
    {busy ? <span className="msr-k" aria-hidden="true">…</span> : !q && <span className="msr-k" aria-hidden="true">⌘K</span>}
    {open && pos && <div className="msr-pop" id="msr-list" role="listbox" style={{ left: pos.left, top: pos.top, width: pos.width }}>
      {groups.length === 0 ? <p className="msr-none">Nothing found for “{q.trim()}”.</p> : groups.map((g) => <div key={g.key} className="msr-g">
        <div className="msr-h">{g.label}</div>
        {g.hits.map((h) => { i++; const me = i; return <a key={h.href + me} id={`msr-${me}`} role="option" aria-selected={sel === me} className={`msr-o${sel === me ? " on" : ""}`} href={h.href}
          onMouseEnter={() => setSel(me)} onClick={(e) => { e.preventDefault(); go(h.href); }}><b>{h.title}</b>{h.sub && <span>{h.sub}</span>}</a>; })}
      </div>)}
      <a className={`msr-all${sel === flat.length ? " on" : ""}`} href={`${page}?q=${encodeURIComponent(q.trim())}`} onMouseEnter={() => setSel(flat.length)} onClick={(e) => { e.preventDefault(); all(); }}>See all results for “{q.trim()}” →</a>
    </div>}
  </div>;
}
