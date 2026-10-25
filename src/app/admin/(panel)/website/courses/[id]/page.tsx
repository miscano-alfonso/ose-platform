import Link from "next/link";
import { notFound } from "next/navigation";
import { getCoursePageAdmin } from "@/lib/site-content";
import { saveCoursePageAction } from "../../../../actions";

export default async function EditCoursePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const c = await getCoursePageAdmin(id);
  if (!c) notFound();
  const topics = c.topics.map((t) => `## ${t.title}\n${t.text}`).join("\n\n");
  return <>
    <p><Link href="/admin/website">← Website</Link></p>
    <div className="top"><div><h1>{c.level} {c.subject}</h1><div className="sub">/courses/{c.slug}</div></div><span className="grow" />
      <a className="abtn sm" href={`/courses/${c.slug}`} target="_blank" rel="noreferrer">View page</a></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}
    <form action={saveCoursePageAction} className="card" style={{ display: "grid", gap: 12 }}>
      <input type="hidden" name="id" value={c.id} />
      <label className="fld">Exam board (optional)<input name="board" maxLength={60} defaultValue={c.exam_board ?? ""} style={{ maxWidth: 240 }} /></label>
      <label className="fld">Introduction (optional)<textarea name="intro" rows={3} maxLength={2000} defaultValue={c.intro ?? ""} className="mini" style={{ width: "100%" }} /></label>
      <label className="fld">Topics: start each topic with “## ” and its title, then its description. Lines starting “- ” show as bullet points.
        <textarea name="topics" rows={24} maxLength={20000} defaultValue={topics} className="mini" style={{ width: "100%", fontFamily: "ui-monospace, monospace", fontSize: 14 }} /></label>
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" name="published" defaultChecked={c.published} /> Show the topics on the website</label>
      <div><button className="abtn pri" type="submit">Save</button></div>
    </form>
    <p className="note">Lesson times, price, teacher and level come from the class itself (Classes and Timetable), so they’re always up to date.</p>
  </>;
}
