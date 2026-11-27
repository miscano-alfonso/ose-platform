"use client";
import { useEffect, useRef, useState } from "react";
import { checkIdeaDatesAction } from "../../../actions";

/** 27 Nov (Alfonso): who the workshop idea is for, how long, and up to 3 suggested dates. Each date is checked as it's
 *  chosen: the teacher's own lessons, 1:1s and workshops, and lessons for students at that level (who then couldn't
 *  come). A warning only; the office decides. */
const LEN: [number, string][] = [[45, "45 min"], [60, "1 hour"], [75, "1¼ hours"], [90, "1½ hours"], [120, "2 hours"], [150, "2½ hours"], [180, "3 hours"]];
export function IdeaDates({ levels, level, minutes, dates }: { levels: { id: string; name: string }[]; level: string | null; minutes: number; dates: { d: string; t: string }[] }) {
  const [lv, setLv] = useState(level ?? ""), [mins, setMins] = useState(minutes || 60);
  const [rows, setRows] = useState(() => [0, 1, 2].map((i) => dates[i] ?? { d: "", t: "10:00" }));
  const [warn, setWarn] = useState<string[][]>([[], [], []]);
  const seq = useRef(0);
  useEffect(() => {
    const n = ++seq.current;
    const t = setTimeout(async () => {
      const filled = rows.map((r) => (r.d && r.t ? r : null));
      const res = await checkIdeaDatesAction(lv, mins, filled.filter(Boolean) as { d: string; t: string }[]).catch(() => null);
      if (!res || n !== seq.current) return;
      let k = 0; setWarn(filled.map((r) => (r ? res[k++] ?? [] : [])));
    }, 350);
    return () => clearTimeout(t);
  }, [lv, mins, rows]);
  const today = new Date().toISOString().slice(0, 10);
  const set = (i: number, k: "d" | "t", v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return <div className="wi-dates">
    <div className="wi-dr">
      <label className="fld">Who it’s for<select name="level" value={lv} onChange={(e) => setLv(e.target.value)}><option value="">Any level</option>{levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
      <label className="fld">How long<select name="minutes" value={mins} onChange={(e) => setMins(Number(e.target.value))}>{LEN.map(([m, l]) => <option key={m} value={m}>{l}</option>)}</select></label>
    </div>
    <p className="wi-dh">Suggested dates <span className="muted">(up to 3, optional). Workshops are mostly for new families: holidays, weekends and after school work well.</span></p>
    {rows.map((r, i) => <div key={i} className="wi-drow">
      <div className="wi-dr">
        <label className="fld"><span className="sr-only">Date {i + 1}</span><input type="date" name={`d${i + 1}`} min={today} value={r.d} onChange={(e) => set(i, "d", e.target.value)} /></label>
        <label className="fld"><span className="sr-only">Time {i + 1}</span><input type="time" name={`t${i + 1}`} step={300} value={r.t} onChange={(e) => set(i, "t", e.target.value)} /></label>
        {r.d && (warn[i]?.length ? <span className="pill warn">Clashes</span> : <span className="pill good">No clashes</span>)}
      </div>
      {r.d && warn[i]?.length > 0 && <ul className="wi-warn">{warn[i].map((w, k) => <li key={k}>{w}</li>)}</ul>}
    </div>)}
  </div>;
}
