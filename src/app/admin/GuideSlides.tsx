"use client";
import { useEffect, useRef, useState } from "react";

/** 27 Nov: "How it works" button that opens a short step-by-step slideshow in a pop-up (e.g. teachers' Reports).
 *  Next / Back, the dots, or the arrow keys move between slides; Escape closes. */
export function GuideSlides({ slides, label = "How it works", title }: { slides: { src: string; alt: string }[]; label?: string; title: string }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [i, setI] = useState(0), last = slides.length - 1;
  const go = (n: number) => setI(Math.max(0, Math.min(last, n)));
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (!dlg.current?.open) return; if (e.key === "ArrowRight") go(i + 1); if (e.key === "ArrowLeft") go(i - 1); };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  });
  return <>
    <button type="button" className="abtn sm gv-btn" onClick={() => { setI(0); dlg.current?.showModal(); }}>
      <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"><rect x="2.5" y="4" width="15" height="10.5" rx="1.8" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M7 17.5h6M10 14.5v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>{label}</button>
    <dialog ref={dlg} className="gv-dlg gs-dlg" aria-label={title} onClick={(e) => { if (e.target === dlg.current) dlg.current?.close(); }}>
      <div className="gv-head"><b>{title}</b><span className="gs-n">{i + 1} / {slides.length}</span><button type="button" className="abtn sm" onClick={() => dlg.current?.close()} aria-label="Close">✕</button></div>
      <div className="gs-stage">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {slides.map((s, n) => <img key={s.src} src={s.src} alt={s.alt} loading={n < 2 ? "eager" : "lazy"} className={n === i ? "on" : ""} aria-hidden={n !== i} />)}
      </div>
      <div className="gs-foot">
        <button type="button" className="abtn" onClick={() => go(i - 1)} disabled={i === 0}>← Back</button>
        <div className="gs-dots" role="tablist" aria-label="Slides">{slides.map((s, n) => <button key={n} type="button" role="tab" aria-selected={n === i} aria-label={`Slide ${n + 1}`} onClick={() => go(n)} />)}</div>
        {i < last ? <button type="button" className="abtn pri" onClick={() => go(i + 1)}>Next →</button> : <button type="button" className="abtn pri" onClick={() => dlg.current?.close()}>Done</button>}
      </div>
    </dialog>
  </>;
}
