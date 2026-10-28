import Link from "next/link";
import { chatOverview, chatMessages } from "@/lib/community";
import { hideChatMessageAction, dismissReportAction, officePostAction, setWordsAction, saveChatSafetyAction, resolveChatFlagAction } from "../../actions";
import { RULES, openFlags, ruleLabel, safetyCfg } from "@/lib/chat-safety";

const when = (s: string) => new Date(s).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

export default async function StudentChat({ searchParams }: { searchParams: Promise<{ chat?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const [{ chats, reports, words }, flags, safe] = await Promise.all([chatOverview(), openFlags(), safetyCfg()]);
  const chat = chats.find((c) => c.id === sp.chat);
  const msgs = chat ? await chatMessages(chat.id) : [];
  return <>
    <div className="top"><div><h1>Student chat</h1><div className="sub">A chat for each class, and private chats between classmates. Staff can read chats to keep students safe, and hide messages; students can report a message, and the safety rules flag or block the rest.</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    <section className="card" id="alerts"><h2>Safety alerts ({flags.length})</h2>
      <p className="cs">Messages that matched the safety rules below. Blocked ones were never shown to anyone; the others were posted and are waiting for you to check.</p>
      {flags.length === 0 ? <p className="empty">No alerts.</p> : flags.map((x) => { const urgent = x.rules.includes("wellbeing"); return <div className="li" key={x.id} style={urgent ? { borderLeft: "4px solid #c0392b", paddingLeft: 10 } : undefined}>
        <div className="t"><b>“{x.body}”</b><span>{urgent && <span className="pill bad" style={{ marginRight: 6 }}>Urgent: wellbeing</span>}{x.rules.filter((r) => r !== "wellbeing").map((r) => <span key={r} className="pill warn" style={{ marginRight: 6 }}>{ruleLabel(r)}</span>)}
          {x.blocked ? <span className="pill mute" style={{ marginRight: 6 }}>Blocked</span> : null}{x.sender} · {x.chat} · {when(x.created_at)}{x.matched ? ` · matched “${x.matched}”` : ""} · <Link href={`/admin/student-chat?chat=${x.chat_id}`}>see chat</Link></span></div>
        <div className="acts">{x.message_id && !x.hidden && <form action={resolveChatFlagAction}><input type="hidden" name="id" value={x.id} /><input type="hidden" name="hide" value="1" /><button className="abtn sm pri" type="submit">Hide message</button></form>}
          <form action={resolveChatFlagAction}><input type="hidden" name="id" value={x.id} /><button className="abtn sm" type="submit">{x.blocked || x.hidden ? "Done" : "No action"}</button></form></div></div>; })}
      {flags.some((x) => x.rules.includes("wellbeing")) && <p className="note msg bad" style={{ marginTop: 10 }}>An urgent alert may mean a child is at risk. Follow your safeguarding procedure and speak to your designated safeguarding lead today.</p>}
    </section>
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

    <section className="card" id="safety" style={{ marginTop: 16 }}><h2>Safety rules</h2>
      <form action={saveChatSafetyAction} style={{ display: "grid", gap: 14 }}>
        <div className="tw" style={{ margin: 0 }}><table><thead><tr><th>Watch for</th><th>What happens</th></tr></thead><tbody>
          {RULES.map((r) => <tr key={r.id}><td><b>{r.name}</b><div className="muted" style={{ fontSize: 14 }}>{r.about}</div></td>
            <td><select name={`mode_${r.id}`} defaultValue={safe.modes[r.id]} className="mini"><option value="off">Off</option><option value="alert">Alert staff (message is posted)</option>{r.canBlock && <option value="block">Block it and alert staff</option>}</select></td></tr>)}
        </tbody></table></div>
        <label className="fld">Email alerts to (your safeguarding lead; up to 5, separated by commas). Leave empty for dashboard alerts only.<input name="email" type="text" defaultValue={safe.email} maxLength={400} className="mini" style={{ maxWidth: 520 }} /></label>
        <label className="fld">Chat rules for families, one per line. Parents tick to agree these with their child before turning chat on, and students see them in their chat.<textarea name="rules" rows={7} maxLength={4000} defaultValue={safe.rules.join("\n")} className="mini" style={{ width: "100%", maxWidth: 720 }} /></label>
        <p className="note" style={{ margin: 0 }}>Automatic checks catch common words and patterns, not everything. They work alongside students’ Report button and staff reading chats. Changing the rules asks parents to agree again next time they visit My details.</p>
        <div><button className="abtn pri" type="submit">Save safety rules</button></div></form></section>
    <section className="card" style={{ marginTop: 16 }}><h2>Blocked words</h2>
      <form action={setWordsAction} style={{ display: "grid", gap: 10 }}>
        <label className="fld">One per line. Messages containing any of these are refused.<textarea name="words" rows={6} maxLength={5000} defaultValue={words.join("\n")} className="mini" style={{ width: "100%", maxWidth: 420 }} /></label>
        <div><button className="abtn" type="submit">Save words</button></div></form></section>
    <p className="note">Students will use the chat from their own area once it’s live. Class chats are set up for every class automatically.</p>
  </>;
}
