"use client";
import Link from "@/app/(site)/HoverLink";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

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
  // phones and tablets: the open menu fills the screen under the top bar, so the page behind doesn't scroll
  const nav = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("menu-open", open);
    if (!open) return;
    const place = () => { const bar = nav.current?.closest<HTMLElement>(".s-nav"); if (bar) root.style.setProperty("--menu-top", `${bar.offsetHeight}px`); };   // the bar is pinned to the top while the menu is open
    place(); window.addEventListener("resize", place);
    return () => { window.removeEventListener("resize", place); root.classList.remove("menu-open"); };
  }, [open]);
  return <>
    <button className="s-burger" aria-expanded={open} aria-controls="site-menu" aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen(!open)}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}</svg>
    </button>
    <nav ref={nav} id="site-menu" className={`s-links${open ? " open" : ""}`} aria-label="Main">
      {items.map(([t, h]) => <Link key={h} href={h} aria-current={path === h ? "page" : undefined} onClick={() => setOpen(false)}>{t}</Link>)}
      {/* phones: the basket and account sit in the menu instead of the top bar */}
      <Link className="s-mob" href="/cart" aria-current={path === "/cart" ? "page" : undefined} onClick={() => setOpen(false)}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4h2l2.4 10.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6.2M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM17 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" /></svg>Basket</Link>
      <Link className="s-mob" href="/account" aria-current={path?.startsWith("/account") ? "page" : undefined} onClick={() => setOpen(false)}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c.8-4 4-6 8-6s7.2 2 8 6" /></svg>My account</Link>
    </nav>
  </>;
}
