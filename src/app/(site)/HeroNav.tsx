"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Home page hero and the other pages' title panels: the hero runs full screen under the menu bar. While the hero is behind it, the bar is see-through
// (class "over"); once the page scrolls past the hero it goes back to normal. Also tells the CSS how tall the bar is.
// The menu stays on screen between pages, so the hero is looked up afresh on every check (and again after each page change):
// holding on to the first page's hero left the dark bar stuck after moving to another page or scrolling back up.
export function HeroNav() {
  const path = usePathname();
  useEffect(() => {
    const nav = document.querySelector<HTMLElement>(".s-nav");
    if (!nav) return;
    const root = document.documentElement;
    const set = () => {
      root.style.setProperty("--navh", `${nav.offsetHeight}px`);
      const hero = document.querySelector<HTMLElement>(".bh-hero, .s-phead > .wrap");
      const over = !!hero && window.scrollY < hero.offsetHeight - nav.offsetHeight - 10;
      nav.classList.toggle("over", over); nav.classList.toggle("past", !!hero && !over);
      nav.classList.toggle("top", window.scrollY < 8);
      // the level buttons under some title panels: once stuck under the bar they get a solid band with a line beneath (and the bar loses its own line)
      const ph = document.querySelector<HTMLElement>(".ph-sticky");
      const stuck = !!ph && window.scrollY > 8 && Math.abs(ph.getBoundingClientRect().top - nav.offsetHeight) < 1.5;
      ph?.classList.toggle("stuck", stuck); nav.classList.toggle("ph-on", stuck);
      if (ph) root.style.setProperty("--phh", `${ph.offsetHeight}px`);
    };
    set(); requestAnimationFrame(set); const t = window.setTimeout(set, 300);   // after the new page has laid out
    window.addEventListener("scroll", set, { passive: true }); window.addEventListener("resize", set);
    const ro = new ResizeObserver(set); ro.observe(nav);
    return () => { window.clearTimeout(t); window.removeEventListener("scroll", set); window.removeEventListener("resize", set); ro.disconnect(); nav.classList.remove("over", "top", "past", "ph-on"); };
  }, [path]);
  return null;
}
