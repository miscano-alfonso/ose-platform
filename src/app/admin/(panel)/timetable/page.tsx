import Link from "next/link";
import { getTimetable, classRosters, DAY, type Slot } from "@/lib/ops";
import { addSlotAction, removeSlotAction, setClassTeacherAction } from "../../actions";
import { yearLabel } from "@/lib/format";

const mins = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
const overlap = (a: Slot, b: Slot) => a.weekday === b.weekday && mins(a.starts_at) < mins(b.ends_at) && mins(b.starts_at) < mins(a.ends_at);
type Clash = { kind: "teacher" | "student" | "level"; a: Slot; b: Slot; shared: number };
const KIND = { teacher: "Teacher double-booked", student: "Student clash", level: "Same level" };

export default async function Timetable({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; level?: string; teacher?: string }> }) {
  const sp = await searchParams;
  const [{ year, slots, classes, teachers }, rosters] = await Promise.all([getTimetable(), classRosters()]);
  const days = [1, 2, 3, 4, 5, 6, 7].filter((d) => d <= 5 || slots.some((s) => s.weekday === d));
  const missing = classes.filter((c) => c.slots === 0);
  // clashes, as in the prototype: a teacher in two places, a student with two lessons at once, or two classes at the same level at once
  const clashes: Clash[] = [];
  slots.forEach((a, i) => slots.slice(i + 1).forEach((b) => {
    if (a.group_id === b.group_id || !overlap(a, b)) return;
    const shared = (rosters[a.group_id] ?? []).filter((x) => (rosters[b.group_id] ?? []).includes(x)).length;
    if (a.teacher_id && a.teacher_id === b.teacher_id) clashes.push({ kind: "teacher", a, b, shared });
    else if (shared) clashes.push({ kind: "student", a, b, shared });
    else if (a.level === b.level && a.subject !== b.subject) clashes.push({ kind: "level", a, b, shared });
  }));
  const levels = [...new Set(slots.map((s) => s.level))];
  const level = levels.includes(sp.level ?? "") ? sp.level! : "All", teacher = teachers.some((t) => t.id === sp.teacher) ? sp.teacher! : "";
  const shown = slots.filter((s) => (level === "All" || s.level === level) && (!teacher || s.teacher_id === teacher));
  const times = [...new Set(slots.map((s) => s.starts_at))].sort();
  const bad = (s: Slot) => { const c = clashes.filter((x) => x.a.id === s.id || x.b.id === s.id); return c.some((x) => x.kind !== "level") ? " bad" : c.length ? " warn" : ""; };
  const href = (l: string, t: string) => `/admin/timetable?${new URLSearchParams({ ...(l !== "All" ? { level: l } : {}), ...(t ? { teacher: t } : {}) })}`;
  return <>
    <div className="top"><div><h1>Timetable</h1><div className="sub">Every weekly lesson. Admins place each one so classes don’t clash · {year ? yearLabel(year) : ""} · {slots.length} weekly lessons{missing.length ? ` · ${missing.length} class${missing.length === 1 ? "" : "es"} without lesson times` : ""}</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}
    {sp.err && <p className="note msg bad">{sp.err}</p>}

    <div className="tools" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
      <div className="segl" role="group" aria-label="Level">{["All", ...levels].map((l) => <Link key={l} href={href(l, teacher)} aria-current={l === level ? "true" : undefined}>{l}</Link>)}</div>
      <form method="get" action="/admin/timetable" style={{ display: "flex", gap: 6 }}>{level !== "All" && <input type="hidden" name="level" value={level} />}
        <select name="teacher" defaultValue={teacher} aria-label="Teacher" className="mini"><option value="">All teachers</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        <button className="abtn sm" type="submit">Show</button></form>
      <span className="grow" style={{ flex: 1 }} />
      {clashes.length ? <a href="#clashes" className="pill bad">{clashes.length} clash{clashes.length > 1 ? "es" : ""}</a> : <span className="pill good">No clashes</span>}
    </div>

    {slots.length === 0 ? <p className="empty">No lesson times yet. Add them to each class below.</p> :
    <div className="tw"><table className="ttable"><thead><tr><th>Time</th>{days.map((d) => <th key={d}>{DAY[d]}</th>)}</tr></thead><tbody>
      {times.map((tm) => <tr key={tm}><td className="mono">{tm}</td>{days.map((d) => <td key={d}>{shown.filter((s) => s.weekday === d && s.starts_at === tm).map((s) =>
        <a key={s.id} href={`#c-${s.group_id}`} className={`tt${bad(s)}`} title={`${s.name} · ${s.code} · ${s.starts_at}–${s.ends_at}${s.teacher ? ` · ${s.teacher}` : ""}`}>
          <b><span className="dot" style={{ background: s.colour }} />{s.subject}</b><span>{s.level} · {s.teacher ? s.teacher.split(" ")[0] : "no teacher"}</span></a>)}</td>)}</tr>)}
    </tbody></table></div>}

    {clashes.length > 0 && <section className="card" id="clashes"><h2>Clashes to fix</h2>
      {clashes.map((c, i) => <div className="li" key={i}><span className={`pill ${c.kind === "level" ? "warn" : "bad"}`}>{KIND[c.kind]}</span>
        <div className="t"><b>{c.a.name} and {c.b.name}</b><span>{DAY[c.a.weekday]} {c.a.starts_at} and {c.b.starts_at}{c.kind === "student" ? ` · ${c.shared} student${c.shared > 1 ? "s" : ""} take both`
          : c.kind === "teacher" ? ` · both taught by ${c.a.teacher}` : " · students at this level can’t take both"}</span></div>
        <a className="abtn sm" href={`#c-${c.a.group_id}`}>Move a lesson</a></div>)}</section>}

    <h2 style={{ font: "600 20px Jost", margin: "22px 0 10px" }}>Classes</h2>
    <p className="note" style={{ marginTop: -4 }}>Add each class’s weekly lesson times and its teacher. Times show on the website’s course cards and timetable, and lesson dates for registers are made from them (holidays skipped).</p>
    {classes.map((c) => <section className="card" key={c.id} id={`c-${c.id}`}>
      <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
        <span className="dot" style={{ background: c.colour }} /><h2 style={{ margin: 0 }}>{c.name}</h2><span className="muted">{c.code}</span>
        <span className="muted">· {c.students} student{c.students === 1 ? "" : "s"}</span>
        {c.slots === 0 && <span className="pill warn">No lesson times</span>}{c.status === "hidden" && <span className="pill mute">Hidden on website</span>}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "10px 0" }}>
        {slots.filter((s) => s.group_id === c.id).map((s) => <form key={s.id} action={removeSlotAction} className="slotchip">
          <input type="hidden" name="id" value={s.id} /><span>{DAY[s.weekday]} {s.starts_at}–{s.ends_at}{s.teacher_id && s.teacher_id !== c.teacher_id ? ` · ${s.teacher}` : ""}</span>
          <button className="abtn sm" type="submit" aria-label={`Remove ${DAY[s.weekday]} ${s.starts_at}`}>Remove</button></form>)}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
        <form action={addSlotAction} className="eform">
          <input type="hidden" name="group" value={c.id} />
          <label className="fld">Day<select name="weekday" defaultValue="1">{[1, 2, 3, 4, 5, 6, 7].map((d) => <option key={d} value={d}>{DAY[d]}</option>)}</select></label>
          <label className="fld">Starts<input type="time" name="start" required step={300} defaultValue="09:00" /></label>
          <label className="fld">Minutes<input type="number" name="minutes" min={15} max={180} step={5} defaultValue={c.minutes} style={{ width: 80 }} /></label>
          <label className="fld">Teacher<select name="teacher" defaultValue=""><option value="">Class teacher</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
          <button className="abtn pri" type="submit">Add lesson time</button>
        </form>
        <form action={setClassTeacherAction} className="eform">
          <input type="hidden" name="group" value={c.id} />
          <label className="fld">Class teacher<select name="teacher" defaultValue={c.teacher_id ?? ""}><option value="">Not set</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
          <label className="fld">Lesson length<input type="number" name="minutes" min={15} max={180} step={5} defaultValue={c.minutes} style={{ width: 80 }} /></label>
          <button className="abtn" type="submit">Save</button>
        </form>
      </div>
    </section>)}
  </>;
}
