"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// 26 Nov (Alfonso: a message sent from the office only showed for Leanne after a refresh): while a page with messages is
// open and visible, it checks every few seconds whether anything changed (/admin/live) and redraws the page when it has.
// It waits while someone is typing a reply, so nothing they've written is disturbed.
export function LiveMessages({ stamp, seconds = 5 }: { stamp: string; seconds?: number }) {
  const router = useRouter();
  const last = useRef(stamp), pending = useRef(false);
  useEffect(() => { last.current = stamp; pending.current = false; }, [stamp]);
  useEffect(() => {
    let busy = false;
    const typing = () => { const a = document.activeElement as HTMLTextAreaElement | HTMLInputElement | null;
      return !!a && (a.tagName === "TEXTAREA" || (a.tagName === "INPUT" && a.getAttribute("type") !== "checkbox")) && !!a.value; };
    const tick = async () => {
      if (busy || document.hidden) return;
      if (pending.current) { if (!typing()) { pending.current = false; router.refresh(); } return; }
      busy = true;
      try {
        const r = await fetch("/admin/live", { cache: "no-store" });
        if (!r.ok) return;
        const { stamp: s } = await r.json() as { stamp: string };
        if (s && s !== last.current) { last.current = s; if (typing()) pending.current = true; else router.refresh(); }
      } catch { /* offline for a moment */ } finally { busy = false; }
    };
    const t = window.setInterval(tick, seconds * 1000);
    const vis = () => { if (!document.hidden) tick(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, [router, seconds]);
  return null;
}
