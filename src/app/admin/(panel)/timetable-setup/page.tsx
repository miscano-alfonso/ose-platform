import Link from "next/link";
import { getTimetable, classRosters, studentsForClashes, DAY, type Slot } from "@/lib/ops";
import { WeekGrid } from "./layouts";

const mins = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
const overlap = (a: Slot, b: Slot) => a.weekday === b.weekday && mins(a.starts_at) < mins(b.ends_at) && mins(b.starts_at) < mins(a.ends_at);
import type { Clash } from "./layouts";
const KIND = { teacher: "Teacher double-booked", student: "Student clash", level: "Same level" };

export default async function TimetableSetup({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; level?: string; teacher?: string }> }) {
  const sp = await searchParams;
  const [{ year, slots, classes, teachers }, rosters] = await Promise.all([getTimetable(), classRosters()]);
  // clashes, as in the prototype: a teacher in two places, a student with two lessons at once, or two classes at the same level at once
  const clashes: Clash[] = [];
  slots.forEach((a, i) => slots.slice(i + 1).forEach((b) => {
    if (a.group_id === b.group_id || !overlap(a, b)) return;
    const ids = (rosters[a.group_id] ?? []).filter((x) => (rosters[b.group_id] ?? []).includes(x)), shared = ids.length;
    if (a.teacher_id && a.teacher_id === b.teacher_id) clashes.push({ kind: "teacher", a, b, shared, ids });
    else if (shared) clashes.push({ kind: "student", a, b, shared, ids });
    else if (a.level === b.level && a.subject !== b.subject) clashes.push({ kind: "level", a, b, shared, ids });
  }));
  const who = await studentsForClashes([...new Set(clashes.filter((c) => c.kind === "student").flatMap((c) => c.ids))]);
  // 28 Nov (Alfonso chose the week grid, "can you add filtering, for teacher and levels"): the week as a grid, filtered by
  // level and teacher. Press + to put a class in a spot; press a lesson to move it, change its class's teacher, or remove it.
  const ORDER = ["KS3", "Pre-GCSE", "GCSE", "iGCSE", "A-Level"], rank = (l: string) => { const i = ORDER.indexOf(l); return i < 0 ? 99 : i; };
  const levels = [...new Set(classes.map((c) => c.level))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const level = levels.includes(sp.level ?? "") ? sp.level! : "All", teacher = teachers.some((t) => t.id === sp.teacher) ? sp.teacher! : "";
  const fit = (c: { level: string; teacher_id: string | null }) => (level === "All" || c.level === level) && (!teacher || c.teacher_id === teacher);
  const shownClasses = classes.filter(fit);
  const shownSlots = slots.filter((s) => (level === "All" || s.level === level) && (!teacher || s.teacher_id === teacher || classes.find((c) => c.id === s.group_id)?.teacher_id === teacher));
  const href = (l: string, t: string) => `/admin/timetable-setup${l !== "All" || t ? "?" + new URLSearchParams({ ...(l !== "All" ? { level: l } : {}), ...(t ? { teacher: t } : {}) }) : ""}`;
  const ret = href(level, teacher);
  const myClashes = clashes.filter((c) => shownSlots.some((s) => s.id === c.a.id || s.id === c.b.id));
  return <>
    <div className="top"><div><h1>Timetable setup</h1><div className="sub">Each class’s weekly lesson times and teacher. Press + where a lesson should go; press a lesson to move it, change its teacher or remove it. Times show on the website and make the lesson dates for registers (holidays skipped). The day-to-day view is <Link href="/admin/timetable">Timetable</Link>.</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}
    {sp.err && <p className="note msg bad">{sp.err}</p>}
    <div className="tools tsx-tools">
      <div className="segl" role="group" aria-label="Level">{["All", ...levels].map((l) => <Link key={l} href={href(l, teacher)} aria-current={l === level ? "true" : undefined}>{l}</Link>)}</div>
      <div className="segl tsx-teachers" role="group" aria-label="Teacher"><Link href={href(level, "")} aria-current={!teacher ? "true" : undefined}>All teachers</Link>
        {teachers.filter((t) => classes.some((c) => c.teacher_id === t.id) || slots.some((s) => s.teacher_id === t.id)).map((t) => <Link key={t.id} href={href(level, t.id)} aria-current={teacher === t.id ? "true" : undefined}>{t.name.split(" ")[0]}</Link>)}</div>
      <span className="grow" style={{ flex: 1 }} />
      {myClashes.length ? <a href="#clashes" className="pill bad">{myClashes.length} clash{myClashes.length > 1 ? "es" : ""}</a> : <span className="pill good">No clashes</span>}
    </div>
    <WeekGrid slots={shownSlots} classes={shownClasses} teachers={teachers} clashes={clashes} ret={ret} />

    {myClashes.length > 0 && <section className="card" id="clashes"><h2>Clashes to fix</h2>
      <p className="cs">Press the lesson in the grid (it’s outlined) to move it.</p>
      {myClashes.map((c, i) => <div className="li" key={i}><span className={`pill ${c.kind === "level" ? "warn" : "bad"}`}>{KIND[c.kind]}</span>
        <div className="t"><b>{c.a.name} and {c.b.name}</b><span>{DAY[c.a.weekday]} {c.a.starts_at} and {c.b.starts_at}{c.kind === "student" ? ` · ${c.shared} student${c.shared > 1 ? "s take" : " takes"} both`
          : c.kind === "teacher" ? ` · both taught by ${c.a.teacher}` : " · students at this level can’t take both"}</span>
          {c.kind === "student" && c.ids.length > 0 && <details className="clash-who"><summary>{c.shared === 1 ? "Who is it?" : `Who are they? (${c.shared})`}</summary>
            <ul>{c.ids.map((id) => { const p = who[id]; return <li key={id}>{p?.parent_id ? <Link href={`/admin/families/${p.parent_id}`}>{p.name}</Link> : <b>{p?.name ?? "A student"}</b>}
              {p?.family ? <span className="muted"> · {p.family}’s family</span> : null}</li>; })}</ul></details>}</div></div>)}</section>}
  </>;
}
