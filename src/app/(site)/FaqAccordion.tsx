"use client";
import { useEffect } from "react";

// FAQs: opening a question closes the one that was open, and the answers slide open and shut smoothly.
// Works on the plain <details> list (still opens and closes without JavaScript, just without the animation).
export function FaqAccordion() {
  useEffect(() => {
    const list = document.querySelector<HTMLElement>(".faq"); if (!list) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ease = "cubic-bezier(.2,.7,.2,1)";
    const shut = (d: HTMLDetailsElement) => {
      const a = d.querySelector<HTMLElement>(".ans"); if (!a || reduce) { d.open = false; return; }
      const h = a.offsetHeight;
      const pb = getComputedStyle(a).paddingBottom;
      a.animate([{ height: `${h}px`, paddingBottom: pb, opacity: 1 }, { height: "0px", paddingBottom: "0px", opacity: 0 }], { duration: 320, easing: ease }).onfinish = () => { d.open = false; };
    };
    const open = (d: HTMLDetailsElement) => {
      d.open = true; const a = d.querySelector<HTMLElement>(".ans"); if (!a || reduce) return;
      const h = a.offsetHeight;
      const pb = getComputedStyle(a).paddingBottom;
      a.animate([{ height: "0px", paddingBottom: "0px", opacity: 0 }, { height: `${h}px`, paddingBottom: pb, opacity: 1 }], { duration: 380, easing: ease });
    };
    const click = (e: MouseEvent) => {
      const s = (e.target as HTMLElement).closest("summary"); if (!s || !list.contains(s)) return;
      const d = s.parentElement as HTMLDetailsElement; e.preventDefault();
      if (d.open) { shut(d); return; }
      list.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((o) => { if (o !== d) shut(o); });
      open(d);
    };
    list.addEventListener("click", click);
    return () => list.removeEventListener("click", click);
  }, []);
  return null;
}
