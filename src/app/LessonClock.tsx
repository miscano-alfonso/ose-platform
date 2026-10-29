"use client";
import { useEffect, useState } from "react";

// The My day panel's clock: a ring that fills in yellow over the last hour before the next lesson, with the lesson's
// start time in the middle, and (separately, beside the Join button) how long until it starts. Times are the
// lesson's date and start time in the UK, read in the viewer's own clock.

const at = (date: string, time: string) => new Date(`${date}T${time.length === 5 ? time + ":00" : time}`).getTime();
const R = 84, C = 2 * Math.PI * R;

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

export function LessonClock({ date, time }: { date: string; time: string }) {
  const now = useNow(15000);
  const start = at(date, time);
  const left = now == null ? Infinity : start - now;
  const frac = left <= 0 ? 1 : left >= 3600e3 ? 0 : 1 - left / 3600e3;   // fills over the last hour
  return <svg className="lclock" viewBox="0 0 200 200" role="img" aria-label={`Starts at ${time.slice(0, 5)}`}>
    <circle cx="100" cy="100" r={R} fill="none" stroke="rgba(255,255,255,.16)" strokeWidth="12" />
    {frac > 0 && <circle cx="100" cy="100" r={R} fill="none" stroke="var(--pop,#e9f56a)" strokeWidth="12" strokeLinecap="round"
      transform="rotate(-90 100 100)" strokeDasharray={`${frac * C} ${C}`} />}
    <text x="100" y="104" textAnchor="middle" className="lclock-t">{time.slice(0, 5)}</text>
    <text x="100" y="130" textAnchor="middle" className="lclock-l">{left <= 0 ? "started" : "starts"}</text>
  </svg>;
}

/** The time left, for the row with the Join button. */
export function LessonCountdown({ date, time }: { date: string; time: string }) {
  const now = useNow(15000);
  if (now == null) return null;
  const t = untilText(at(date, time), now);
  return t ? <span className="fx-cd" aria-live="polite">{t}</span> : null;
}
