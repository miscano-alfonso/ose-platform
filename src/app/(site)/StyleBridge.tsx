"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Only does anything when the page is shown inside Admin → Page styles (an iframe on the same site).
// The builder sends the CSS to try out; this page applies it and reports the sizes it now shows.
type Probe = { id: string; sel: string; prop: string };
export function StyleBridge() {
  const path = usePathname();
  useEffect(() => {
    if (window.parent === window) return;
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== window.parent || e.data?.type !== "ose-styles") return;
      const saved = document.getElementById("ose-styles") as HTMLStyleElement | null;
      if (saved) saved.media = "not all";
      let live = document.getElementById("ose-live") as HTMLStyleElement | null;
      if (!live) { live = document.createElement("style"); live.id = "ose-live"; document.body.appendChild(live); }
      live.textContent = String(e.data.css ?? "");
      const sizes: Record<string, number | null> = {};
      for (const p of (e.data.probes ?? []) as Probe[]) {
        const el = p.sel.split(",").map((s) => document.querySelector(s.trim())).find(Boolean);
        const cs = el ? getComputedStyle(el) : null;
        const prop = p.prop === "padding-block" ? "padding-top" : p.prop === "padding-inline" ? "padding-left" : p.prop === "padding" ? "padding-top" : p.prop === "gap" ? "row-gap" : p.prop;
        let v = cs ? parseFloat(cs.getPropertyValue(prop)) : NaN;
        if (p.prop === "line-height" && cs) v = cs.lineHeight === "normal" ? 1.2 : parseFloat(cs.lineHeight) / parseFloat(cs.fontSize);
        sizes[p.id] = Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
      }
      window.parent.postMessage({ type: "ose-sizes", path: location.pathname, sizes }, location.origin);
    };
    window.addEventListener("message", onMsg);
    window.parent.postMessage({ type: "ose-ready", path: location.pathname }, location.origin);
    return () => window.removeEventListener("message", onMsg);
  }, [path]);
  return null;
}
