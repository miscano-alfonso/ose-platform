import { freeTimes, requestsFor, whenText, type FreeTime } from "@/lib/lesson-changes";
import { cancelLessonAction, moveLessonAction, requestLessonChangeAction, withdrawLessonRequestAction, decideLessonRequestAction } from "../../../actions";

// The lesson page's "Cancel or move this lesson" (26 Nov). The office cancels or moves it straight away (and can email the
// class's families); a teacher sends a request to the office. Only times free for the teacher, the level group (KS3,
// Pre-GCSE, GCSE) and the class's students are offered.
const dayLabel = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

function TimePicker({ times, required }: { times: FreeTime[]; required?: boolean }) {
  const days = [...new Set(times.map((t) => t.date))];
  return <label className="fld">New date and time
    <select name="to" required={required} defaultValue="">
      <option value="">{times.length ? "Choose a free time…" : "No free times in the next 3 weeks"}</option>
      {days.map((d) => <optgroup key={d} label={dayLabel(d)}>{times.filter((t) => t.date === d).map((t) =>
        <option key={t.start} value={`${t.date}|${t.start}`}>{dayLabel(d)}, {t.start}–{t.end}</option>)}</optgroup>)}
    </select></label>;
}
const Email = () => <label className="chk"><input type="checkbox" name="email" value="1" defaultChecked /> Email the class’s parents and students</label>;

export async function ChangeLesson({ id, admin, backInput }: { id: string; admin: boolean; backInput: React.ReactNode }) {
  const [times, reqs] = await Promise.all([freeTimes(id), requestsFor(id)]);
  const pending = reqs.find((r) => r.status === "pending"), past = reqs.filter((r) => r.status !== "pending").slice(0, 3);
  const what = (r: (typeof reqs)[number]) => r.kind === "move" ? `Move to ${whenText(r.new_date!, r.new_start!)}` : "Cancel this lesson";
  return <section className="card cl-card" id="change">
    <h2>{admin ? "Cancel or move this lesson" : "Need to cancel or move this lesson?"}</h2>
    <p className="cs">{admin ? "New times are ones that don’t clash with the teacher’s lessons, 1:1s or workshops, any lesson in the same level group (KS3, Pre-GCSE, GCSE), or the students’ other lessons."
      : "Ask the office. You can only choose times that don’t clash with your lessons, 1:1s or workshops, any lesson in the same level group (KS3, Pre-GCSE, GCSE), or the students’ other lessons."}</p>
    {pending && <div className="cl-req">
      <div className="t"><span className="pill warn">Waiting for the office</span><b>{what(pending)}</b><span>{pending.requester ? `${pending.requester}: ` : ""}“{pending.reason}”</span></div>
      {admin ? <div className="cl-decide">
          <form action={decideLessonRequestAction} className="cl-row"><input type="hidden" name="id" value={id} /><input type="hidden" name="request" value={pending.id} /><input type="hidden" name="decision" value="approve" />
            <Email /><button className="abtn pri" type="submit">Approve</button></form>
          <form action={decideLessonRequestAction} className="cl-row"><input type="hidden" name="id" value={id} /><input type="hidden" name="request" value={pending.id} /><input type="hidden" name="decision" value="decline" />
            <input name="note" maxLength={300} placeholder="Why not (optional)" aria-label="Why it's declined" /><button className="abtn" type="submit">Decline</button></form></div>
        : <form action={withdrawLessonRequestAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="request" value={pending.id} />{backInput}<button className="abtn sm" type="submit">Withdraw</button></form>}
    </div>}
    {admin ? <div className="cl-grid">
        <form action={moveLessonAction} className="eform"><input type="hidden" name="id" value={id} />{backInput}
          <h3>Move it</h3><TimePicker times={times} required />
          <label className="fld">Reason<input name="note" required maxLength={200} placeholder="e.g. Teacher at a training day" /></label>
          <Email /><button className="abtn pri" type="submit" disabled={!times.length}>Move lesson</button></form>
        <form action={cancelLessonAction} className="eform"><input type="hidden" name="id" value={id} />{backInput}
          <h3>Cancel it</h3><label className="fld">Reason<input name="note" required maxLength={200} placeholder="e.g. Teacher ill" /></label>
          <Email /><button className="abtn" type="submit">Cancel lesson</button></form></div>
      : !pending && <form action={requestLessonChangeAction} className="eform"><input type="hidden" name="id" value={id} />{backInput}
          <div className="cl-kind" role="radiogroup" aria-label="What do you need?">
            <label><input type="radio" name="kind" value="move" defaultChecked /> Move it to another time</label>
            <label><input type="radio" name="kind" value="cancel" /> Cancel it</label></div>
          <TimePicker times={times} />
          <label className="fld">Reason<input name="reason" required maxLength={300} placeholder="e.g. Hospital appointment" /></label>
          <button className="abtn pri" type="submit">Send to the office</button>
          <p className="note">If you’re moving it, choose the new time above. The office approves it and the families are told; you’ll get an email either way.</p></form>}
    {past.length > 0 && <div className="cl-past">{past.map((r) => <p key={r.id}><span className={`pill ${r.status === "approved" ? "good" : r.status === "declined" ? "bad" : "mute"}`}>{r.status === "approved" ? "Approved" : r.status === "declined" ? "Declined" : "Withdrawn"}</span> {what(r)} · “{r.reason}”{r.decline_note ? ` · office: ${r.decline_note}` : ""}</p>)}</div>}
  </section>;
}
