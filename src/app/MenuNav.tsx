"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ICONS, type ResolvedGroup } from "@/lib/menus";

/** Any dashboard's menu (admin, teacher, parent, student), drawn from the school's arrangement in Admin → Menus.
 *  With several groups, one is open at a time: the one holding the page you're on. */
/** The group holding the page you're on (else Main menu, else the biggest group). */
export function startGroup(groups: ResolvedGroup[], path: string, root: string) {
  const here = (h: string) => h === root ? path === h : path === h || path.startsWith(h + "/");
  return groups.find((g) => g.items.some((x) => here(x.href))) ?? groups.find((g) => g.title === "Main menu") ?? [...groups].sort((a, b) => b.items.length - a.items.length)[0];
}
const EV = "ose-menu-section";
/** One section open at a time, shared by the top tabs and the side menu (4 Nov). Follows the page when you go somewhere in another section. */
function useSection(groups: ResolvedGroup[], path: string, root: string) {
  const start = startGroup(groups, path, root);
  const [section, setSection] = useState(start?.title ?? "");
  useEffect(() => { const on = (e: Event) => setSection((e as CustomEvent<string>).detail); window.addEventListener(EV, on); return () => window.removeEventListener(EV, on); }, []);
  useEffect(() => { const here = (h: string) => h === root ? path === h : path === h || path.startsWith(h + "/");
    if (start && !groups.find((g) => g.title === section)?.items.some((x) => here(x.href)) && start.items.some((x) => here(x.href))) setSection(start.title);
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (t: string) => { setSection(t); window.dispatchEvent(new CustomEvent(EV, { detail: t })); };
  return { section, pick, start };
}
/** The admin's sections as tabs across the top: choosing one opens its top link and changes the side menu. */
export function SectionTabs({ groups, counts = {}, root, alias = {} }: { groups: ResolvedGroup[]; counts?: Record<string, number>; root: string; alias?: Record<string, string> }) {
  const path0 = usePathname(), path = alias[path0] ?? path0;
  const { section, pick } = useSection(groups, path, root);
  const router = useRouter();
  // when the tabs don't fit beside the pickers, they turn into a dropdown (5 Nov); measured from the tabs kept hidden for size
  const wrap = useRef<HTMLDivElement>(null), tabs = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  useLayoutEffect(() => {
    const w = wrap.current, t = tabs.current; if (!w || !t) return;
    const check = () => setCompact(t.scrollWidth > w.clientWidth + 1);
    check(); const ro = new ResizeObserver(check); ro.observe(w); document.fonts?.ready.then(check).catch(() => {});
    return () => ro.disconnect();
  }, [groups.length]);
  if (groups.length < 2) return null;
  // the tab opens the section's top link (as listed in the side menu, which leaves out the dashboard: that's the logo)
  const go = (g: ResolvedGroup) => { pick(g.title); const first = g.items.some((x) => x.href === root) ? g.items.find((x) => x.href === root)   // the group with the dashboard opens the dashboard
      : g.items.find((x) => !x.off && x.href.startsWith("/")) ?? g.items.find((x) => x.href.startsWith("/"));
    if (first && first.href !== path) router.push(first.href); };
  const label = (g: ResolvedGroup) => g.title === "Main menu" ? "Main" : g.title;
  const count = (g: ResolvedGroup) => g.items.reduce((a, x) => a + (counts[x.href] ?? 0), 0);
  return <div className="sec-wrap" ref={wrap}>
    {compact && <select className="sec-select" aria-label="Menu section" value={section} onChange={(e) => { const g = groups.find((x) => x.title === e.target.value); if (g) go(g); }}>
      {groups.map((g) => { const n = count(g); return <option key={g.title} value={g.title}>{label(g)}{n ? ` (${n})` : ""}</option>; })}</select>}
    <div ref={tabs} className={`sec-tabs${compact ? " measure" : ""}`} role="tablist" aria-label="Menu sections" aria-hidden={compact || undefined}>{groups.map((g) => { const n = count(g);
      return <button key={g.title} type="button" role="tab" tabIndex={compact ? -1 : undefined} aria-selected={section === g.title} className={section === g.title ? "on" : undefined} onClick={() => go(g)}>
        {label(g)}{n ? <b className="cnt">{n}</b> : null}</button>; })}</div>
  </div>;
}

export function MenuNav({ id, label, groups, counts = {}, root, alias = {}, tabbed = false }: {
  id: string; label: string; groups: ResolvedGroup[]; counts?: Record<string, number>; root: string; alias?: Record<string, string>; tabbed?: boolean;
}) {
  const path0 = usePathname(), path = alias[path0] ?? path0;
  const [open, setOpen] = useState(false);
  const here = (h: string) => h === root ? path === h : path === h || path.startsWith(h + "/");
  const { section, pick: setSection, start } = useSection(groups, path, root);
  const list = (g: ResolvedGroup) => <div className="ngrp-list">{g.items.filter((x) => !(tabbed && x.href === root)).map((x) => <Link key={x.href} href={x.href} aria-current={here(x.href) ? "page" : undefined} onClick={() => setOpen(false)} className={x.off ? "off" : undefined} title={x.off ? "Switched off for now" : undefined}>
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[x.icon] ?? ICONS.home} /></svg>
    <span>{x.label}</span>{counts[x.href] ? <b className="cnt">{counts[x.href]}</b> : null}</Link>)}</div>;
  return <>
    <button className="abtn side-btn menu-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>{open ? "Close menu" : "Menu"}</button>
    <nav id={id} className={`nav${open ? " open" : ""}${tabbed && groups.length > 1 ? " tabbed" : ""}`} aria-label={label}>
      {groups.length === 1 ? list(groups[0]) : groups.map((g, i) => <div key={i} className="ngrp">
        <button type="button" className="ngrp-h" aria-expanded={section === g.title} onClick={() => setSection(section === g.title ? start?.title ?? "" : g.title)}>{g.title}</button>
        {section === g.title && list(g)}</div>)}
    </nav>
  </>;
}
