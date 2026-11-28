import Link from "next/link";
import { DAY, type Slot, type TClass, type TeacherOpt } from "@/lib/ops";
import { addSlotAction, removeSlotAction, setClassTeacherAction, moveSlotAction } from "../../actions";

// 28 Nov (Alfonso: "I'm finding the Timetable Setup not very user friendly. can you show me 3 alternative layouts and
// working?"): three working ways to set each class's weekly lesson times and teacher. All use the same actions as the
// current page, so anything done in one shows in the others.

export type Clash = { kind: "teacher" | "student" | "level"; a: Slot; b: Slot; shared: number; ids: string[] };
type P = { slots: Slot[]; classes: TClass[]; teachers: TeacherOpt[]; clashes: Clash[]; rosters: Record<string, string[]>; ret: string; sel?: string };

const mins = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const WEEK = [1, 2, 3, 4, 5];
const KIND = { teacher: "Teacher double-booked", student: "Student clash", level: "Same level" };
const Ret = ({ ret }: { ret: string }) => <input type="hidden" name="ret" value={ret} />;
const first = (n: string | null) => (n ? n.split(" ")[0] : "no teacher");
const clashOf = (clashes: Clash[], id: string) => clashes.filter((c) => c.a.id === id || c.b.id === id);
const state = (c: TClass, slots: Slot[], clashes: Clash[]) => {
  const mine = slots.filter((s) => s.group_id === c.id);
  if (!mine.length) return { k: "none", label: "No lesson times", pill: "warn" };
  const cl = mine.flatMap((s) => clashOf(clashes, s.id));
  if (cl.some((x) => x.kind !== "level")) return { k: "bad", label: "Clash", pill: "bad" };
  if (cl.length) return { k: "warn", label: "Same level at once", pill: "warn" };
  if (!c.teacher_id) return { k: "warn", label: "No teacher", pill: "warn" };
  return { k: "ok", label: "Done", pill: "good" };
};
// the rows of the week: every half hour from 08:30 to 16:30, plus any time a lesson already starts at
const rows = (slots: Slot[]) => [...new Set([...Array.from({ length: 17 }, (_, i) => 510 + i * 30), ...slots.map((s) => mins(s.starts_at))])].sort((a, b) => a - b);

function AddForm({ c, teachers, ret, day = 1, start = "09:00", label = "Add" }: { c: TClass; teachers: TeacherOpt[]; ret: string; day?: number; start?: string; label?: string }) {
  return <form action={addSlotAction} className="tsx-add"><Ret ret={ret} /><input type="hidden" name="group" value={c.id} />
    <select name="weekday" defaultValue={day} aria-label="Day">{[1, 2, 3, 4, 5, 6, 7].map((d) => <option key={d} value={d}>{DAY[d]}</option>)}</select>
    <input type="time" name="start" required step={300} defaultValue={start} aria-label="Starts" />
    <input type="number" name="minutes" min={15} max={180} step={5} defaultValue={c.minutes} aria-label="Minutes" style={{ width: 64 }} />
    <select name="teacher" defaultValue="" aria-label="Teacher"><option value="">{c.teacher ? `${first(c.teacher)} (class teacher)` : "Class teacher"}</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
    <button className="abtn pri sm" type="submit">{label}</button></form>;
}
function TeacherForm({ c, teachers, ret }: { c: TClass; teachers: TeacherOpt[]; ret: string }) {
  return <form action={setClassTeacherAction} className="tsx-add"><Ret ret={ret} /><input type="hidden" name="group" value={c.id} />
    <select name="teacher" defaultValue={c.teacher_id ?? ""} aria-label="Class teacher"><option value="">No teacher yet</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
    <input type="number" name="minutes" min={15} max={180} step={5} defaultValue={c.minutes} aria-label="Lesson length in minutes" style={{ width: 64 }} />
    <button className="abtn sm" type="submit">Save</button></form>;
}
function Chip({ s, c, ret, clashes }: { s: Slot; c: TClass; ret: string; clashes: Clash[] }) {
  const cl = clashOf(clashes, s.id), tone = cl.some((x) => x.kind !== "level") ? " bad" : cl.length ? " warn" : "";
  return <form action={removeSlotAction} className={`tsx-chip${tone}`} title={cl.map((x) => `${KIND[x.kind]}: ${(x.a.id === s.id ? x.b : x.a).name}`).join("\n") || undefined}>
    <Ret ret={ret} /><input type="hidden" name="id" value={s.id} />
    <span>{DAY[s.weekday]} {s.starts_at}–{s.ends_at}{s.teacher_id && s.teacher_id !== c.teacher_id ? ` · ${first(s.teacher)}` : ""}</span>
    <button type="submit" aria-label={`Remove ${DAY[s.weekday]} ${s.starts_at}`}>×</button></form>;
}

