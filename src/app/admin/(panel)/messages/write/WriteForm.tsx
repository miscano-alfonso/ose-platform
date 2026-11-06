"use client";
import { useMemo, useState } from "react";
import type { Audience, Options } from "@/lib/office-messages";

type Pick = "parent" | "student" | "teacher" | "class" | "level" | null;
const KINDS: { id: Audience; label: string; pick: Pick; group: string }[] = [
  { id: "parent", label: "A parent", pick: "parent", group: "One person" }, { id: "student", label: "A student", pick: "student", group: "One person" }, { id: "teacher", label: "A teacher", pick: "teacher", group: "One person" },
  { id: "class-parents", label: "Parents class", pick: "class", group: "A group" }, { id: "class-students", label: "Students class", pick: "class", group: "A group" },
  { id: "level-parents", label: "Parents level", pick: "level", group: "A group" }, { id: "level-students", label: "Students level", pick: "level", group: "A group" },
  { id: "teachers", label: "All teachers", pick: null, group: "A group" },
];
const PICK_LABEL: Record<string, string> = { parent: "Parent", student: "Student", teacher: "Teacher", class: "Class", level: "Level" };

// The office's "New message" form: who it's to, then the subject and message. A group gets a private copy each.
export function WriteForm({ opts, action, initial, testMode }: { opts: Options; action: (f: FormData) => Promise<void>; initial: { aud?: string; target?: string }; testMode: boolean }) {
  const [aud, setAud] = useState<Audience>((KINDS.find((k) => k.id === initial.aud)?.id ?? "parent"));
  const [target, setTarget] = useState(initial.target ?? "");
  const [find, setFind] = useState("");
  const [picked, setPicked] = useState(!!initial.target);   // 6 Nov: someone chosen from the search: the matches fold away
  const kind = KINDS.find((k) => k.id === aud)!;
  const list = useMemo(() => {
    const p = kind.pick;
    const all = p === "parent" ? opts.parents : p === "student" ? opts.students : p === "teacher" ? opts.teachers
      : p === "class" ? opts.classes.map((c) => ({ id: c.id, label: `${c.label} · ${aud.endsWith("parents") ? `${c.families} famil${c.families === 1 ? "y" : "ies"}` : `${c.students} student${c.students === 1 ? "" : "s"}`}` }))
      : p === "level" ? opts.levels.map((c) => ({ id: c.id, label: `${c.label} · ${aud.endsWith("parents") ? `${c.families} famil${c.families === 1 ? "y" : "ies"}` : `${c.students} student${c.students === 1 ? "" : "s"}`}` })) : [];
    const f = find.trim().toLowerCase();
    return f ? all.filter((x) => x.label.toLowerCase().includes(f) || x.id === target) : all;
  }, [kind.pick, aud, opts, find, target]);
  // 6 Nov: one search for anyone: typing finds parents (and their children's names), students and teachers together;
  // picking someone switches "To" to that kind of person
  const one = kind.pick === "parent" || kind.pick === "student" || kind.pick === "teacher";
  const q = find.trim().toLowerCase();
  const found = useMemo(() => !q ? [] : ([["parent", "Parents", opts.parents], ["student", "Students", opts.students], ["teacher", "Teachers", opts.teachers]] as const)
    .map(([k, l, xs]) => ({ k, l, xs: xs.filter((x) => x.label.toLowerCase().includes(q)) })).filter((g) => g.xs.length), [q, opts]);
  const chosen = one && target ? (aud === "parent" ? opts.parents : aud === "student" ? opts.students : opts.teachers).find((x) => x.id === target)?.label ?? null : null;
  const hits = found.reduce((n, g) => n + g.xs.length, 0);
  const count = kind.pick === "class" ? opts.classes.find((c) => c.id === target) : kind.pick === "level" ? opts.levels.find((c) => c.id === target) : null;
  const reach = aud === "teachers" ? `${opts.teachers.length} teacher${opts.teachers.length === 1 ? "" : "s"}`
    : count ? (aud.endsWith("parents") ? `${count.families} famil${count.families === 1 ? "y" : "ies"}` : `${count.students} student${count.students === 1 ? "" : "s"}`) : null;
  const [dirty, setDirty] = useState(false);
  return <form action={action} className="card nm-form" onSubmit={() => setDirty(false)} onChange={() => setDirty(true)}>
    <input type="hidden" name="aud" value={aud} /><input type="hidden" name="target" value={kind.pick ? target : ""} />
    <fieldset className="nm-kinds"><legend>To</legend>
      {["One person", "A group"].map((g) => <div key={g} className="nm-row"><span className="nm-g">{g}</span>
        {KINDS.filter((k) => k.group === g).map((k) => <label key={k.id} className={`nm-chip${aud === k.id ? " on" : ""}`}>
          <input type="radio" name="kind" checked={aud === k.id} onChange={() => { setAud(k.id); setPicked(false); if (k.pick !== kind.pick) { setTarget(""); if (k.group !== "One person") setFind(""); } }} />{k.label}</label>)}</div>)}
    </fieldset>
    {kind.pick && <div className="nm-pick">
      {one && picked && chosen ? <div className="nm-picked"><span>To: <b>{chosen}</b> <span className="cs">({PICK_LABEL[aud]?.toLowerCase() ?? aud})</span></span>
        <button type="button" className="abtn sm" onClick={() => setPicked(false)}>Change</button></div> : <>
      {one && <label className="fld">Search everyone<input type="search" value={find} onChange={(e) => { setFind(e.target.value); setPicked(false); }} placeholder="Type a parent’s, student’s or teacher’s name" autoComplete="off" /></label>}
      {one && q ? <label className="fld">Matches<select required value={target ? `${aud}:${target}` : ""} size={Math.min(10, Math.max(3, hits + found.length))}
          onChange={(e) => { const [k, id] = e.target.value.split(":"); setAud(k as Audience); setTarget(id); setPicked(true); }}>
          {found.map((g) => <optgroup key={g.k} label={g.l}>{g.xs.map((x) => <option key={x.id} value={`${g.k}:${x.id}`}>{x.label}</option>)}</optgroup>)}</select></label>
      : <label className="fld">{PICK_LABEL[kind.pick]}<select required value={target} onChange={(e) => { setTarget(e.target.value); if (one) setPicked(true); }} size={one && kind.pick !== "teacher" ? Math.min(8, Math.max(3, list.length)) : undefined}>
        {!(kind.pick === "parent" || kind.pick === "student") && <option value="">Choose…</option>}
        {list.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>}
      {(one && q ? hits === 0 : list.length === 0) && <p className="cs" style={{ margin: 0 }}>{q ? "No one matches that." : "Nobody to choose yet."}</p>}
      </>}
    </div>}
    {reach && <p className="nm-reach">Goes to <b>{reach}</b>{!/^1 /.test(reach) ? ", each privately. Replies come back to you, one conversation each." : "."}</p>}
    <label className="fld">Subject<input name="subject" required maxLength={160} autoComplete="off" /></label>
    <label className="fld">Message<textarea name="body" required rows={8} maxLength={4500} autoComplete="off" /></label>
    <label className="nm-check"><input type="checkbox" name="email" value="1" defaultChecked /> Also send a copy by email<span className="cs"> (replies to the email arrive in Email › Inbox)</span></label>
    {testMode && <p className="note" style={{ margin: 0 }}>Test mode is on, so emails to families, students and teachers are held. The messages still appear on the platform.</p>}
    <div className="nm-btns"><button className="abtn pri" type="submit" disabled={!!kind.pick && !target}>Send</button><a className="abtn" href="/admin/messages" onClick={(e) => { if (dirty && !confirm("Leave without sending?")) e.preventDefault(); }}>Cancel</a></div>
  </form>;
}
