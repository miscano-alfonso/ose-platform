import Link from "next/link";
import { notFound } from "next/navigation";
import { getCycle } from "@/lib/reports";
import { createEntriesAction, reviewEntryAction, approveAllAction, publishCycleAction } from "../../../actions";

const day = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long" });

export default async function Cycle({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const data = await getCycle(id);
  if (!data) notFound();
  const { cycle: c, classes, review } = data;
  return <>
    <p><Link href="/admin/reports">← Reports</Link></p>
    <div className="top"><div><h1>{c.name}</h1><div className="sub">Comments due {day(c.comments_due)} · publish {day(c.publish_on)} · {c.approved}/{c.total} approved</div></div>
      <span className="grow" />
      {c.status !== "published" && <form action={createEntriesAction}><input type="hidden" name="id" value={c.id} /><button className="abtn" type="submit">{c.total ? "Add late joiners" : "Start: create a report for every student"}</button></form>}
      {c.status !== "published" && c.total > 0 && <form action={publishCycleAction}><input type="hidden" name="id" value={c.id} /><button className="abtn pri" type="submit">Publish to families</button></form>}
      {c.status === "published" && <span className="pill good">Published</span>}</div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}

    {classes.length > 0 && <div className="tw"><table><thead><tr><th>Class</th><th>Teacher</th><th>Written</th><th>Waiting for you</th><th>Approved</th><th></th></tr></thead>
      <tbody>{classes.map((k) => <tr key={k.group_id}><td><b>{k.name}</b> <span className="muted">{k.code}</span></td><td>{k.teacher ?? <span className="muted">Not set</span>}</td>
        <td>{k.done}/{k.total}</td><td>{k.submitted || "—"}</td><td>{k.approved === k.total ? <span className="pill good">All</span> : `${k.approved}/${k.total}`}</td>
        <td><Link className="abtn sm" href={`/admin/write/${c.id}/${k.group_id}`}>Open</Link></td></tr>)}</tbody></table></div>}

    <div className="top" style={{ marginTop: 18 }}><h2 style={{ font: "600 20px Jost", margin: 0 }}>Waiting for approval ({review.length})</h2><span className="grow" />
      {review.length > 1 && <form action={approveAllAction}><input type="hidden" name="id" value={c.id} /><button className="abtn sm" type="submit">Approve all {review.length}</button></form>}</div>
    {review.length === 0 ? <p className="empty">Nothing to review right now.</p> : review.map((r) => <section className="card" key={r.id}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}><h2 style={{ margin: 0 }}>{r.student}</h2><span className="muted">{r.class} · {r.teacher}</span></div>
      <p className="cs" style={{ margin: "6px 0" }}>Progress {r.progress ?? "—"}{r.avg_pct ? ` (marks ${r.avg_pct}%)` : ""} · Effort {r.effort}{r.working_grade ? ` · Working grade ${r.working_grade}` : ""}{r.predicted_grade ? ` · Predicted ${r.predicted_grade}` : ""}</p>
      <p style={{ whiteSpace: "pre-line", margin: "0 0 10px" }}>{r.comment}</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <form action={reviewEntryAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="cycle" value={c.id} /><input type="hidden" name="approve" value="1" /><button className="abtn pri sm" type="submit">Approve</button></form>
        <form action={reviewEntryAction} className="eform" style={{ gap: 6 }}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="cycle" value={c.id} /><input type="hidden" name="approve" value="0" />
          <input name="note" className="mini" placeholder="What to change" maxLength={300} required /><button className="abtn sm" type="submit">Send back</button></form>
      </div></section>)}
  </>;
}
