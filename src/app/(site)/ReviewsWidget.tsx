"use client";
import { useEffect, useRef, useState } from "react";
import Script from "next/script";

/**
 * The Elfsight Facebook reviews widget, tidied to fit the page:
 * - its own "What our customers say" title is hidden (the section already has that heading);
 * - its "Review us on Facebook" button becomes our "Read our reviews on Facebook" button.
 * If the widget doesn't appear (blocked, or no widget ID), a plain button to the Facebook reviews shows instead.
 */
type Rev = { name: string; date: string; text: string };
export function ReviewsWidget({ widget, url, rating, count }: { widget: string; url: string; rating?: string; count?: string }) {
  const [revs, setRevs] = useState<Rev[]>([]);
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
      // once the widget has drawn its reviews, read them and show them as our own sliding row (the widget itself is then hidden)
      const items = [...el.querySelectorAll<HTMLElement>('[class*="ReviewContainer__Inner"]')].map((n) => {
        const lines = (n.innerText || "").split("\n").map((x) => x.trim()).filter(Boolean);
        return { name: lines[0] ?? "", date: lines[1] ?? "", text: lines[2] ?? "" };
      }).filter((r) => r.name && r.text.length > 20);
      if (items.length >= 2) setRevs((old) => old.length >= items.length ? old : items);
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

  const row = revs.map((r, i) => <figure className="rv-card" key={i}><blockquote>{r.text}</blockquote>
    <figcaption><b>{r.name}</b><span>{r.date} · Facebook</span></figcaption></figure>);
  return <>
    {revs.length > 0 && <div className="rv-own">
      <div className="rv-head"><span className="rv-score"><b>{rating ?? "4.8"}</b><span className="rv-stars" aria-hidden="true">★★★★★</span><span>{count ? `${count} reviews` : "Reviews"} on Facebook</span></span>
        <a className="btn btn-line sm" href={url} target="_blank" rel="noopener noreferrer">Read them all</a></div>
      <div className="rv-marquee" aria-label="Reviews from families" tabIndex={0}><div className="rv-track" style={{ ["--n" as string]: revs.length }}>{row}<div className="rv-dup" aria-hidden="true">{row}</div></div></div>
    </div>}
    {widget && <><Script src="https://elfsightcdn.com/platform.js" strategy="lazyOnload" /><div ref={box} className={`elfsight-app-${widget} rev-widget${revs.length ? " rev-done" : ""}`} data-elfsight-app-lazy /></>}
    {gaveUp && !shown && <div className="rev-fallback"><a className="btn btn-brand" href={url} target="_blank" rel="noopener noreferrer">Read our reviews on Facebook</a></div>}
  </>;
}
