import Link from "next/link";
import { chatOverview, chatMessages } from "@/lib/community";
import { hideChatMessageAction, dismissReportAction, officePostAction, setWordsAction } from "../../actions";

const when = (s: string) => new Date(s).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

export default async function StudentChat({ searchParams }: { searchParams: Promise<{ chat?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { chats, reports, words } = await chatOverview();
  const chat = chats.find((c) => c.id === sp.chat);
  const msgs = chat ? await chatMessages(chat.id) : [];
  return <>
    <div className="top"><div><h1>Student chat</h1><div className="sub">A chat for each class, and private chats between classmates. Staff can read everything and hide messages; students can report a message.</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    <section className="card"><h2>Reported messages ({reports.length})</h2>
      {reports.length === 0 ? <p className="empty">Nothing reported.</p> : reports.map((r) => <div className="li" key={r.id}>
        <div className="t"><b>“{r.body}”</b><span>by {r.sender} · reported by {r.reporter} · {when(r.created_at)} · <Link href={`/admin/student-chat?chat=${r.chat_id}`}>see chat</Link></span></div>
        <div className="acts"><form action={hideChatMessageAction}><input type="hidden" name="id" value={r.message_id} /><input type="hidden" name="hide" value="1" /><input type="hidden" name="chat" value={r.chat_id} /><button className="abtn sm pri" type="submit">Hide message</button></form>
          <form action={dismissReportAction}><input type="hidden" name="id" value={r.id} /><button className="abtn sm" type="submit">No action</button></form></div></div>)}</section>

    <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 320px) minmax(0, 1fr)", gap: 16, alignItems: "start" }} className="chatcols">
      <section className="card" style={{ margin: 0 }}><h2>Chats</h2>
        {chats.map((c) => <Link key={c.id} href={`/admin/student-chat?chat=${c.id}`} className="li" style={{ textDecoration: "none", color: "inherit", fontWeight: c.id === chat?.id ? 600 : 400 }}>
          <div className="t"><b>{c.name ?? "Private chat"}</b><span>{c.kind === "class" ? "Class" : "Private"} · {c.messages} message{c.messages === 1 ? "" : "s"}{c.last_at ? ` · ${when(c.last_at)}` : ""}</span></div></Link>)}</section>
      <section className="card" style={{ margin: 0 }}>
        {!chat ? <p className="empty">Choose a chat to read it.</p> : <>
          <h2>{chat.name}</h2>
          {chat.kind === "class" && <form action={officePostAction} className="eform" style={{ margin: "8px 0 14px" }}><input type="hidden" name="chat" value={chat.id} />
            <input name="body" className="mini" required maxLength={1000} placeholder="Post a message from the office" style={{ flex: 1, minWidth: 240 }} /><button className="abtn sm" type="submit">Post</button></form>}
          {msgs.length === 0 ? <p className="empty">No messages yet.</p> : msgs.map((m) => <div className="li" key={m.id} style={m.hidden ? { opacity: .55 } : undefined}>
            <div className="t"><b>{m.who}</b><span style={{ whiteSpace: "pre-line", color: "var(--ink)", fontSize: 15 }}>{m.body}</span><span>{when(m.created_at)}{m.hidden ? " · hidden from students" : ""}</span></div>
            <form action={hideChatMessageAction}><input type="hidden" name="id" value={m.id} /><input type="hidden" name="hide" value={m.hidden ? "0" : "1"} /><input type="hidden" name="chat" value={chat.id} />
              <button className="abtn sm" type="submit">{m.hidden ? "Show again" : "Hide"}</button></form></div>)}</>}
      </section>
    </div>

    <section className="card" style={{ marginTop: 16 }}><h2>Blocked words</h2>
      <form action={setWordsAction} style={{ display: "grid", gap: 10 }}>
        <label className="fld">One per line. Messages containing any of these are refused.<textarea name="words" rows={6} maxLength={5000} defaultValue={words.join("\n")} className="mini" style={{ width: "100%", maxWidth: 420 }} /></label>
        <div><button className="abtn" type="submit">Save words</button></div></form></section>
    <p className="note">Students will use the chat from their own area once it’s live. Class chats are set up for every class automatically.</p>
  </>;
}
