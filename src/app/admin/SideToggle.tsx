"use client";
import { useEffect, useState } from "react";

// Hide the side menu to give the page more room; remembered on this device. A small button brings it back.
export function SideToggle() {
  const [closed, setClosed] = useState(false);
  useEffect(() => { try { setClosed(localStorage.getItem("ose-side") === "closed"); } catch { /* private browsing */ } }, []);
  useEffect(() => {
    document.querySelector(".adm .app")?.classList.toggle("side-closed", closed);
    try { localStorage.setItem("ose-side", closed ? "closed" : "open"); } catch { /* */ }
  }, [closed]);
  return <button type="button" className="side-toggle" onClick={() => setClosed(!closed)} aria-expanded={!closed} aria-label={closed ? "Show the menu" : "Hide the menu"} title={closed ? "Show the menu" : "Hide the menu"}>
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      {closed ? <path d="M3 5h14M3 10h14M3 15h14" /> : <path d="M12.5 4.5L7 10l5.5 5.5" />}</svg>{closed && <span>Menu</span>}</button>;
}
