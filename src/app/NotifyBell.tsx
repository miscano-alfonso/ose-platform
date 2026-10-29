"use client";
import { useSyncExternalStore, useState } from "react";
import { notifyState, subscribeNotify, saveNotifySettings } from "./notify-store";

// The bell beside the lesson countdown: bright when notifications are on, greyed when off. Click to switch.
export function NotifyBell({ settingsHref }: { settingsHref: string }) {
  const st = useSyncExternalStore(subscribeNotify, notifyState, () => null);
  const [err, setErr] = useState("");
  const s = st?.settings;
  const on = s?.on ?? true;
  const toggle = async () => {
    if (!s) return;
    const next = { ...s, on: !s.on };
    if (next.on && typeof Notification !== "undefined" && Notification.permission === "default") Notification.requestPermission().catch(() => {});
    setErr((await saveNotifySettings(next)) ?? "");
  };
  return <span className="ntf-bellwrap">
    <button type="button" className={`ntf-bell${on ? " on" : ""}`} onClick={toggle} disabled={!s} aria-pressed={on}
      title={on ? "Notifications are on. Click to turn them off." : "Notifications are off. Click to turn them on."} aria-label={on ? "Notifications on" : "Notifications off"}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {!on && <path d="M4 4l16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}</svg>
    </button>
    <a className="ntf-set" href={settingsHref} title="Notification settings" aria-label="Notification settings">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><circle cx="16" cy="7" r="2" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="10" cy="17" r="2" fill="none" stroke="currentColor" strokeWidth="2" /></svg></a>
    {err && <span className="ntf-err" role="alert">{err}</span>}
  </span>;
}