/** A: every class in one compact list: teacher, lesson times as chips (× removes), and a one-line Add. */
export function LayoutA({ slots, classes, teachers, clashes, ret }: P) {
  const order = { none: 0, bad: 1, warn: 2, ok: 3 } as Record<string, number>;
  const list = [...classes].sort((a, b) => order[state(a, slots, clashes).k] - order[state(b, slots, clashes).k]);
  return <div className="tw tsx-a"><table><thead><tr><th>Class</th><th>Teacher and length</th><th>Lesson times</th><th>Add a lesson time</th></tr></thead><tbody>
    {list.map((c) => { const st = state(c, slots, clashes); return <tr key={c.id} id={`c-${c.id}`}>
      <td><span className="dot" style={{ background: c.colour }} /><b>{c.name}</b><div className="muted">{c.code} · {c.students} student{c.students === 1 ? "" : "s"}</div><span className={`pill ${st.pill}`}>{st.label}</span></td>
      <td><TeacherForm c={c} teachers={teachers} ret={ret} /></td>
      <td><div className="tsx-chips">{slots.filter((s) => s.group_id === c.id).map((s) => <Chip key={s.id} s={s} c={c} ret={ret} clashes={clashes} />)}
        {!slots.some((s) => s.group_id === c.id) && <span className="muted">None yet</span>}</div></td>
      <td><AddForm c={c} teachers={teachers} ret={ret} /></td></tr>; })}
  </tbody></table></div>;
}

/** B: the week as a grid. Press + in any empty spot to put a class there; press a lesson to move or remove it.
 *  Classes still without times wait in a tray at the top. */
export function LayoutB({ slots, classes, teachers, clashes, ret }: P) {
  const times = rows(slots), byId = new Map(classes.map((c) => [c.id, c]));
  const waiting = classes.filter((c) => !slots.some((s) => s.group_id === c.id));
  const choose = [...waiting, ...classes.filter((c) => !waiting.includes(c))];
  return <>
    {waiting.length > 0 && <div className="card tsx-tray"><b>Waiting for a time ({waiting.length})</b>{waiting.map((c) => <span key={c.id} className="tsx-tag" style={{ ["--c" as string]: c.colour }}>{c.name} <span className="muted">{c.code}</span></span>)}
      <span className="muted">Press + in the grid where one should go.</span></div>}
    <div className="tw tsx-b"><table><thead><tr><th>Time</th>{WEEK.map((d) => <th key={d}>{DAY[d]}</th>)}</tr></thead><tbody>
      {times.map((t) => <tr key={t}><td className="mono">{hm(t)}</td>{WEEK.map((d) => { const here = slots.filter((s) => s.weekday === d && mins(s.starts_at) === t);
        return <td key={d}>{here.map((s) => { const c = byId.get(s.group_id), cl = clashOf(clashes, s.id), tone = cl.some((x) => x.kind !== "level") ? " bad" : cl.length ? " warn" : "";
          return <details key={s.id} className={`tsx-l${tone}`} style={{ ["--c" as string]: s.colour }} name="tsx"><summary><b>{s.subject}</b><span>{s.level} · {first(s.teacher)}</span></summary>
            <div className="tsx-pop"><p><b>{s.name}</b> <span className="muted">{s.code}</span></p><p className="muted">{DAY[s.weekday]} {s.starts_at}–{s.ends_at} · {s.teacher ?? "no teacher"}</p>
              {cl.map((x, i) => <p key={i} className={x.kind === "level" ? "warn" : "bad"}>{KIND[x.kind]} with {(x.a.id === s.id ? x.b : x.a).name}</p>)}
              {c && <form action={moveSlotAction} className="tsx-add"><Ret ret={ret} /><input type="hidden" name="id" value={s.id} /><input type="hidden" name="group" value={c.id} /><input type="hidden" name="minutes" value={mins(s.ends_at) - mins(s.starts_at)} /><input type="hidden" name="teacher" value={s.teacher_id ?? ""} />
                <select name="weekday" defaultValue={s.weekday} aria-label="Day">{[1, 2, 3, 4, 5, 6, 7].map((x) => <option key={x} value={x}>{DAY[x]}</option>)}</select>
                <input type="time" name="start" step={300} defaultValue={s.starts_at} aria-label="Starts" /><button className="abtn pri sm" type="submit">Move</button></form>}
              <form action={removeSlotAction}><Ret ret={ret} /><input type="hidden" name="id" value={s.id} /><button className="abtn sm" type="submit">Remove this lesson time</button></form></div></details>; })}
          <details className="tsx-plus" name="tsx"><summary aria-label={`Add a lesson ${DAY[d]} ${hm(t)}`}>+</summary>
            <div className="tsx-pop"><p><b>{DAY[d]} {hm(t)}</b>: which class?</p>
              <form action={addSlotAction} className="tsx-add"><Ret ret={ret} /><input type="hidden" name="weekday" value={d} /><input type="hidden" name="start" value={hm(t)} />
                <select name="group" required defaultValue="" aria-label="Class"><option value="" disabled>Choose a class</option>
                  {choose.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code}){waiting.includes(c) ? " · no times yet" : ""}</option>)}</select>
                <input type="number" name="minutes" min={15} max={180} step={5} defaultValue={45} aria-label="Minutes" style={{ width: 64 }} />
                <button className="abtn pri sm" type="submit">Add</button></form></div></details>
        </td>; })}</tr>)}
    </tbody></table></div>
    <p className="note">The class teacher teaches it unless you choose someone else for one lesson. Change a class’s teacher in layout A or C.</p>
  </>;
}

