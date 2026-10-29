"use client";
import { useSyncExternalStore, useState, useEffect } from "react";
import { notifyState, subscribeNotify, saveNotifySettings, initNotify, setNotifySettings } from "./notify-store";
import { playSound } from "./NotifySound";
import { SOUNDS, TYPES, type NotifyRole, type NotifySettings, type SoundId } from "@/lib/notify-types";

// The Notifications settings page (same for every dashboard): on/off, which things to be told about, and a sound each.
export function NotifySettingsForm({ api, role, initial, viewing }: { api: string; role: NotifyRole; initial: NotifySettings; viewing?: boolean }) {
  useEffect(() => { initNotify(api, role); if (!notifyState()?.settings) setNotifySettings(initial); }, [api, role, initial]);
  const st = useSyncExternalStore(subscribeNotify, notifyState, () => null);
  const s = st?.settings ?? initial;
  const [msg, setMsg] = useState(""), [perm, setPerm] = useState<string>("unsupported");
  useEffect(() => { setPerm(typeof Notification === "undefined" ? "unsupported" : Notification.permission); }, []);
  const save = async (next: NotifySettings) => { const e = await saveNotifySettings(next); setMsg(e ?? "Saved."); };
  const item = (id: string, patch: Partial<{ on: boolean; sound: SoundId }>) => save({ ...s, items: { ...s.items, [id]: { ...s.items[id], ...patch } } });
  return <div className="ntf-form">
    {viewing && <p className="note">You’re viewing as someone else: you can see their settings but not change them.</p>}
    <section className="card"><div className="ntf-master">
      <div><h2 style={{ margin: 0 }}>Notifications</h2><p className="muted" style={{ margin: "4px 0 0" }}>While your dashboard is open (even in another tab), new things play a sound and show a note. The bell beside your next lesson switches them all on or off.</p></div>
      <label className="ntf-switch"><input type="checkbox" checked={s.on} disabled={viewing} onChange={(e) => save({ ...s, on: e.target.checked })} /><span>{s.on ? "On" : "Off"}</span></label>
    </div>
    <div className="ntf-perm">{perm === "granted" ? <span className="pill good">Desktop pop-ups allowed</span>
      : perm === "denied" ? <span className="muted">Desktop pop-ups are blocked in this browser’s settings. Sounds and notes still work.</span>
      : perm === "default" ? <button type="button" className="abtn sm" onClick={() => Notification.requestPermission().then(setPerm)}>Allow desktop pop-ups</button>
      : <span className="muted">This browser doesn’t do desktop pop-ups. Sounds and notes still work.</span>}</div></section>
    <section className="card" style={{ opacity: s.on ? 1 : 0.55 }}><h2>What to tell me about</h2>
      {TYPES[role].map((t) => { const it = s.items[t.id]; return <div className="ntf-row" key={t.id}>
        <label className="ntf-tick"><input type="checkbox" checked={it.on} disabled={viewing} onChange={(e) => item(t.id, { on: e.target.checked })} /><span><b>{t.label}</b><small>{t.hint}</small></span></label>
        <select value={it.sound} disabled={viewing || !it.on} onChange={(e) => { const v = e.target.value as SoundId; playSound(v); item(t.id, { sound: v }); }} aria-label={`Sound for ${t.label}`}>
          {SOUNDS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
        <button type="button" className="abtn sm" onClick={() => playSound(it.sound)} aria-label={`Play the ${t.label} sound`}>▶ Play</button>
      </div>; })}
    </section>
    {msg && <p className="note msg" role="status">{msg}</p>}
  </div>;
}
