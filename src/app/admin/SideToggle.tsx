"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/** Hides and shows the side menu (remembered in this browser). 26 Nov (Alfonso): with the menu hidden there's no Menu
 *  button any more; moving the pointer close to the left edge of the window slides a tab out, which opens the menu
 *  again. On touch screens (no pointer to move) the tab stays half out. */
export function SideToggle({ home }: { home?: { href: string; label: string } }) {
  const path = usePathname();
  const [closed, setClosed] = useState(false);
  const [near, setNear] = useState(false);
  useEffect(() => { try { setClosed(localStorage.getItem("ose-side") === "closed"); } catch { /* private browsing */ } }, []);
  useEffect(() => {
    document.querySelector(".adm .app")?.classList.toggle("side-closed", closed);
    try { localStorage.setItem("ose-side", closed ? "closed" : "open"); } catch { /* */ }
  }, [closed]);
  useEffect(() => {
    if (!closed) { setNear(false); return; }
    let t: ReturnType<typeof setTimeout> | undefined;
    const move = (e: MouseEvent) => {
      if (e.clientX <= 28) { if (t) clearTimeout(t); setNear(true); }
      else if (e.clientX > 90) { if (t) clearTimeout(t); t = setTimeout(() => setNear(false), 350); }
    };
    const leave = () => { t = setTimeout(() => setNear(false), 350); };
    window.addEventListener("mousemove", move, { passive: true }); document.addEventListener("mouseleave", leave);
    return () => { window.removeEventListener("mousemove", move); document.removeEventListener("mouseleave", leave); if (t) clearTimeout(t); };
  }, [closed]);
  return <>
    {!closed && <button type="button" className="side-toggle" onClick={() => setClosed(true)} aria-expanded="true" aria-label="Hide the menu" title="Hide the menu">
      <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M12.5 4.5L7 10l5.5 5.5" /></svg></button>}
    {closed && <button type="button" className={`side-edge${near ? " out" : ""}`} onClick={() => { setClosed(false); setNear(false); }} onFocus={() => setNear(true)} onBlur={() => setNear(false)}
      aria-expanded="false" aria-label="Show the menu" title="Show the menu">
      <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14" /></svg>
      <span>Menu</span></button>}
    {/* 27 Nov (Alfonso): with the menu hidden, a button back to My day (or the dashboard), except on that page */}
    {closed && home && path !== home.href && <a className="side-home" href={home.href} title={`Back to ${home.label}`}>
      <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 9l7-6 7 6v8H3z M8 17v-5h4v5" /></svg>{home.label}</a>}
  </>;
}