/** C: one class at a time. The list on the left shows what still needs doing; on the right, the chosen class's teacher
 *  and times, and its week, where every free half hour can be picked with one press. Busy spots say why. */
export function LayoutC({ slots, classes, teachers, clashes, rosters, ret, sel }: P) {
  const groups: [string, string][] = [["none", "Needs lesson times"], ["bad", "Clashes"], ["warn", "To check"], ["ok", "Done"]];
  const c = classes.find((x) => x.id === sel) ?? classes.find((x) => state(x, slots, clashes).k !== "ok") ?? classes[0];
  const base = ret.split("&cls=")[0];
  if (!c) return <p className="empty">No classes yet.</p>;
  const mine = slots.filter((s) => s.group_id === c.id), roster = rosters[c.id] ?? [];
  // what's in the way at day d, from minute t, for a lesson of this class's length
  const why = (d: number, t: number) => {
    const end = t + c.minutes, over = slots.filter((s) => s.group_id !== c.id && s.weekday === d && mins(s.starts_at) < end && t < mins(s.ends_at));
    if (mine.some((s) => s.weekday === d && mins(s.starts_at) < end && t < mins(s.ends_at))) return { k: "mine", text: "This class" };
    const tch = over.find((s) => c.teacher_id && s.teacher_id === c.teacher_id); if (tch) return { k: "bad", text: `${first(c.teacher)} teaches ${tch.name}` };
    const stu = over.find((s) => (rosters[s.group_id] ?? []).some((x) => roster.includes(x))); if (stu) return { k: "bad", text: `A student has ${stu.name}` };
    const lvl = over.find((s) => s.level === c.level); if (lvl) return { k: "warn", text: `${lvl.name} (same level)` };
    return { k: "free", text: "" };
  };
  const times = rows(slots).filter((t) => t + c.minutes <= 17 * 60 + 30);
  return <div className="tsx-c">
    <nav className="card tsx-side" aria-label="Classes">{groups.map(([k, label]) => { const list = classes.filter((x) => state(x, slots, clashes).k === k); return list.length ? <div key={k}>
      <h3>{label} <span className="muted">{list.length}</span></h3>
      {list.map((x) => <Link key={x.id} href={`${base}&cls=${x.id}`} aria-current={x.id === c.id ? "true" : undefined}><span className="dot" style={{ background: x.colour }} />{x.name}<span className="muted"> {x.code}</span></Link>)}</div> : null; })}</nav>
    <section className="card tsx-main">
      <div className="tsx-head"><span className="dot" style={{ background: c.colour }} /><h2>{c.name}</h2><span className="muted">{c.code} · {c.students} student{c.students === 1 ? "" : "s"}</span>
        <span className={`pill ${state(c, slots, clashes).pill}`}>{state(c, slots, clashes).label}</span></div>
      <div className="tsx-row"><span className="k">Teacher and lesson length</span><TeacherForm c={c} teachers={teachers} ret={`${base}&cls=${c.id}`} /></div>
      <div className="tsx-row"><span className="k">Lesson times</span><div className="tsx-chips">{mine.map((s) => <Chip key={s.id} s={s} c={c} ret={`${base}&cls=${c.id}`} clashes={clashes} />)}{!mine.length && <span className="muted">None yet: pick a free spot below</span>}</div></div>
      <h3 style={{ margin: "16px 0 6px" }}>Pick a time <span className="muted" style={{ fontWeight: 400, fontSize: 14 }}>· {c.minutes}-minute lessons{c.teacher ? ` with ${c.teacher}` : ""}</span></h3>
      <div className="tsx-legend"><span className="free">Free: press to add</span><span className="warn">Same level at once</span><span className="bad">Teacher or a student busy</span><span className="mine">This class</span></div>
      <div className="tw tsx-pick"><table><thead><tr><th>Time</th>{WEEK.map((d) => <th key={d}>{DAY[d]}</th>)}</tr></thead><tbody>
        {times.map((t) => <tr key={t}><td className="mono">{hm(t)}</td>{WEEK.map((d) => { const w = why(d, t);
          return <td key={d} className={w.k}>{w.k === "free" || w.k === "warn"
            ? <form action={addSlotAction}><Ret ret={`${base}&cls=${c.id}`} /><input type="hidden" name="group" value={c.id} /><input type="hidden" name="weekday" value={d} /><input type="hidden" name="start" value={hm(t)} /><input type="hidden" name="minutes" value={c.minutes} />
                <button type="submit" title={`Add ${DAY[d]} ${hm(t)}–${hm(t + c.minutes)}${w.text ? ` (${w.text})` : ""}`}>{w.k === "warn" ? w.text : "+"}</button></form>
            : <span title={w.text}>{w.text}</span>}</td>; })}</tr>)}
      </tbody></table></div>
    </section>
  </div>;
}
