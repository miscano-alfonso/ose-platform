import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { getThread } from "@/lib/community";
import { officeThread, officeThreads } from "@/lib/office-messages";
import { adminInbox, markFamilySeen, type AdminItem } from "@/lib/admin-inbox";
import { officeReplyAction, officeStatusAction, replyThreadAction, setThreadStatusAction, adminMarkUnreadAction } from "../../actions";
import { NavCountSync } from "../../NavCountSync";

export const dynamic = "force-dynamic";
const when = (s: string) => new Date(s).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
/** "10:42" today, "Yest." yesterday, otherwise "24 Nov" (London time). */
function stamp(iso: string) {
  const d = new Date(Date.parse(iso.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00"))), f = (x: Date) => x.toLocaleDateString("en-GB", { timeZone: "Europe/London" }), now = new Date();
  if (isNaN(d.getTime())) return "";
  if (f(d) === f(now)) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  if (f(d) === f(new Date(now.getTime() - 864e5))) return "Yest.";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
}
const TABS = [["all", "All"], ["unread", "Unread"], ["office", "Office"], ["families", "Families"]] as const;
const KIND: Record<string, string> = { parent: "Parent", student: "Student", teacher: "Teacher" };
const av = (k: AdminItem["kind"]) => k === "family" ? "fam" : "sch";

// Admin → Messages (26 Nov: one inbox like the teacher's, Option B): every conversation in one list on the left (messages
// the office started, a class/level message as one row until someone replies, and parent ↔ teacher conversations),
// unread in bold with a yellow count; the open conversation on the right with the reply box. ?office= / ?family= / ?batch=.
export default async function Messages({ searchParams }: { searchParams: Promise<{ f?: string; office?: string; family?: string; batch?: string; ok?: string; err?: string }> }) {
  const [sp, me] = await Promise.all([searchParams, requireStaff()]);
  const f = TABS.some(([k]) => k === sp.f) ? sp.f! : "all";
  // open the chosen conversation first (that marks it read), then build the list
  const ot = sp.office ? await officeThread(sp.office, true) : null;
  const ft = sp.family && /^[0-9a-f-]{36}$/.test(sp.family) ? await getThread(sp.family) : null;
  if (ft) await markFamilySeen(me.id, ft.th.id);
  const bt = sp.batch && /^[0-9a-f-]{36}$/.test(sp.batch) ? await officeThreads("all", sp.batch) : [];
  const items = await adminInbox(me.id);
  const unreadN = items.filter((i) => i.unread > 0).length;
  const list = items.filter((i) => f === "unread" ? i.unread > 0 : f === "office" ? i.kind !== "family" : f === "families" ? i.kind === "family" : true);
  const sel = ot ? `office:${ot.th.id}` : ft ? `family:${ft.th.id}` : bt.length ? `batch:${sp.batch}` : "";
  const href = (it: AdminItem) => `/admin/messages?${it.kind}=${encodeURIComponent(it.id)}${f !== "all" ? `&f=${f}` : ""}`;
  const chosen = !!sel;
  const unreadBtn = (kind: AdminItem["kind"], id: string, cls: string, label: string) => <form action={adminMarkUnreadAction} className={cls}>
    <input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={id} /><input type="hidden" name="f" value={f} />
    <button type="submit" className="abtn sm" title="Mark as unread"><span aria-hidden="true" className="ib-dot" />{label}</button></form>;
  const head = (kind: AdminItem["kind"], initials: string, title: string, sub: React.ReactNode, tag: string, extra?: React.ReactNode) => <div className="ib-ch">
    <span className={`ib-av ${av(kind)}`} aria-hidden="true">{initials}</span>
    <div className="t"><h2>{title}</h2><span className="muted">{sub}</span></div>{extra}<span className={`ib-tag ${av(kind)}`}>{tag}</span></div>;
  const bubble = (key: string, mine: boolean, who: string, at: string, body: React.ReactNode, note?: string) =>
    <div key={key} className={`ib-b ${mine ? "me" : "them"}`}><div className="ib-body">{body}</div><small>{who} · {when(at)}{note ? ` · ${note}` : ""}</small></div>;
  const itemFor = (kind: AdminItem["kind"], id: string) => items.find((i) => i.kind === kind && i.id === id);
  const back = <Link className="abtn sm ib-back" href={`/admin/messages${f !== "all" ? `?f=${f}` : ""}`}>← All messages</Link>;

  // ---------- the right-hand pane ----------
  let pane: React.ReactNode = <div className="ib-empty"><b>{items.length ? "Choose a conversation" : "No messages yet"}</b>
    <span>{items.length ? "Pick one on the left to read it and reply." : "Messages the office sends, and conversations between parents and teachers, show here."}</span>
    <Link className="abtn pri" href="/admin/messages/write">New message</Link></div>;
  if (ot) { const { th, msgs } = ot, it = itemFor("office", th.id); pane = <>
    {head("office", it?.initials ?? "?", th.subject, <>{th.name}{th.email ? ` (${th.email})` : " (no email address)"} · {KIND[th.to_kind]}{th.about ? ` · about ${th.about}` : ""}
      {th.batch && <> · part of a message to <Link href={`/admin/messages?batch=${th.batch_id}`}>{th.batch}</Link> ({th.batch_size})</>}{th.status === "closed" ? " · closed" : ""}</>, "Office",
      msgs.some((m) => m.sender !== "office") ? unreadBtn("office", th.id, "ib-mu-h", "Mark as unread") : undefined)}
    <div className="ib-msgs">{msgs.map((m) => bubble(m.id, m.sender === "office", m.sender === "office" ? (m.who === "The office" ? "The office" : `${m.who} · the office`) : `${m.who} · ${KIND[m.sender] ?? m.sender}`, m.created_at, m.body,
      m.sender === "office" ? `${m.emailed ? "emailed" : "platform only"}${m.read_at ? " · read" : ""}` : undefined))}</div>
    <form action={officeReplyAction} className="ib-reply wide"><input type="hidden" name="id" value={th.id} /><input type="hidden" name="back" value="inbox" />
      <textarea name="body" required rows={3} maxLength={4500} placeholder={th.status === "closed" ? "Write a reply (this reopens it)…" : "Write a reply…"} aria-label="Reply" />
      <button className="abtn pri" type="submit">Send</button></form>
    <form action={officeStatusAction} className="ib-status"><input type="hidden" name="id" value={th.id} /><input type="hidden" name="back" value="inbox" /><input type="hidden" name="status" value={th.status === "open" ? "closed" : "open"} />
      <button className="abtn sm" type="submit">{th.status === "open" ? "Close this conversation" : "Reopen"}</button></form></>; }
  else if (ft) { const { th, msgs } = ft, it = itemFor("family", th.id); pane = <>
    {head("family", it?.initials ?? "P", th.subject, `${th.parent} (${th.parent_email}) · about ${th.student} · teacher ${th.teacher}${th.status === "closed" ? " · closed" : ""}`, "Parents ↔ teachers",
      unreadBtn("family", th.id, "ib-mu-h", "Mark as unread"))}
    <div className="ib-msgs">{msgs.map((m) => bubble(m.id, m.sender === "office", `${m.who} · ${m.sender === "office" ? "the office" : m.sender === "teacher" ? "Teacher" : "Parent"}`, m.created_at, m.body))}</div>
    <form action={replyThreadAction} className="ib-reply"><input type="hidden" name="id" value={th.id} /><input type="hidden" name="back" value="inbox" />
      <textarea name="body" required rows={3} maxLength={5000} placeholder="Write a reply (sent as the office)…" aria-label="Reply" /><button className="abtn pri" type="submit">Send</button></form>
    <form action={setThreadStatusAction} className="ib-status"><input type="hidden" name="id" value={th.id} /><input type="hidden" name="back" value="inbox" /><input type="hidden" name="status" value={th.status === "open" ? "closed" : "open"} />
      <button className="abtn sm" type="submit">{th.status === "open" ? "Close this conversation" : "Reopen"}</button></form></>; }
  else if (bt.length) { const t = bt[0]; pane = <>
    {head("batch", itemFor("batch", sp.batch!)?.initials ?? "G", t.subject, `To ${t.batch ?? "a group"} · ${t.batch_size ?? bt.length} people, each privately`, "Group")}
    <div className="ib-msgs"><ul className="ib-batch">{bt.map((r) => <li key={r.id}><Link href={`/admin/messages?office=${r.id}`}><b>{r.name}</b>
      <span className="muted">{KIND[r.to_kind]}{r.about ? ` · about ${r.about}` : ""} · {r.messages > 1 ? `${r.messages} messages` : "no reply yet"}{r.unread ? " · new reply" : ""}</span></Link></li>)}</ul></div></>; }

  return <>
    <div className="top"><div><h1>Messages</h1><div className="sub">Messages from the office, and conversations between parents and teachers, which admins can read and reply to (safeguarding).</div></div>
      <span className="grow" /><Link className="abtn pri" href="/admin/messages/write">New message</Link></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    <NavCountSync href="/admin/messages" count={unreadN} />
    <div className={`card ib${chosen ? " has-sel" : ""}`}>
      <div className="ib-list">
        <div className="segl ib-tabs" role="group" aria-label="Show">{TABS.map(([k, l]) => <Link key={k} scroll={false} href={`/admin/messages${k !== "all" ? `?f=${k}` : ""}`} aria-current={f === k ? "true" : undefined}>
          {l}{k === "unread" && unreadN > 0 && <b className="ib-n">{unreadN}</b>}</Link>)}</div>
        {list.length === 0 ? <p className="empty">{f === "unread" ? "Nothing unread." : "No conversations yet."}</p>
          : <nav className="ib-items" aria-label="Conversations">{list.map((it) => { const k = `${it.kind}:${it.id}`;
            return <div key={k} className="ib-row"><Link href={href(it)} className={`ib-it${it.unread ? " unread" : " read"}${sel === k ? " sel" : ""}`} aria-current={sel === k ? "true" : undefined}>
              <span className={`ib-av ${av(it.kind)}`} aria-hidden="true">{it.initials}</span>
              <span className="t"><span className="n"><b>{it.who}</b><span className="d">{stamp(it.at)}</span></span>
                <span className="s">{it.subject}</span><span className="p">{it.preview}</span>
                <span className="m"><span className={`ib-tag ${av(it.kind)}`}>{it.tag}</span>{it.sub && <span className="muted">{it.sub}</span>}
                  {it.waiting && <span className="pill warn">{it.kind === "family" ? "Waiting for the teacher" : "Waiting for your reply"}</span>}{it.closed && <span className="pill mute">Closed</span>}</span></span>
              {it.unread > 0 && <span className="ib-n" aria-label={`${it.unread} unread`}>{it.unread}</span>}</Link>
              {!it.unread && it.canUnread && unreadBtn(it.kind, it.id, "ib-mu", "Mark unread")}</div>; })}</nav>}
      </div>
      <section className="ib-conv" aria-label="Conversation">{chosen && back}{pane}</section>
    </div>
  </>;
}
