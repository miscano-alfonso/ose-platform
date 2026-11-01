import { notFound } from "next/navigation";
import { requireStudent } from "@/lib/family-auth";
import { studentOneCourse } from "@/lib/one-courses";
import { studentNextOne } from "@/lib/family";
import { Head, dlong, hm } from "../../../fmt";

// A student's 1:1 (2 Nov): its work from their 1:1 Google Classroom, and the next 1:1. The work is done, handed in and
// commented on in Classroom; each piece opens there.
export default async function StudentOne({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, f] = await Promise.all([params, requireStudent()]);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [c, next] = await Promise.all([studentOneCourse(f.id, id), studentNextOne(f.id).catch(() => null)]);
  if (!c) notFound();
  return <>
    <Head title={`1:1 · ${c.subject ?? c.name ?? "My 1:1"}`} sub={`With ${c.teacher}`}>{c.link && <a className="abtn pri" href={c.link} target="_blank" rel="noopener">Open in Classroom</a>}</Head>
    {next && <p className="note msg">Next 1:1: <b>{dlong(next.at)} {hm(next.at)}</b>{next.meet ? <> · <a href={next.meet} target="_blank" rel="noopener">Meet link</a></> : null}</p>}
    <section className="card"><h2>Work</h2>
      {c.items.length === 0 ? <p className="empty">No work set yet. When {c.teacher.split(" ")[0]} sets some in Classroom, it shows here.</p>
        : c.items.map((w) => <div className="li" key={w.id}><div className="t"><b>{w.link ? <a href={w.link} target="_blank" rel="noopener">{w.title}</a> : w.title}</b>
            <span>{w.status === "returned" ? "Returned: open it to see the comments" : w.turned_in_at ? `Handed in ${dlong(w.turned_in_at)}${w.late ? ", late" : ""}` : w.due_at ? `Due ${dlong(w.due_at)}` : "No due date"}</span></div>
          {w.status === "returned" ? <span className="pill good">{w.points != null && w.max ? `${w.points}/${w.max}` : "Returned"}</span>
            : w.status === "handed_in" ? <span className="pill info">Handed in</span> : w.status === "missing" ? <span className="pill bad">Missing</span> : <span className="pill mute">To do</span>}</div>)}
    </section>
    <p className="note">You do this work, hand it in and read {c.teacher.split(" ")[0]}’s comments in Google Classroom, with your school account. Each piece of work opens there.</p>
  </>;
}
