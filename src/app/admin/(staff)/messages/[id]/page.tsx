import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { getThread } from "@/lib/community";
import { replyThreadAction, setThreadStatusAction } from "../../../actions";

const when = (s: string) => new Date(s).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

export default async function ThreadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string }> }) {
  const [{ id }, sp, me] = await Promise.all([params, searchParams, requireViewer()]);
  const t = await getThread(id);
  if (!t || (me.role !== "school_admin" && t.th.teacher_user !== me.id)) notFound();
  const { th, msgs } = t;
  const isTeacher = th.teacher_user === me.id;
  return <>
    <p><a href={me.role === "school_admin" ? "/admin/messages" : "/admin/teacher/messages"}>← Back</a></p>
    <div className="top"><div><h1>{th.subject}</h1><div className="sub">{th.parent} ({th.parent_email}) · about {th.student} · teacher {th.teacher}</div></div>
      <span className="grow" />{th.status === "closed" ? <span className="pill mute">Closed</span> : <span className="pill good">Open</span>}</div>
    {sp.err && <p className="note msg bad">{sp.err}</p>}
    <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>{msgs.map((m) => <div key={m.id} className={`card bubble b-${m.sender}`} style={{ margin: 0 }}>
      <div className="muted" style={{ fontSize: 14, marginBottom: 4 }}><b>{m.who}</b> · {m.sender === "office" ? "Office" : m.sender === "teacher" ? "Teacher" : "Parent"} · {when(m.created_at)}</div>
      <div style={{ whiteSpace: "pre-line" }}>{m.body}</div></div>)}</div>
    {(th.status === "open" || me.role === "school_admin") && <form action={replyThreadAction} className="card" style={{ display: "grid", gap: 10 }}>
      <input type="hidden" name="id" value={th.id} />
      <label className="fld">Reply{!isTeacher && " (sent as the office)"}<textarea name="body" required rows={5} maxLength={5000} className="mini" style={{ width: "100%" }} /></label>
      <div><button className="abtn pri" type="submit">Send</button></div>
      <p className="cs">Families will read and reply in their account once the parent area is live.</p>
    </form>}
    {me.role === "school_admin" && <form action={setThreadStatusAction} style={{ marginTop: 10 }}><input type="hidden" name="id" value={th.id} /><input type="hidden" name="status" value={th.status === "open" ? "closed" : "open"} />
      <button className="abtn sm" type="submit">{th.status === "open" ? "Close this conversation" : "Reopen"}</button></form>}
  </>;
}
