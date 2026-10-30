"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Page content fades up gently as it comes into view (the same feel as the page titles and course cards, option D):
// home page tiles and hero, and each block of the other pages. Things already on screen come in one after another.
// The hiding is switched on by a tiny script before the page draws (html.rv), so nothing flashes; without JavaScript,
// or with reduced motion, everything simply shows. A CSS fallback shows anything not revealed within a few seconds.
export const REVEAL = [".bh-grid > .bh-t:not(.bh-hero)", ".bh-three > .bh-t", ".bh-hero > :not(.bh-marks):not(.bh-scene)", "main .s-sec .wrap > :not(.cgrid)", "main .s-sec .cgrid > :not(.course)"].join(",");
export function Reveal() {
  const path = usePathname();
  useEffect(() => {
    if (!document.documentElement.classList.contains("rv")) return;
    let batch = 0, last = 0;
    const io = new IntersectionObserver((es) => {
      const now = performance.now(); if (now - last > 200) batch = 0; last = now;
      es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left)
        .forEach((e) => { const el = e.target as HTMLElement; el.style.setProperty("--ri", String(Math.min(batch++, 8))); el.classList.add("rv-in"); io.unobserve(el); });
    }, { threshold: 0.08, rootMargin: "0px 0px -4% 0px" });
    document.querySelectorAll<HTMLElement>(REVEAL).forEach((el) => { if (!el.classList.contains("rv-in")) io.observe(el); });
    return () => io.disconnect();
  }, [path]);
  return null;
}
