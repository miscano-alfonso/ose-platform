import Link from "next/link";
import { listCoursePages } from "@/lib/site-content";

export const dynamic = "force-dynamic";

// 28 Nov (Alfonso: "can we make this a nav item"): the website's course pages, moved out of Admin → Website into their own page.
export default async function CoursePages({ searchParams }: { searchParams: Promise<{ level?: string }> }) {
  const [all, sp] = await Promise.all([listCoursePages(), searchParams]);
  // 28 Nov (Alfonso: "can this page have filtering for levels")
  const levels = [...new Set(all.map((c) => c.level))];
  const level = levels.includes(sp.level ?? "") ? sp.level! : "All";
  const pages = all.filter((c) => level === "All" || c.level === level);
  return <>
    <div className="top"><div><h1>Course pages</h1><div className="sub">The text on each course’s page on the website: introduction, topics, exam board and a sample lesson recording. Dates, times, teachers and places come from Classes and Timetable.</div></div>
      <span className="grow" /><a className="abtn sm" href="/courses" target="_blank" rel="noreferrer">View the courses</a></div>
    <div className="segl" role="group" aria-label="Level" style={{ marginBottom: 12 }}>{["All", ...levels].map((l) => <Link key={l} href={l === "All" ? "/admin/website/courses" : `/admin/website/courses?level=${encodeURIComponent(l)}`} aria-current={l === level ? "true" : undefined}>{l} ({l === "All" ? all.length : all.filter((c) => c.level === l).length})</Link>)}</div>
        <div className="tw"><table><thead><tr><th>Course</th><th>Topics</th><th>Exam board</th><th>Sample lesson</th><th></th></tr></thead>
      <tbody>{pages.map((c) => <tr key={c.id}><td><b>{c.level} {c.subject}</b>{!c.published && <> <span className="pill mute">Hidden</span></>}</td><td>{c.topics.length}</td><td>{c.exam_board ?? "—"}</td><td>{!c.video ? <span className="muted">None</span> : c.video.includes("ohsoed.co.uk/uploads") ? <span className="pill warn">On the old site</span> : <span className="pill good">Yes</span>}</td>
        <td><div className="acts"><Link className="abtn sm" href={`/admin/website/courses/${c.id}`}>Edit</Link><a className="abtn sm" href={`/courses/${c.slug}`} target="_blank" rel="noreferrer">View</a></div></td></tr>)}</tbody></table></div>

  </>;
}
