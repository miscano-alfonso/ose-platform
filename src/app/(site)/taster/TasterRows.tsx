"use client";
import { useState } from "react";

export type Opt = { level: string; subject: string; lessons: { id: string; date: string; starts: string; ends: string; places: number }[] };
type Row = { level: string; subject: string; date: string; lesson: string };
const day = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** One row per taster: Level → Subject → Date → Time, with + to add another (up to `max`) and − to remove. */
export function TasterRows({ opts, max }: { opts: Opt[]; max: number }) {
  const [rows, setRows] = useState<Row[]>([{ level: "", subject: "", date: "", lesson: "" }]);
  const levels = [...new Set(opts.map((o) => o.level))];
  const set = (i: number, r: Partial<Row>) => setRows(rows.map((x, j) => j === i ? { ...x, ...r } : x));
  const taken = (i: number) => rows.filter((_, j) => j !== i).map((r) => `${r.level}|${r.subject}`);
  return <div className="trows">
    {rows.map((r, i) => {
      const subjects = opts.filter((o) => o.level === r.level && !taken(i).includes(`${o.level}|${o.subject}`)).map((o) => o.subject);
      const lessons = opts.filter((o) => o.level === r.level && o.subject === r.subject).flatMap((o) => o.lessons).sort((a, b) => (a.date + a.starts).localeCompare(b.date + b.starts));
      const dates = [...new Set(lessons.map((l) => l.date))];
      const times = lessons.filter((l) => l.date === r.date);
      return <div className="trow" key={i}>
        <label>Level<select value={r.level} onChange={(e) => set(i, { level: e.target.value, subject: "", date: "", lesson: "" })} required={i === 0}>
          <option value="">Select level</option>{levels.map((l) => <option key={l}>{l}</option>)}</select></label>
        <label>Subject<select value={r.subject} disabled={!r.level} onChange={(e) => set(i, { subject: e.target.value, date: "", lesson: "" })} required={i === 0}>
          <option value="">Select subject</option>{subjects.map((s) => <option key={s}>{s}</option>)}</select></label>
        <label>Date<select value={r.date} disabled={!r.subject} onChange={(e) => { const t = lessons.filter((l) => l.date === e.target.value); set(i, { date: e.target.value, lesson: t.length === 1 ? t[0].id : "" }); }} required={i === 0}>
          <option value="">Select date</option>{dates.map((d) => <option key={d} value={d}>{day(d)}</option>)}</select></label>
        <label>Time<select value={r.lesson} disabled={!r.date} onChange={(e) => set(i, { lesson: e.target.value })} required={i === 0}>
          <option value="">Select time</option>{times.map((l) => <option key={l.id} value={l.id}>{l.starts}–{l.ends}{l.places === 1 ? " (last place)" : ""}</option>)}</select></label>
        <input type="hidden" name={`lesson_${i}`} value={r.lesson} />
        <span className="tbtns">
          <button type="button" className="tadd" aria-label="Add another taster" disabled={rows.length >= max || i !== rows.length - 1} onClick={() => setRows([...rows, { level: "", subject: "", date: "", lesson: "" }])}>+</button>
          <button type="button" className="tdel" aria-label="Remove this taster" disabled={rows.length === 1} onClick={() => setRows(rows.filter((_, j) => j !== i))}>−</button>
        </span>
      </div>;
    })}
  </div>;
}
