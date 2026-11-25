"use client";
import { useEffect, useRef } from "react";

// /newdashboard: the sticky row of section links under the header. The section on screen is highlighted
// (and, on phones where the row scrolls sideways, kept in view).
export function JumpNav({ items }: { items: { id: string; label: string }[] }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = ref.current; if (!nav) return;
    const links = new Map(items.map((i) => [i.id, nav.querySelector<HTMLAnchorElement>(`a[href="#${i.id}"]`)]));
    const pick = () => {
      const line = (nav.getBoundingClientRect().bottom || 0) + 160;
      let on = "";
      for (const i of items) { const el = document.getElementById(i.id); if (el && el.getBoundingClientRect().top <= line) on = i.id; }
      links.forEach((a, id) => { if (!a) return; if (id === on) { if (a.getAttribute("aria-current") !== "true") { a.setAttribute("aria-current", "true"); if (nav.scrollWidth > nav.clientWidth) nav.scrollTo({ left: a.offsetLeft - 16, behavior: "smooth" }); } } else a.removeAttribute("aria-current"); });
    };
    pick(); window.addEventListener("scroll", pick, { passive: true }); window.addEventListener("resize", pick);
    return () => { window.removeEventListener("scroll", pick); window.removeEventListener("resize", pick); };
  }, [items]);
  return <nav ref={ref} className="nd-jump" aria-label="On this page">{items.map((i) => <a key={i.id} href={`#${i.id}`}>{i.label}</a>)}</nav>;
}
