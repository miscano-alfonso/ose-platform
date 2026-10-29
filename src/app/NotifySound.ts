"use client";
import type { SoundId } from "@/lib/notify-types";

// The five notification sounds, made in the browser (no audio files): short and gentle.
let ctx: AudioContext | null = null;
function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try { ctx = ctx ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(); return ctx; } catch { return null; }
}
function tone(c: AudioContext, at: number, freq: number, dur: number, type: OscillatorType, vol = 0.18) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, at);
  g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(c.destination); o.start(at); o.stop(at + dur + 0.05);
}
export function playSound(id: SoundId) {
  const c = ac(); if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  const t = c.currentTime + 0.02;
  switch (id) {
    case "chime": tone(c, t, 880, 0.5, "sine"); tone(c, t + 0.16, 1318.5, 0.7, "sine"); break;
    case "bell": tone(c, t, 1046.5, 1.2, "sine", 0.16); tone(c, t, 2093, 0.8, "sine", 0.05); tone(c, t, 1568, 0.9, "triangle", 0.04); break;
    case "pop": tone(c, t, 620, 0.09, "square", 0.08); tone(c, t + 0.05, 930, 0.12, "sine", 0.12); break;
    case "marimba": [523.25, 659.25, 784].forEach((f, i) => tone(c, t + i * 0.11, f, 0.32, "triangle", 0.16)); break;
    case "ding": tone(c, t, 1318.5, 0.9, "sine", 0.1); break;
  }
}
/** Browsers only allow sound after the person has clicked or typed on the page: wake the audio up then. */
export function unlockSoundOnFirstTouch() {
  if (typeof window === "undefined") return;
  const go = () => { const c = ac(); if (c && c.state === "suspended") c.resume().catch(() => {}); window.removeEventListener("pointerdown", go); window.removeEventListener("keydown", go); };
  window.addEventListener("pointerdown", go); window.addEventListener("keydown", go);
}
