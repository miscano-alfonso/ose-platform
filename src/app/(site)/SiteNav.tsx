"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// Desktop: the links in a row. Phone: a hamburger button that opens them as a full-width list.
export function SiteNav({ items }: { items: [string, string][] }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open]);
  return <>
    <button className="s-burger" aria-expanded={open} aria-controls="site-menu" aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen(!open)}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}</svg>
    </button>
    <nav id="site-menu" className={`s-links${open ? " open" : ""}`} aria-label="Main">
      {items.map(([t, h]) => <Link key={h} href={h} aria-current={path === h ? "page" : undefined} onClick={() => setOpen(false)}>{t}</Link>)}
    </nav>
  </>;
}
