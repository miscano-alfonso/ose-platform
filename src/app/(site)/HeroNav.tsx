"use client";
import { useEffect } from "react";

// Home page only: the hero runs full screen under the menu bar. While the hero is behind it, the bar is see-through
// (class "over"); once the page scrolls past the hero it goes back to normal. Also tells the CSS how tall the bar is.
export function HeroNav() {
  useEffect(() => {
    const nav = document.querySelector<HTMLElement>(".s-nav"), hero = document.querySelector<HTMLElement>(".bh-hero");
    if (!nav || !hero) return;
    const root = document.documentElement;
    const set = () => {
      root.style.setProperty("--navh", `${nav.offsetHeight}px`);
      nav.classList.toggle("over", window.scrollY < hero.offsetHeight - nav.offsetHeight - 10);
    };
    set();
    window.addEventListener("scroll", set, { passive: true }); window.addEventListener("resize", set);
    const ro = new ResizeObserver(set); ro.observe(nav);
    return () => { window.removeEventListener("scroll", set); window.removeEventListener("resize", set); ro.disconnect(); nav.classList.remove("over"); root.style.removeProperty("--navh"); };
  }, []);
  return null;
}
