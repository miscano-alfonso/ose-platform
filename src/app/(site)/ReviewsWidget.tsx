"use client";
import { useEffect, useRef, useState } from "react";
import Script from "next/script";

/**
 * The Elfsight Facebook reviews widget, tidied to fit the page:
 * - its own "What our customers say" title is hidden (the section already has that heading);
 * - its "Review us on Facebook" button becomes our "Read our reviews on Facebook" button.
 * If the widget doesn't appear (blocked, or no widget ID), a plain button to the Facebook reviews shows instead.
 */
export function ReviewsWidget({ widget, url }: { widget: string; url: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const [gaveUp, setGaveUp] = useState(!widget);

  useEffect(() => {
    const el = box.current;
    if (!el || !widget) return;
    const leaves = (root: ParentNode): HTMLElement[] => {
      const out: HTMLElement[] = [];
      root.querySelectorAll<HTMLElement>("*").forEach((n) => { out.push(n); if (n.shadowRoot) out.push(...leaves(n.shadowRoot)); });
      return out;
    };
    const tidy = () => {
      const all = leaves(el);
      if (all.length > 5) setShown(true);
      for (const n of all) {
        const t = (n.textContent || "").trim();
        if (/^what our customers say$/i.test(t) && !n.dataset.oseHidden) {
          // hide the outermost element that holds only this title
          let h: HTMLElement = n;
          while (h.parentElement && h.parentElement !== el && (h.parentElement.textContent || "").trim() === t) h = h.parentElement;
          h.style.display = "none"; h.dataset.oseHidden = "1"; n.dataset.oseHidden = "1";
        }
        if (/^review us on facebook$/i.test(t) && !n.dataset.oseBtn) {
          const b = (n.closest("a,button") as HTMLElement | null) || n;
          b.dataset.oseBtn = "1"; n.dataset.oseBtn = "1";
          // change it in place (the widget keeps managing its own elements)
          n.textContent = "Read our reviews on Facebook";
          if (b instanceof HTMLAnchorElement) { b.href = url; b.target = "_blank"; b.rel = "noopener noreferrer"; }
          else b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); window.open(url, "_blank", "noopener"); }, true);
          b.classList.add("rev-ose-btn");
        }
      }
    };
    const mo = new MutationObserver(tidy);
    mo.observe(el, { childList: true, subtree: true });
    tidy();
    const t = setTimeout(() => { if (leaves(el).length <= 5) setGaveUp(true); }, 15000);
    return () => { mo.disconnect(); clearTimeout(t); };
  }, [widget, url]);

  return <>
    {widget && <><Script src="https://elfsightcdn.com/platform.js" strategy="lazyOnload" /><div ref={box} className={`elfsight-app-${widget} rev-widget`} data-elfsight-app-lazy /></>}
    {gaveUp && !shown && <div className="rev-fallback"><a className="btn btn-brand" href={url} target="_blank" rel="noopener noreferrer">Read our reviews on Facebook</a></div>}
  </>;
}
