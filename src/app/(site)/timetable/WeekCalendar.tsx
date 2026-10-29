"use client";
import { useState } from "react";
import Link from "next/link";

// The public timetable as a week calendar (Option B): Monday to Friday, every level, each lesson placed at its time;
// lessons at the same time sit side by side. Buttons filter to one level.
export type Lesson = { d: number; t: string; mins: number; subject: string; level: string; colour: string; href: string; teacher: string | null };
const DAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const PX = 1.75;   // pixels per minute
const m = (t: string) => { const [h, mm] = t.split(":").map(Number); return h * 60 + mm; };
const short = (s: string) => s.replace("English ", "Eng. ").replace("Literature", "Lit.").replace("Business Studies", "Business").replace("Science Double Award", "Science DA").replace("Maths Foundation", "Maths Found.");

export function WeekCalendar({ lessons, levels, initial }: { lessons: Lesson[]; levels: string[]; initial: string | null }) {
  const [lv, setLv] = useState<string | null>(initial);
  const shown = lessons.filter((l) => !lv || l.level === lv);
  if (!lessons.length) return <p className="empty">No lesson times published yet.</p>;
  const start = Math.min(...lessons.map((l) => m(l.t)));
  const end = Math.max(...lessons.map((l) => m(l.t) + l.mins));
  const days = [...new Set([1, 2, 3, 4, 5, ...lessons.map((l) => l.d)])].sort();
  const hours = [...new Set(lessons.map((l) => m(l.t)))].sort((a, b) => a - b);   // a line and label at each lesson start
  const H = (end - start) * PX;
  return <>
    <div className="wk-filters" role="group" aria-label="Level">
      <button type="button" aria-pressed={!lv} onClick={() => setLv(null)}>All levels</button>
      {levels.map((l) => <button key={l} type="button" aria-pressed={lv === l} onClick={() => setLv(l)}>{l}</button>)}
    </div>
    <div className="wk" style={{ ["--days" as string]: days.length }}>
      <div className="wk-times" style={{ height: H }} aria-hidden="true">{hours.map((h) => <span key={h} style={{ top: (h - start) * PX }}>{String(Math.floor(h / 60)).padStart(2, "0")}:{String(h % 60).padStart(2, "0")}</span>)}</div>
      {days.map((d) => {
        const mine = shown.filter((l) => l.d === d);
        const bySlot = new Map<string, Lesson[]>(); mine.forEach((l) => bySlot.set(l.t, [...(bySlot.get(l.t) ?? []), l]));
        return <div className="wk-day" key={d}><h3>{DAYS[d]}</h3>
          <div className="wk-col" style={{ height: H }}>
            {hours.map((h) => <i key={h} className="wk-line" style={{ top: (h - start) * PX }} />)}
            {[...bySlot.values()].flatMap((g) => g.map((l, k) => <Link key={`${l.href}${l.t}${k}`} href={l.href} className="wk-blk"
              title={`${l.level} ${l.subject} · ${DAYS[l.d]} ${l.t}${l.teacher ? ` · ${l.teacher}` : ""}`}
              style={{ ["--c" as string]: l.colour, top: (m(l.t) - start) * PX, height: l.mins * PX - 3, left: `calc(${k} * 100% / ${g.length})`, width: `calc(100% / ${g.length} - 3px)` }}>
              <b>{g.length > 1 ? short(l.subject) : l.subject}</b><span>{l.t}{lv ? "" : ` · ${l.level}`}</span></Link>))}
          </div></div>;
      })}
    </div>
  </>;
}
