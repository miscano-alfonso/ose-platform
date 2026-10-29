"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Page titles drawn like chalk on a board: each letter is tilted and nudged a touch (the same way every time for the
// same title), in Jost (the site's Futura-style face) with the drawing's chalk texture (bento.css .chalkt).
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
export function ChalkTitles() {
  const path = usePathname();
  useEffect(() => {
    document.querySelectorAll<HTMLElement>(".s-phead h1:not([data-chalk])").forEach((h) => {
      const text = h.textContent ?? ""; if (!text.trim()) return;
      let seed = hash(text);
      const rnd = () => { seed = Math.imul(seed ^ (seed >>> 15), 2246822507) >>> 0; seed ^= seed >>> 13; return (seed % 1000) / 1000; };
      h.setAttribute("aria-label", text); h.setAttribute("data-chalk", ""); h.classList.add("chalkt");
      h.replaceChildren(...[...text].map((ch) => {
        const s = document.createElement("span"); s.setAttribute("aria-hidden", "true");
        if (ch === " ") { s.className = "sp"; s.textContent = " "; return s; }
        s.textContent = ch;
        s.style.setProperty("--a", `${((rnd() - .5) * 3).toFixed(1)}deg`);
        s.style.setProperty("--dy", `${((rnd() - .5) * .03).toFixed(3)}em`);
        return s;
      }));
    });
  }, [path]);
  return null;
}
