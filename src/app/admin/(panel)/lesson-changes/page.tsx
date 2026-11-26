import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { changeRequests, whenText } from "@/lib/lesson-changes";
import { decideLessonRequestAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lesson changes" };

// Admin → Timetable → Lesson changes (26 Nov): teachers' requests to cancel or move a lesson, waiting for the office, and
// the ones dealt with in the last 60 days. To cancel or move a lesson yourself, open it from the Timetable.
export default async function LessonChanges({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  await requireStaff();
  const [sp, pending, recent] = await Promise.all([searchParams, changeRequests("pending"), changeRequests("recent")]);
  const what = (r: (typeof pending)[number]) => r.kind === "move" ? `Move to ${whenText(r.new_date!, r.new_start!)}` : "Cancel";
  return <>
    <div className="top"><div><h1>Lesson changes</h1><div className="sub">Teachers’ requests to cancel or move a lesson. To change a lesson yourself, open it from the <Link href="/admin/timetable">Timetable</Link>.</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    <section className="card"><h2>Waiting for you{pending.length ? ` (${pending.length})` : ""}</h2>
      {pending.length === 0 ? <p className="empty">No requests waiting.</p> : pending.map((r) => <div className="li cl-li" key={r.id}>
        <div className="t"><b>{r.cls} <span className="muted" style={{ fontWeight: 400 }}>{r.code}</span> · {whenText(r.date, r.start)}</b>
          <span><b style={{ fontWeight: 500 }}>{what(r)}</b> · {r.requester ?? r.teacher}: “{r.reason}”</span><Link href={`/admin/register/${r.event_id}?back=/admin/lesson-changes#change`}>Open the lesson</Link></div>
        <div className="cl-decide">
          <form action={decideLessonRequestAction} className="cl-row"><input type="hidden" name="id" value={r.event_id} /><input type="hidden" name="request" value={r.id} /><input type="hidden" name="from" value="list" /><input type="hidden" name="decision" value="approve" />
            <label className="chk"><input type="checkbox" name="email" value="1" defaultChecked /> Email the families</label><button className="abtn pri" type="submit">Approve</button></form>
          <form action={decideLessonRequestAction} className="cl-row"><input type="hidden" name="id" value={r.event_id} /><input type="hidden" name="request" value={r.id} /><input type="hidden" name="from" value="list" /><input type="hidden" name="decision" value="decline" />
            <input name="note" maxLength={300} placeholder="Why not (optional)" aria-label="Why it's declined" /><button className="abtn" type="submit">Decline</button></form></div>
      </div>)}</section>
    <section className="card"><h2>Dealt with (last 60 days)</h2>
      {recent.length === 0 ? <p className="empty">None yet.</p> : recent.map((r) => <div className="li" key={r.id}>
        <div className="t"><b>{r.cls} · {whenText(r.date, r.start)}</b><span>{what(r)} · {r.requester ?? r.teacher}: “{r.reason}”{r.decline_note ? ` · ${r.decline_note}` : ""}</span></div>
        <span className={`pill ${r.status === "approved" ? "good" : r.status === "declined" ? "bad" : "mute"}`}>{r.status === "approved" ? "Approved" : r.status === "declined" ? "Declined" : "Withdrawn"}</span></div>)}</section>
  </>;
}
