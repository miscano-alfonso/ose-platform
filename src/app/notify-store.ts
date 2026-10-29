"use client";
import type { NotifyRole, NotifySettings } from "@/lib/notify-types";

// The page's notification settings, shared by the notifier, the bell and the settings page.
type State = { api: string; role: NotifyRole; settings: NotifySettings | null; canSave: boolean };
let state: State | null = null;
const subs = new Set<() => void>();
export const notifyState = () => state;
export function initNotify(api: string, role: NotifyRole) { if (!state || state.api !== api) { state = { api, role, settings: null, canSave: true }; emit(); } }
export function setNotifySettings(s: NotifySettings) { if (state) { state = { ...state, settings: s }; emit(); } }
export function subscribeNotify(f: () => void) { subs.add(f); return () => { subs.delete(f); }; }
function emit() { subs.forEach((f) => f()); }
/** Save settings (optimistic); returns an error message or null. */
export async function saveNotifySettings(s: NotifySettings): Promise<string | null> {
  if (!state) return "Not ready yet.";
  const before = state.settings; setNotifySettings(s);
  try {
    const r = await fetch(state.api, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ settings: s }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { if (before) setNotifySettings(before); state = { ...state, canSave: r.status !== 403 }; emit(); return j.error ?? "Couldn’t save."; }
    setNotifySettings(j.settings); return null;
  } catch { if (before) setNotifySettings(before); return "Couldn’t save. Check your connection."; }
}
