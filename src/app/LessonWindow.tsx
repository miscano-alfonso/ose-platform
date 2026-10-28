"use client";
import { useEffect, useRef, useState } from "react";

// Lessons and Google Classroom open in their own window beside the dashboard (Google doesn't allow Meet or Classroom
// inside another site's page). The dashboard keeps a bar showing what's open, to bring it to the front or close it.
// Works for every Join / Classroom link on the dashboards without changing each one: links are recognised by address.
type Open = { kind: "lesson" | "classroom"; label: string; url: string };
const VIDEO = /(^|\.)(meet\.google\.com|zoom\.(us|com)|teams\.(microsoft|live)\.com|whereby\.com|meet\.jit\.si|8x8\.vc)$/i;
const KEY = "ose_open_windows";
const kindOf = (a: HTMLAnchorElement): Open["kind"] | null => {
  try {
    const u = new URL(a.href, location.href);
    if (u.origin === location.origin) return /^\/join\//.test(u.pathname) ? "lesson" : null;
    if (u.hostname === "classroom.google.com") return "classroom";
    return VIDEO.test(u.hostname) || a.dataset.lessonLink !== undefined ? "lesson" : null;
  } catch { return null; }
};
const NAME = { lesson: "ose-lesson", classroom: "ose-classroom" };

export function LessonWindow() {
  const wins = useRef<Partial<Record<Open["kind"], Window | null>>>({});
  const [open, setOpen] = useState<Open[]>([]);
  const save = (list: Open[]) => { setOpen(list); try { sessionStorage.setItem(KEY, JSON.stringify(list)); } catch {} };

  useEffect(() => {
    try { const s = JSON.parse(sessionStorage.getItem(KEY) ?? "[]") as Open[]; if (s.length) setOpen(s); } catch {}
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null; if (!a) return;
      const kind = kindOf(a); if (!kind) return;
      e.preventDefault();
      const W = screen.availWidth, H = screen.availHeight, w = Math.max(720, Math.round(W * 0.62));
      const feat = `popup=yes,width=${w},height=${H},left=${(window.screenX ?? 0) + W - w},top=0`;
      const win = window.open(a.href, NAME[kind], feat);
      if (!win) { location.href = a.href; return; }   // pop-ups blocked: just go there
      win.focus(); wins.current[kind] = win;
      const label = a.dataset.lesson || a.closest("[data-lesson]")?.getAttribute("data-lesson") || (kind === "classroom" ? "Google Classroom" : a.textContent?.trim() || "Lesson");
      setOpen((prev) => { const next = [...prev.filter((o) => o.kind !== kind), { kind, label, url: a.href }]; try { sessionStorage.setItem(KEY, JSON.stringify(next)); } catch {} return next; });
    };
    document.addEventListener("click", onClick, true);
    // a window closed by the user takes its bar entry with it
    const t = setInterval(() => setOpen((prev) => {
      const next = prev.filter((o) => { const w = wins.current[o.kind]; return !(w && w.closed); });
      if (next.length !== prev.length) { try { sessionStorage.setItem(KEY, JSON.stringify(next)); } catch {} }
      return next.length !== prev.length ? next : prev;
    }), 1500);
    return () => { document.removeEventListener("click", onClick, true); clearInterval(t); };
  }, []);

  if (!open.length) return null;
  const show = (o: Open) => { let w = wins.current[o.kind]; if (!w || w.closed) { w = window.open(o.url, NAME[o.kind]); wins.current[o.kind] = w; } w?.focus(); };
  const close = (o: Open) => { const w = wins.current[o.kind] ?? window.open("", NAME[o.kind]); try { w?.close(); } catch {} save(open.filter((x) => x.kind !== o.kind)); };
  return <div className="lwin" role="region" aria-label="Open lesson windows">
    {open.map((o) => <div key={o.kind} className="lwin-item">
      <span className="lwin-dot" aria-hidden="true" /><span className="lwin-t"><b>{o.kind === "lesson" ? "Lesson open" : "Classroom open"}</b> in its own window: {o.label}</span>
      <button type="button" onClick={() => show(o)}>Show {o.kind === "lesson" ? "lesson" : "Classroom"}</button>
      <button type="button" onClick={() => close(o)}>{o.kind === "lesson" ? "I’ve left" : "Close"}</button>
    </div>)}
  </div>;
}
