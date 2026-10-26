import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { myChats, teacherOwnsChat } from "@/lib/teacher-area";
import { chatMessages } from "@/lib/community";
import { teacherPostAction } from "../../../actions";

export const dynamic = "force-dynamic";
const when = (s: string) => new Date(s).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

export default async function Chats({ searchParams }: { searchParams: Promise<{ c?: string; err?: string }> }) {
  const [sp, me] = await Promise.all([searchParams, requireViewer()]);
  const chats = await myChats(me.id);
  const sel = chats.find((c) => c.id === sp.c) ?? chats[0];
  const msgs = sel && await teacherOwnsChat(me.id, sel.id) ? (await chatMessages(sel.id)).reverse() : [];
  return <>
    <div className="top"><div><h1>Class chats</h1><div className="sub">Your classes’ group chats. Students can also chat 1:1 with classmates; the office can see those.</div></div></div>
    {sp.err && <p className="note msg bad">{sp.err}</p>}
    {chats.length === 0 ? <p className="empty">You have no classes this year.</p> :
    <div className="dgrid" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1.6fr)" }}>
      <section className="card">{chats.map((c) => <Link key={c.id} href={`/admin/teacher/chats?c=${c.id}`} className="li" style={{ textDecoration: "none", color: "inherit", ...(c === sel ? { background: "var(--hover)", borderRadius: 10, paddingInline: 8 } : {}) }}>
        <div className="t"><b>👥 {c.name}</b><span>{c.messages} message{c.messages === 1 ? "" : "s"}</span></div></Link>)}</section>
      <section className="card"><h2>{sel?.name}</h2>
        <div style={{ display: "grid", gap: 8, maxHeight: 460, overflow: "auto", margin: "8px 0 12px" }}>
          {msgs.length === 0 ? <p className="empty">No messages yet. Say hello to the class.</p> : msgs.map((m) => <div key={m.id} className="card" style={{ margin: 0, padding: "8px 12px" }}>
            <div className="muted" style={{ fontSize: 14 }}><b>{m.who}</b> · {when(m.created_at)}</div>
            <div style={{ whiteSpace: "pre-line" }}>{m.hidden ? <i className="muted">Message removed by staff</i> : m.body}</div></div>)}</div>
        {sel && <form action={teacherPostAction} style={{ display: "flex", gap: 8 }}><input type="hidden" name="chat" value={sel.id} />
          <input name="body" className="mini" maxLength={1000} required placeholder="Write to the class…" style={{ flex: 1 }} disabled={me.viewing} />
          <button className="abtn pri" type="submit" disabled={me.viewing}>Send</button></form>}
        {me.viewing && <p className="note">You’re viewing as {me.name}, so posting is off.</p>}
      </section></div>}
  </>;
}
