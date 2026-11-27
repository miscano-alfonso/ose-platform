"use client";
import { useRef } from "react";

/** 27 Nov: "How it works" button that opens a short guide video in a pop-up (e.g. teachers' Reports). */
export function GuideVideo({ src, poster, label = "How it works", title }: { src: string; poster?: string; label?: string; title: string }) {
  const dlg = useRef<HTMLDialogElement>(null), vid = useRef<HTMLVideoElement>(null);
  const close = () => { vid.current?.pause(); dlg.current?.close(); };
  return <>
    <button type="button" className="abtn sm gv-btn" onClick={() => { dlg.current?.showModal(); vid.current?.play().catch(() => null); }}>
      <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"><circle cx="10" cy="10" r="8.2" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M8.2 6.8v6.4l5-3.2z" fill="currentColor" /></svg>{label}</button>
    <dialog ref={dlg} className="gv-dlg" aria-label={title} onClick={(e) => { if (e.target === dlg.current) close(); }} onClose={() => vid.current?.pause()}>
      <div className="gv-head"><b>{title}</b><button type="button" className="abtn sm" onClick={close} aria-label="Close">✕</button></div>
      <video ref={vid} src={src} poster={poster} controls playsInline preload="metadata" />
    </dialog>
  </>;
}
