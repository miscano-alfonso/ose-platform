import { getTimetable, DAY } from "@/lib/ops";
import { addSlotAction, removeSlotAction, setClassTeacherAction } from "../../actions";
import { yearLabel } from "@/lib/format";

export default async function Timetable({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { year, slots, classes, teachers } = await getTimetable();
  const days = [1, 2, 3, 4, 5, 6, 7].filter((d) => d <= 5 || slots.some((s) => s.weekday === d));
  const missing = classes.filter((c) => c.slots === 0);
  return <>
    <div className="top"><div><h1>Timetable</h1><div className="sub">{year ? yearLabel(year) : ""} · {slots.length} weekly lessons · {classes.length} classes{missing.length ? ` · ${missing.length} without lesson times` : ""}</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}
    {sp.err && <p className="note msg bad">{sp.err}</p>}

    <div className="ttgrid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(150px, 1fr))` }}>
      {days.map((d) => <div key={d} className="ttday"><h3>{DAY[d]}</h3>
        {slots.filter((s) => s.weekday === d).map((s) => <div key={s.id} className="ttslot" style={{ borderLeftColor: s.colour }}>
          <b>{s.starts_at}–{s.ends_at}</b><span>{s.name}</span><small>{s.code}{s.teacher ? ` · ${s.teacher}` : " · no teacher"}{s.status === "hidden" ? " · hidden" : ""}</small>
        </div>)}
        {!slots.some((s) => s.weekday === d) && <p className="empty">No lessons</p>}
      </div>)}
    </div>

    <h2 style={{ font: "600 18px Jost", margin: "22px 0 10px" }}>Classes</h2>
    <p className="note" style={{ marginTop: -4 }}>Add each class’s weekly lesson times and its teacher. Times show on the website’s course cards and timetable, and lesson dates for registers are made from them (holidays skipped).</p>
    {classes.map((c) => <section className="card" key={c.id}>
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
