"use client";
import { useEffect } from "react";

// Home page: tiles and course cards tip towards the mouse in 3D while it's over them (up to about 6°). Mouse only; off with reduced motion.
const SEL = ".bh-home a.bh-t, .bh-home .bh-course";
export function TiltTiles() {
  useEffect(() => {
    if (!matchMedia("(hover: hover) and (pointer: fine)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let el: HTMLElement | null = null;
    const reset = (t: HTMLElement) => { t.style.removeProperty("--rx"); t.style.removeProperty("--ry"); t.classList.remove("tilt-on"); };
    const move = (e: PointerEvent) => {
      const t = (e.target as Element | null)?.closest?.(SEL) as HTMLElement | null;
      if (el && el !== t) reset(el);
      el = t; if (!t) return;
      const r = t.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      const max = r.width > 500 ? 4 : 6; // wide tiles tip a little less
      t.style.setProperty("--ry", `${(x * 2 * max).toFixed(2)}deg`); t.style.setProperty("--rx", `${(-y * 2 * max).toFixed(2)}deg`);
      t.classList.add("tilt-on");
    };
    const leave = () => { if (el) reset(el); el = null; };
    document.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", leave);
    return () => { document.removeEventListener("pointermove", move); document.removeEventListener("pointerleave", leave); if (el) reset(el); };
  }, []);
  return null;
}
