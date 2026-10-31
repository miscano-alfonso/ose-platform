import { requireViewer } from "@/lib/auth";
import { myStudents } from "@/lib/community";
import { startThreadAction } from "../../../actions";

export default async function NewMessage({ searchParams }: { searchParams: Promise<{ err?: string; student?: string }> }) {
  const [sp, me] = await Promise.all([searchParams, requireViewer()]);
  const students = await myStudents(me.id);
  return <>
    <p className="backlink"><a href="/admin/teacher/messages">← Back</a></p>
    <div className="top"><div><h1>Write to a family</h1><div className="sub">About a student in one of your classes. The office can see every conversation.</div></div></div>
    {sp.err && <p className="note msg bad">{sp.err}</p>}
    {students.length === 0 ? <p className="empty">You don’t have any students yet.</p> :
    <form action={startThreadAction} className="card" style={{ display: "grid", gap: 12 }}>
      <label className="fld">Student<select name="student" required defaultValue={students.some((s) => s.id === sp.student) ? sp.student : ""}><option value="" disabled>Choose</option>{students.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.class})</option>)}</select></label>
      <label className="fld">Subject<input name="subject" required maxLength={120} /></label>
      <label className="fld">Message<textarea name="body" required rows={8} maxLength={5000} className="mini" style={{ width: "100%" }} /></label>
      <div><button className="abtn pri" type="submit">Send</button></div>
    </form>}
  </>;
}
