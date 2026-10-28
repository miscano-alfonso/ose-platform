"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ICONS, type ResolvedGroup } from "@/lib/menus";

/** Any dashboard's menu (admin, teacher, parent, student), drawn from the school's arrangement in Admin → Menus.
 *  With several groups, one is open at a time: the one holding the page you're on. */
export function MenuNav({ id, label, groups, counts = {}, root, alias = {} }: {
  id: string; label: string; groups: ResolvedGroup[]; counts?: Record<string, number>; root: string; alias?: Record<string, string>;
}) {
  const path0 = usePathname(), path = alias[path0] ?? path0;
  const [open, setOpen] = useState(false);
  const here = (h: string) => h === root ? path === h : path === h || path.startsWith(h + "/");
  const holds = (g: ResolvedGroup) => g.items.some((x) => here(x.href));
  const start = groups.find(holds) ?? groups.find((g) => g.title === "Main menu") ?? [...groups].sort((a, b) => b.items.length - a.items.length)[0];
  const [section, setSection] = useState(start?.title ?? "");
  const list = (g: ResolvedGroup) => <div className="ngrp-list">{g.items.map((x) => <Link key={x.href} href={x.href} aria-current={here(x.href) ? "page" : undefined} onClick={() => setOpen(false)}>
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[x.icon] ?? ICONS.home} /></svg>
    <span>{x.label}</span>{counts[x.href] ? <b className="cnt">{counts[x.href]}</b> : null}</Link>)}</div>;
  return <>
    <button className="abtn side-btn menu-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>{open ? "Close menu" : "Menu"}</button>
    <nav id={id} className={`nav${open ? " open" : ""}`} aria-label={label}>
      {groups.length === 1 ? list(groups[0]) : groups.map((g, i) => <div key={i} className="ngrp">
        <button type="button" className="ngrp-h" aria-expanded={section === g.title} onClick={() => setSection(section === g.title ? start?.title ?? "" : g.title)}>{g.title}</button>
        {section === g.title && list(g)}</div>)}
    </nav>
  </>;
}
