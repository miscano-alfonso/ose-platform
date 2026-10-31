import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { myClasses, myStudents, classWork } from "@/lib/teacher-area";
import { joinLabel } from "@/lib/video";
import { StudentRows, StudentTable, ViewSwitch, sortOf, sortStudents } from "../../StudentRows";
import { ClassWorkList } from "./ClassWork";
import { DAY, dm } from "../../fmt";

export const dynamic = "force-dynamic";

/** One of the teacher's classes: times and links, its students with their details (sortable), then its Google Classroom assignments. */
export default async function MyClass({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string; sort?: string; dir?: string }> }) {
  const sp = await searchParams;
  const view = sp.view === "cards" ? "cards" : "list", so = sortOf(sp);
  const me = await requireViewer();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const c = (await myClasses(me.id)).find((x) => x.id === id);
  if (!c) notFound();
  const [all, work] = await Promise.all([myStudents(me.id, id), classWork(id)]);
  const list = sortStudents(all, so.key, so.dir);
  const qs = (o: Record<string, string>) => { const u = new URLSearchParams(o).toString(); return `/admin/teacher/classes/${id}${u ? `?${u}` : ""}`; };
  return <>
    <p className="backlink"><Link className="abtn sm" href="/admin/teacher/classes">← My classes</Link></p>
    <div className="top"><div><h1>{c.level} {c.subject}<span className="h1-code">{c.code}</span></h1>
      <div className="sub">{(c.slots ?? []).map((s) => `${DAY[s.d]} ${s.t}–${s.e}`).join(" · ")} · {c.students} student{c.students === 1 ? "" : "s"}{c.att !== null ? ` · ${c.att}% attendance` : ""}</div></div>
      <span className="grow" /><div className="acts">
        {c.next && <Link className="abtn sm pri" href={`/admin/register/${c.next.id}`}>Next register · {dm(c.next.d)}</Link>}
        {c.meet_url && <a className="abtn sm" href={c.meet_url} target="_blank" rel="noopener">{joinLabel(c.meet_url)}</a>}
        {c.classroom && <a className="abtn sm" href={c.classroom} target="_blank" rel="noopener">Classroom</a>}
        <Link className="abtn sm" href="/admin/teacher/chats">Class chat</Link></div></div>
    {list.length > 0 && <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}><ViewSwitch view={view} href={(w) => qs(w === "cards" ? { view: "cards" } : {})} /></div>}
    {list.length === 0 ? <p className="empty">No students in this class yet.</p> : view === "list" ? <StudentTable list={list} showClasses={false} sort={{ ...so, href: (k, d) => qs({ ...(k !== "name" ? { sort: k } : {}), ...(d === "desc" ? { dir: "desc" } : {}) }) }} /> : <StudentRows list={list} showClasses={false} />}
    <p className="note">SEND details show only where the parent agreed to share them with teachers. To contact a parent, use <Link href="/admin/teacher/messages">Messages</Link>.</p>
    <ClassWorkList work={work} classroom={c.classroom} />
  </>;
}
