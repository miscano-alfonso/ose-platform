"use client";
import { useEffect, useRef, useState } from "react";

// The My day panel's clock (a classic dial with the time now) and, beside the Join button, how long until the next lesson starts. Times are the
// lesson's date and start time in the UK, read in the viewer's own clock.

const at = (date: string, time: string) => new Date(`${date}T${time.length === 5 ? time + ":00" : time}`).getTime();

function useNow(ms: number) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

/** "in 38 min", "in 2 h 5 min", "tomorrow", "in 4 days"; "now" during the first part of the lesson. */
export function untilText(start: number, now: number, endMin = 45): string {
  const left = start - now;
  if (left <= 0) return now - start < endMin * 60e3 ? "on now" : "";
  const min = Math.ceil(left / 60e3);
  if (min < 60) return `in ${min} min`;
  if (min < 12 * 60) { const h = Math.floor(min / 60), m = min % 60; return `in ${h} h${m ? ` ${m} min` : ""}`; }
  const days = Math.round((new Date(start).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 864e5);
  return days <= 0 ? `at ${new Date(start).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : days === 1 ? "tomorrow" : `in ${days} days`;
}

const TICKS = Array.from({ length: 60 }, (_, i) => i);

/** Clock option B: a classic dial (hour marks, white hour and minute hands, a sweeping yellow second hand) showing the time now. */
export function LessonClock({ date, time }: { date: string; time: string }) {
  const h = useRef<SVGLineElement>(null), m = useRef<SVGLineElement>(null), s = useRef<SVGLineElement>(null);
  useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0, iv = 0;
    const set = () => {
      const d = new Date(), sec = d.getSeconds() + (still ? 0 : d.getMilliseconds() / 1000), min = d.getMinutes() + sec / 60, hr = (d.getHours() % 12) + min / 60;
      h.current?.setAttribute("transform", `rotate(${hr * 30} 100 100)`);
      m.current?.setAttribute("transform", `rotate(${min * 6} 100 100)`);
      s.current?.setAttribute("transform", `rotate(${sec * 6} 100 100)`);
    };
    const loop = () => { set(); raf = requestAnimationFrame(loop); };
    if (still) { set(); iv = window.setInterval(set, 1000); } else loop();
    return () => { cancelAnimationFrame(raf); clearInterval(iv); };
  }, []);
  return <svg className="lclock" viewBox="0 0 200 200" role="img" aria-label={`Clock. Next lesson ${date} at ${time.slice(0, 5)}`}>
    <circle cx="100" cy="100" r="92" fill="rgba(255,255,255,.06)" stroke="rgba(255,255,255,.25)" strokeWidth="2" />
    {TICKS.map((i) => { const big = i % 5 === 0; return <line key={i} x1="100" x2="100" y1={big ? 14 : 16} y2={big ? 26 : 21}
      stroke={big ? "#fff" : "rgba(255,255,255,.4)"} strokeWidth={big ? 3 : 1.2} strokeLinecap="round" transform={`rotate(${i * 6} 100 100)`} />; })}
    <line ref={h} x1="100" y1="108" x2="100" y2="56" stroke="#fff" strokeWidth="6" strokeLinecap="round" />
    <line ref={m} x1="100" y1="112" x2="100" y2="28" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" />
    <line ref={s} x1="100" y1="118" x2="100" y2="20" stroke="var(--pop,#e9f56a)" strokeWidth="1.6" strokeLinecap="round" />
    <circle cx="100" cy="100" r="5" fill="var(--pop,#e9f56a)" />
  </svg>;
}

/** The time left, for the row with the Join button. */
export function LessonCountdown({ date, time, withTime }: { date: string; time: string; withTime?: boolean }) {
  const now = useNow(15000);
  if (now == null) return null;
  const t = untilText(at(date, time), now);
  return t ? <span className="fx-cd" aria-live="polite">{withTime && t !== "on now" ? `${time.slice(0, 5)} · ${t}` : t}</span> : null;
}
