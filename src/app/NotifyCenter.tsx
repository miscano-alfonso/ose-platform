"use client";
import { useEffect, useState } from "react";
import { playSound, unlockSoundOnFirstTouch } from "./NotifySound";
import { initNotify, setNotifySettings } from "./notify-store";
import type { NotifyRole, NotifySettings, NotifyEvent } from "@/lib/notify-types";

// Notifications while a dashboard is open (even in a background tab): every 45 seconds it asks what's new; each new
// thing that's switched on plays its sound, shows a note in the corner and, if allowed, a desktop pop-up.
const EVERY = 45000;
export function NotifyCenter({ api, role }: { api: string; role: NotifyRole }) {
  const [toasts, setToasts] = useState<NotifyEvent[]>([]);
  useEffect(() => {
    initNotify(api, role); unlockSoundOnFirstTouch();
    const K = `ose_notify:${api}`;
    const load = () => { try { return JSON.parse(localStorage.getItem(K) ?? "{}") as { since?: number; seen?: string[] }; } catch { return {}; } };
    const keep = (v: { since: number; seen: string[] }) => { try { localStorage.setItem(K, JSON.stringify({ since: v.since, seen: v.seen.slice(-300) })); } catch { /* private mode */ } };
    let st = load(), since = Math.max(st.since ?? 0, Date.now() - 10 * 60e3), seen = new Set(st.seen ?? []), timer = 0, alive = true;
    const tick = async () => {
      try {
        const r = await fetch(`${api}?since=${since}`, { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as { settings: NotifySettings; events: NotifyEvent[]; now: number };
        if (!alive) return;
        setNotifySettings(j.settings);
        const s = j.settings, fresh = j.events.filter((e) => !seen.has(e.id));
        fresh.forEach((e) => seen.add(e.id));
        since = j.now; keep({ since, seen: [...seen] });
        const show = s.on ? fresh.filter((e) => s.items[e.type]?.on) : [];
        if (!show.length) return;
        const sounds = [...new Set(show.map((e) => s.items[e.type]?.sound))].slice(0, 2);
        sounds.forEach((snd, i) => snd && setTimeout(() => playSound(snd), i * 700));
        setToasts((t) => [...show.slice(0, 4), ...t].slice(0, 4));
        show.slice(0, 3).forEach((e) => setTimeout(() => setToasts((t) => t.filter((x) => x.id !== e.id)), 9000));
        if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden)
          show.slice(0, 3).forEach((e) => { try { const n = new Notification(e.title, { body: e.body, tag: e.id }); n.onclick = () => { window.focus(); if (e.href) location.href = e.href; n.close(); }; } catch { /* some browsers only allow pop-ups from a service worker */ } });
      } catch { /* offline: try again next time */ }
    };
    tick(); timer = window.setInterval(tick, EVERY);
    const vis = () => { if (!document.hidden) tick(); };
    document.addEventListener("visibilitychange", vis);
    return () => { alive = false; clearInterval(timer); document.removeEventListener("visibilitychange", vis); };
  }, [api, role]);
  if (!toasts.length) return null;
  return <div className="ntf-stack" role="status" aria-live="polite">{toasts.map((t) =>
    <a key={t.id} className={`ntf-toast t-${t.type}`} href={t.href ?? undefined} onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>
      <b>{t.title}</b>{t.body && <span>{t.body}</span>}</a>)}
    </div>;
}
