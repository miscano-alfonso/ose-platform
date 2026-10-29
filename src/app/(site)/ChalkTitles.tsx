"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { HEADER_ART } from "./header-art";

// Page titles drawn like chalk on a board: each letter is tilted and nudged a touch (the same way every time for the
// same title), in Jost (the site's Futura-style face) with the drawing's chalk texture (bento.css .chalkt).
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
export function ChalkTitles() {
  const path = usePathname();
  useEffect(() => {
    // a few floating chalk symbols on the right of each title panel, like the home page
    document.querySelectorAll<HTMLElement>(".s-phead > .wrap").forEach((w) => {
      if (w.querySelector(".ph-art")) return;
      const d = document.createElement("div"); d.className = "ph-art"; d.setAttribute("aria-hidden", "true"); d.innerHTML = HEADER_ART; w.prepend(d);
    });
    // page titles and the home page headline: every letter gets its own small tilt (keeping any line breaks and
    // coloured parts, like the yellow "From home.")
    document.querySelectorAll<HTMLElement>(".s-phead h1:not([data-chalk]), .bh-hero h1:not([data-chalk])").forEach((h) => {
      const text = (h.textContent ?? "").replace(/\s+/g, " ").trim(); if (!text) return;
      let seed = hash(text);
      const rnd = () => { seed = Math.imul(seed ^ (seed >>> 15), 2246822507) >>> 0; seed ^= seed >>> 13; return (seed % 1000) / 1000; };
      h.setAttribute("aria-label", text); h.setAttribute("data-chalk", ""); h.classList.add("chalkt");
      const walker = document.createTreeWalker(h, NodeFilter.SHOW_TEXT), nodes: Text[] = [];
      while (walker.nextNode()) nodes.push(walker.currentNode as Text);
      for (const n of nodes) {
        const frag = document.createDocumentFragment();
        for (const ch of n.data) {
          const sp = document.createElement("span"); sp.setAttribute("aria-hidden", "true");
          if (/\s/.test(ch)) { sp.className = "sp"; sp.textContent = " "; frag.append(sp); continue; }
          sp.textContent = ch;
          sp.style.setProperty("--a", `${((rnd() - .5) * 3).toFixed(1)}deg`);
          sp.style.setProperty("--dy", `${((rnd() - .5) * .03).toFixed(3)}em`);
          frag.append(sp);
        }
        n.replaceWith(frag);
      }
    });
  }, [path]);
  return null;
}
