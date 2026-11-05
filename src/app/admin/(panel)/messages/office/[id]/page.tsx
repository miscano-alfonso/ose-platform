import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { officeThread } from "@/lib/office-messages";
import { officeReplyAction, officeStatusAction } from "../../../../actions";

const when = (s: string) => new Date(s).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const KIND: Record<string, string> = { parent: "Parent", student: "Student", teacher: "Teacher" };

// One conversation the office started (5 Nov).
export default async function OfficeConversation({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const [{ id }, sp, me] = await Promise.all([params, searchParams, requireStaff()]);
  void me; const t = await officeThread(id, true);
  if (!t) notFound();
  const { th, msgs } = t;
  return <>
    <p className="backlink"><Link className="abtn sm" href={th.batch_id ? `/admin/messages?view=office&batch=${th.batch_id}` : "/admin/messages?view=office"}>← {th.batch ? th.batch : "Messages"}</Link></p>
    <div className="top"><div><h1>{th.subject}</h1><div className="sub">To {th.name}{th.email ? ` (${th.email})` : " (no email address)"} · {KIND[th.to_kind]}{th.about ? ` · about ${th.about}` : ""}
      {th.batch && <> · part of a message to <Link href={`/admin/messages?view=office&batch=${th.batch_id}`}>{th.batch}</Link> ({th.batch_size})</>}</div></div>
      <span className="grow" />{th.status === "closed" ? <span className="pill mute">Closed</span> : <span className="pill good">Open</span>}</div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>{msgs.map((m) => <div key={m.id} className={`card bubble b-${m.sender === "office" ? "office" : "parent"}`} style={{ margin: 0 }}>
      <div className="muted" style={{ fontSize: 14, marginBottom: 4 }}><b>{m.who}</b> · {m.sender === "office" ? "Office" : KIND[m.sender]} · {when(m.created_at)}
        {m.sender === "office" && <> · {m.emailed ? "emailed" : "platform only"}{m.read_at ? " · read" : ""}</>}</div>
      <div style={{ whiteSpace: "pre-line" }}>{m.body}</div></div>)}</div>
    <form action={officeReplyAction} className="card" style={{ display: "grid", gap: 10 }}>
      <input type="hidden" name="id" value={th.id} />
      <label className="fld">Reply{th.status === "closed" ? " (this reopens the conversation)" : ""}<textarea name="body" required rows={5} maxLength={4500} className="mini" style={{ width: "100%" }} /></label>
      <label className="nm-check"><input type="checkbox" name="email" value="1" defaultChecked={!!th.email} disabled={!th.email} /> Also send a copy by email</label>
      <div><button className="abtn pri" type="submit">Send</button></div>
    </form>
    <form action={officeStatusAction} style={{ marginTop: 10 }}><input type="hidden" name="id" value={th.id} /><input type="hidden" name="status" value={th.status === "open" ? "closed" : "open"} />
      <button className="abtn sm" type="submit">{th.status === "open" ? "Close this conversation" : "Reopen"}</button></form>
  </>;
}
