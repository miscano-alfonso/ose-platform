import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { myChats, teacherOwnsChat } from "@/lib/teacher-area";
import { chatThreads, threadMessages } from "@/lib/chat-threads";
import { teacherPostAction } from "../../../actions";
import { ChatThreads } from "../../../ChatThreads";

export const dynamic = "force-dynamic";

// Class chats as threads (31 Oct): pick a class, then a thread (?t=), or start a new one with a topic.
export default async function Chats({ searchParams }: { searchParams: Promise<{ c?: string; t?: string; err?: string }> }) {
  const [sp, me] = await Promise.all([searchParams, requireViewer()]);
  const chats = await myChats(me.id);
  const sel = chats.find((c) => c.id === sp.c) ?? chats[0];
  const mine = !!sel && await teacherOwnsChat(me.id, sel.id);
  const threads = mine ? await chatThreads(sel.id) : [];
  const open = threads.find((t) => t.id === sp.t) ?? null;
  const msgs = open ? await threadMessages(sel.id, open.id) : [];
  const href = (t?: string) => `/admin/teacher/chats?c=${sel?.id}${t ? `&t=${t}` : ""}`;
  return <>
    <div className="top"><div><h1>Class chats</h1><div className="sub">Your classes’ group chats, one thread per topic so conversations stay together. Students can also chat 1:1 with classmates; the office can see those.</div></div></div>
    {sp.err && <p className="note msg bad">{sp.err}</p>}
    {chats.length === 0 ? <p className="empty">You have no classes this year.</p> :
    <div className="dgrid ct-grid">
      <section className="card">{chats.map((c) => <Link key={c.id} href={`/admin/teacher/chats?c=${c.id}`} className="li" style={{ textDecoration: "none", color: "inherit", ...(c === sel ? { background: "var(--hover)", borderRadius: 10, paddingInline: 8 } : {}) }}>
        <div className="t"><b>👥 {c.name}</b><span>{c.messages} message{c.messages === 1 ? "" : "s"}</span></div></Link>)}</section>
      <section className="card"><h2>{sel?.name}</h2>
        {sel && <ChatThreads threads={threads} open={open} msgs={msgs} href={href} action={teacherPostAction} hidden={{ chat: sel.id }} canPost={!me.viewing}
          off={<p className="note">You’re viewing as {me.name}, so posting is off.</p>} />}
      </section></div>}
  </>;
}
