import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { myStudents, myClasses } from "@/lib/teacher-area";
import { StudentRows, StudentTable, ViewSwitch, sortOf, sortStudents } from "../StudentRows";

export const dynamic = "force-dynamic";

// My students (31 Oct): everyone the teacher teaches this year, with their classes, attendance, SEND (where the parent shares it),
// Google account and birthday. Filter by class or SEND, search by name, or sort by any column heading in the list.
export default async function MyStudents({ searchParams }: { searchParams: Promise<{ q?: string; show?: string; view?: string; sort?: string; dir?: string }> }) {
  const me = await requireViewer();
  const sp = await searchParams;
  const [all, classes] = await Promise.all([myStudents(me.id), myClasses(me.id)]);
  const q = (sp.q ?? "").trim().toLowerCase(), show = sp.show ?? "all", view = sp.view === "cards" ? "cards" : "list";
  const so = sortOf(sp);
  const list = sortStudents(all.filter((s) => (!q || `${s.name} ${s.known_as ?? ""}`.toLowerCase().includes(q))
    && (show === "all" || (show === "send" && s.send) || (show === "low" && s.att !== null && s.att < 85) || (s.classes ?? []).some((c) => c.id === show))), so.key, so.dir);
  const sendN = all.filter((s) => s.send).length;
  const keep = { ...(so.key !== "name" ? { sort: so.key } : {}), ...(so.dir === "desc" ? { dir: "desc" } : {}) };
  const href = (v: string, w = view, o: Record<string, string> = keep) => `/admin/teacher/students?${new URLSearchParams({ ...(v !== "all" ? { show: v } : {}), ...(sp.q ? { q: sp.q } : {}), ...(w === "cards" ? { view: "cards" } : {}), ...o })}`;
  const hidden = Object.entries(keep).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />);
  return <>
    <div className="top"><div><h1>My students</h1><div className="sub">{all.length} student{all.length === 1 ? "" : "s"} across {classes.length} class{classes.length === 1 ? "" : "es"}{sendN ? ` · ${sendN} with SEND` : ""}</div></div></div>
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
      <form method="get" action="/admin/teacher/students" style={{ display: "flex", gap: 6 }}>{show !== "all" && <input type="hidden" name="show" value={show} />}{view === "cards" && <input type="hidden" name="view" value="cards" />}{hidden}
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Search by name" aria-label="Search students" className="mini" style={{ width: 220 }} /><button className="abtn sm" type="submit">Search</button></form>
      <div className="segl" role="group" aria-label="Show">
        {[["all", "All"], ["send", `SEND (${sendN})`], ["low", "Attendance under 85%"]].map(([k, l]) => <Link key={k} scroll={false} href={href(k)} aria-current={show === k ? "true" : undefined}>{l}</Link>)}
      </div>
      <form method="get" action="/admin/teacher/students">{sp.q && <input type="hidden" name="q" value={sp.q} />}{view === "cards" && <input type="hidden" name="view" value="cards" />}{hidden}
        <select name="show" defaultValue={classes.some((c) => c.id === show) ? show : ""} className="mini" aria-label="Class">
          <option value="">Any class</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.level} {c.subject} ({c.code})</option>)}</select>
        <button className="abtn sm" type="submit" style={{ marginLeft: 6 }}>Show</button></form>
      <span style={{ flex: 1 }} /><ViewSwitch view={view} href={(w) => href(show, w)} />
    </div>
    {list.length === 0 ? <p className="empty">{all.length ? "No students match." : "No students in your classes yet."}</p> : view === "list" ? <StudentTable list={list} sort={{ ...so, href: (k, d) => href(show, "list", { ...(k !== "name" ? { sort: k } : {}), ...(d === "desc" ? { dir: "desc" } : {}) }) }} /> : <StudentRows list={list} />}
    <p className="note">SEND details show only where the parent agreed to share them with teachers. To contact a parent, use <Link href="/admin/teacher/messages">Messages</Link>.</p>
  </>;
}
