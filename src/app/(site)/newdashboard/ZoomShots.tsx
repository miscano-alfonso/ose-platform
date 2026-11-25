"use client";
import { useEffect, useRef, useState } from "react";

// /newdashboard (25 Nov): click (or Enter on) a screenshot to see it large. The picture showing (light or dark) is opened
// to fit the screen; click it to see it at full size and scroll around; Escape, the × or the backdrop closes it.
export function ZoomShots() {
  const dlg = useRef<HTMLDialogElement>(null);
  const [shot, setShot] = useState<{ src: string; alt: string } | null>(null);
  const [full, setFull] = useState(false);
  useEffect(() => {
    const pick = (t: EventTarget | null) => (t as HTMLElement | null)?.closest<HTMLElement>(".nd-shot, .nd-phone");
    const open = (fig: HTMLElement) => {
      const img = [...fig.querySelectorAll("img")].find((i) => getComputedStyle(i).display !== "none");
      if (!img) return;
      setShot({ src: img.currentSrc || img.src, alt: img.alt }); setFull(false); dlg.current?.showModal();
    };
    const click = (e: MouseEvent) => { const f = pick(e.target); if (f) open(f); };
    const key = (e: KeyboardEvent) => { const f = pick(e.target); if (f && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(f); } };
    document.addEventListener("click", click); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("click", click); document.removeEventListener("keydown", key); };
  }, []);
  return <dialog ref={dlg} className="nd-zoom" aria-label={shot?.alt ?? "Screenshot"} onClick={(e) => { if (e.target === dlg.current) dlg.current?.close(); }} onClose={() => setShot(null)}>
    <button type="button" className="nd-zclose" aria-label="Close" onClick={() => dlg.current?.close()}>×</button>
    {shot && <div className={`nd-zwrap${full ? " full" : ""}`} onClick={(e) => { if (e.target === e.currentTarget) dlg.current?.close(); }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={shot.src} alt={shot.alt} onClick={() => setFull((f) => !f)} title={full ? "Fit to screen" : "See full size"} />
    </div>}
  </dialog>;
}
