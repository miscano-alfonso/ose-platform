import Link from "next/link";
import { DAY, type Slot, type TClass, type TeacherOpt } from "@/lib/ops";
import { addSlotAction, removeSlotAction, setClassTeacherAction, moveSlotAction } from "../../actions";

// 28 Nov (Alfonso: "I'm finding the Timetable Setup not very user friendly. can you show me 3 alternative layouts and
// working?"; he chose the week grid): the week as a grid, for Admin → Timetable setup.

export type Clash = { kind: "teacher" | "student" | "level"; a: Slot; b: Slot; shared: number; ids: string[] };
type P = { slots: Slot[]; classes: TClass[]; teachers: TeacherOpt[]; clashes: Clash[]; rosters: Record<string, string[]>; ret: string; sel?: string };

const mins = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const WEEK = [1, 2, 3, 4, 5];
const KIND = { teacher: "Teacher double-booked", student: "Student clash", level: "Same level" };
const Ret = ({ ret }: { ret: string }) => <input type="hidden" name="ret" value={ret} />;
const first = (n: string | null) => (n ? n.split(" ")[0] : "no teacher");
const clashOf = (clashes: Clash[], id: string) => clashes.filter((c) => c.a.id === id || c.b.id === id);
// the rows of the week: every half hour from 08:30 to 16:30, plus any time a lesson already starts at
const rows = (slots: Slot[]) => [...new Set([...Array.from({ length: 17 }, (_, i) => 510 + i * 30), ...slots.map((s) => mins(s.starts_at))])].sort((a, b) => a - b);

function TeacherForm({ c, teachers, ret }: { c: TClass; teachers: TeacherOpt[]; ret: string }) {
  return <form action={setClassTeacherAction} className="tsx-add"><Ret ret={ret} /><input type="hidden" name="group" value={c.id} />
    <select name="teacher" defaultValue={c.teacher_id ?? ""} aria-label="Class teacher"><option value="">No teacher yet</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
    <input type="number" name="minutes" min={15} max={180} step={5} defaultValue={c.minutes} aria-label="Lesson length in minutes" style={{ width: 64 }} />
    <button className="abtn sm" type="submit">Save</button></form>;
}
/** B: the week as a grid. Press + in any empty spot to put a class there; press a lesson to move or remove it.
 *  Classes still without times wait in a tray at the top. */
export function WeekGrid({ slots, classes, teachers, clashes, ret }: Omit<P, "rosters" | "sel">) {
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
              {c && <><p className="tsx-sub">Class teacher and lesson length</p><TeacherForm c={c} teachers={teachers} ret={ret} /></>}
              <form action={removeSlotAction}><Ret ret={ret} /><input type="hidden" name="id" value={s.id} /><button className="abtn sm" type="submit">Remove this lesson time</button></form></div></details>; })}
          <details className="tsx-plus" name="tsx"><summary aria-label={`Add a lesson ${DAY[d]} ${hm(t)}`}>+</summary>
            <div className="tsx-pop"><p><b>{DAY[d]} {hm(t)}</b>: which class?</p>
              <form action={addSlotAction} className="tsx-add"><Ret ret={ret} /><input type="hidden" name="weekday" value={d} /><input type="hidden" name="start" value={hm(t)} />
                <select name="group" required defaultValue="" aria-label="Class"><option value="" disabled>Choose a class</option>
                  {choose.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code}){waiting.includes(c) ? " · no times yet" : ""}</option>)}</select>
                <input type="number" name="minutes" min={15} max={180} step={5} defaultValue={45} aria-label="Minutes" style={{ width: 64 }} /><span className="muted">min</span>
                <button className="abtn pri sm" type="submit">Add</button></form></div></details>
        </td>; })}</tr>)}
    </tbody></table></div>
    <p className="note">Each lesson is taught by its class’s teacher. To change a class’s teacher or lesson length, press one of its lessons.</p>
  </>;
}

