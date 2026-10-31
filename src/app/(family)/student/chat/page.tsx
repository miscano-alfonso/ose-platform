import { requireStudent } from "@/lib/family-auth";
import { studentChats, chatFor } from "@/lib/family";
import { studentPostAction, startDirectAction, reportMessageAction } from "../../actions";
import { Head, Flash } from "../../fmt";
import { safetyCfg } from "@/lib/chat-safety";
import { chatThreads, threadMessages } from "@/lib/chat-threads";
import { ChatThreads } from "../../../admin/ChatThreads";

const when = (s: string) => new Date(s).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
export default async function Chat({ searchParams }: { searchParams: Promise<{ c?: string; t?: string; ok?: string; err?: string }> }) {
  const [sp, f] = await Promise.all([searchParams, requireStudent()]);
  const d = await studentChats(f.id);
  if (d.access === "none") return <><Head title="Chat" sub="Chat with your class" /><section className="card"><p>Chat is switched off. Ask your parent to turn it on in their account (My details).</p></section></>;
  const sel = d.chats.find((c) => c.id === sp.c) ?? d.chats[0];
  const safe = await safetyCfg();
  const raw = sel ? await chatFor(f.id, sel.id) : null;   // null when the student may not read this chat
  const msgs = raw ?? [], cls = sel?.kind === "class" && raw !== null;
  const threads = cls ? await chatThreads(sel!.id, f.id) : [];
  const open = threads.find((t) => t.id === sp.t) ?? null;
  const tmsgs = open ? await threadMessages(sel!.id, open.id, f.id) : [];
  return <>
    <Head title="Chat" sub="Your class chats. Be kind: teachers and the office can see every chat, and you can report anything that worries you." />
    <Flash sp={sp} />
    <details className="card" style={{ marginTop: 0 }}><summary style={{ cursor: "pointer", fontWeight: 600 }}>Chat rules</summary><ol style={{ margin: "8px 0 0", paddingLeft: 20, lineHeight: 1.5 }}>{safe.rules.map((r, i) => <li key={i}>{r}</li>)}</ol></details>
    <div className="dgrid" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1.8fr)" }}>
      <section className="card" style={{ margin: 0 }}>{d.chats.map((c) => <a key={c.id} href={`/student/chat?c=${c.id}`} className="li" style={{ textDecoration: "none", color: "inherit", ...(c.id === sel?.id ? { background: "var(--hover)", borderRadius: 10, paddingInline: 8 } : {}) }}>
        <div className="t"><b>{c.kind === "class" ? "👥 " : ""}{c.name}</b><span>{c.kind === "class" ? "Class chat" : "Private chat"}</span></div></a>)}
        {d.access === "class_and_private" && d.mates.length > 0 && <form action={startDirectAction} style={{ display: "flex", gap: 6, marginTop: 12 }}>
          <select name="with" className="mini" aria-label="Classmate">{d.mates.map((m) => <option key={m.id} value={m.id}>{m.first} ({m.class})</option>)}</select><button className="abtn sm" type="submit">Chat</button></form>}</section>
      <section className="card" style={{ margin: 0 }}>{!sel ? <p className="empty">No chats yet.</p> : <>
        <h2>{sel.name}</h2>
        {cls ? <ChatThreads threads={threads} open={open} msgs={tmsgs} href={(t) => `/student/chat?c=${sel.id}${t ? `&t=${t}` : ""}`} action={studentPostAction} hidden={{ chat: sel.id }}
          control={(m) => !m.mine && !m.hidden ? (m.reported ? <span className="muted">Reported</span> : <form action={reportMessageAction}><input type="hidden" name="chat" value={sel.id} /><input type="hidden" name="t" value={open?.id ?? ""} /><input type="hidden" name="id" value={m.id} /><button className="lnk" type="submit">Report</button></form>) : null} />
        : <><div style={{ display: "grid", gap: 8, maxHeight: 460, overflow: "auto", margin: "8px 0 12px" }}>{msgs.length === 0 ? <p className="empty">No messages yet. Say hello!</p> : msgs.map((m) => <div key={m.id} className="card" style={{ margin: 0, padding: "8px 12px", background: m.mine ? "var(--soft)" : undefined }}>
          <div className="muted" style={{ fontSize: 14, display: "flex", gap: 8 }}><b>{m.mine ? "You" : m.who}</b> · {when(m.at)}<span style={{ flex: 1 }} />
            {!m.mine && !m.hidden && (m.reported ? <span>Reported</span> : <form action={reportMessageAction}><input type="hidden" name="chat" value={sel.id} /><input type="hidden" name="id" value={m.id} /><button className="lnk" type="submit">Report</button></form>)}</div>
          <div style={{ whiteSpace: "pre-line" }}>{m.hidden ? <i className="muted">Message removed by staff</i> : m.body}</div></div>)}</div>
        <form action={studentPostAction} style={{ display: "flex", gap: 8 }}><input type="hidden" name="chat" value={sel.id} />
          <input name="body" className="mini" maxLength={1000} required placeholder="Write a message…" style={{ flex: 1 }} /><button className="abtn pri" type="submit">Send</button></form></>}</>}</section>
    </div>
  </>;
}
