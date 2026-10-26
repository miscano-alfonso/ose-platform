"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const P: Record<string, string> = {
  home: "M3 9l7-6 7 6v8H3z M8 17v-5h4v5", att: "M5 3h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M6.5 10l2.5 2.5 4.5-5",
  rep: "M5 2.5h7l3 3v12H5z M8 9h5M8 12h5M8 15h3", fam: "M7 4a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5 M2.5 16c.5-3 2.4-4.5 4.5-4.5s4 1.5 4.5 4.5 M14 6a2 2 0 1 0 0 4a2 2 0 1 0 0-4 M11.5 16c.3-2 1.3-3.3 2.5-3.3s2.6 1 3 3.3",
  cal: "M4 4h12a1.5 1.5 0 0 1 1.5 1.5v10A1.5 1.5 0 0 1 16 17H4a1.5 1.5 0 0 1-1.5-1.5v-10A1.5 1.5 0 0 1 4 4z M2.5 8h15 M6.5 2v4M13.5 2v4",
  mail: "M4 4.5h12a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 14V6A1.5 1.5 0 0 1 4 4.5z M3 5.5l7 5.5 7-5.5",
  set: "M10 7.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5 M10 2v2.5M10 15.5V18M2 10h2.5M15.5 10H18M4.3 4.3l1.8 1.8M13.9 13.9l1.8 1.8M4.3 15.7l1.8-1.8M13.9 6.1l1.8-1.8",
  pay: "M4 4.5h12a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 14V6A1.5 1.5 0 0 1 4 4.5z M2.5 8h15 M5.5 12.5h3",
  cls: "M4 4h12a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 16 15H4a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 4 4z M6 18h8M10 15v3", chat: "M3 4h14v9H8l-4 3v-3H3z",
  star: "M10 2.5l2.3 4.7 5.2.8-3.8 3.6.9 5.1L10 14.3l-4.6 2.4.9-5.1L2.5 8l5.2-.8z",
};
export type NavItem = [string, string, string, number?];
/** The parent's or student's menu, styled like the admin's. */
export function FamilyNav({ items, root }: { items: NavItem[]; root: string }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const here = (h: string) => h === root ? path === h : path === h || path.startsWith(h + "/");
  return <>
    <button className="abtn side-btn menu-toggle" aria-expanded={open} aria-controls="f-nav" onClick={() => setOpen(!open)}>{open ? "Close menu" : "Menu"}</button>
    <nav id="f-nav" className={`nav${open ? " open" : ""}`} aria-label="Menu"><div className="ngrp-list">
      {items.map(([label, href, ic, n]) => <Link key={href} href={href} aria-current={here(href) ? "page" : undefined} onClick={() => setOpen(false)}>
        <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={P[ic] ?? P.home} /></svg>
        <span>{label}</span>{n ? <b className="cnt">{n}</b> : null}</Link>)}
    </div></nav>
  </>;
}
