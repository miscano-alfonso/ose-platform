import Link from "next/link";
import { listThreads } from "@/lib/community";
import { officeThreads, officeCounts } from "@/lib/office-messages";

const when = (s: string) => new Date(s).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const WHO: Record<string, string> = { parent: "Parent", teacher: "Teacher", office: "Office", student: "Student" };

// Admin → Messages: conversations between parents and teachers (safeguarding), and, since 5 Nov, the ones the office
// starts with "New message" (to a parent, student or teacher, or everyone in a class or level, each privately).
export default async function Messages({ searchParams }: { searchParams: Promise<{ show?: string; view?: string; batch?: string; ok?: string }> }) {
  const sp = await searchParams;
  const office = sp.view === "office";
  const show = sp.show === "closed" || sp.show === "all" || (office && sp.show === "replies") ? sp.show : "open";
  const [threads, all, oc] = await Promise.all([office ? Promise.resolve([]) : listThreads(null, show), listThreads(null, "all"), officeCounts().catch(() => ({ open: 0, unread: 0 }))]);
  const mine = office ? await officeThreads(show, sp.batch ?? null) : [];
  const open = all.filter((t) => t.status === "open"), cutoff = Date.now() - 2 * 864e5;
  const waiting = open.filter((t) => t.last_sender === "parent" && Date.parse(t.last_message_at) < cutoff);
  const batch = sp.batch ? mine[0] : undefined;
  const q = (o: Record<string, string | undefined>) => "/admin/messages?" + new URLSearchParams(Object.entries({ view: office ? "office" : undefined, show, batch: sp.batch, ...o }).filter(([, v]) => v) as [string, string][]).toString();
  return <>
    <div className="top"><div><h1>Messages</h1><div className="sub">Conversations between parents and teachers, which admins can read and reply to (safeguarding), and messages from the office.</div></div>
      <span className="grow" /><Link className="abtn pri" href="/admin/messages/write">New message</Link></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}
    <div className="tiles">
      <div className="tile"><span className="k">Open conversations</span><span className="v">{open.length}</span><span className="h">{all.length} between parents and teachers</span></div>
      <div className={`tile${waiting.length ? " alert" : ""}`}><span className="k">Waiting over 2 days</span><span className="v">{waiting.length}</span><span className="h">parent waiting for a teacher reply</span></div>
      <div className="tile"><span className="k">Passed to the office</span><span className="v">{all.filter((t) => t.office_copied).length}</span><span className="h">by teachers</span></div>
      <Link href="/admin/messages?view=office&show=replies" className={`tile${oc.unread ? " alert" : ""}`} style={{ textDecoration: "none", color: "inherit" }}><span className="k">Replies to the office</span><span className="v">{oc.unread}</span><span className="h">{oc.unread ? "not read yet" : `${oc.open} open from the office`}</span></Link>
    </div>
    <div className="msg-views" role="tablist" aria-label="Which messages">
      <Link role="tab" aria-selected={!office} className={`abtn sm${!office ? " pri" : ""}`} href="/admin/messages">Parents ↔ teachers</Link>
      <Link role="tab" aria-selected={office} className={`abtn sm${office ? " pri" : ""}`} href="/admin/messages?view=office">From the office{oc.unread ? <span className="dx-count" style={{ marginLeft: 6 }}>{oc.unread}</span> : null}</Link>
    </div>
    <nav className="tabs" style={{ margin: "10px 0 14px" }}>{(office ? ["open", "replies", "closed", "all"] as const : ["open", "closed", "all"] as const).map((s) =>
      <Link key={s} className={`abtn sm${s === show ? " pri" : ""}`} href={q({ show: s })}>{s === "replies" ? "With replies" : s[0].toUpperCase() + s.slice(1)}</Link>)}</nav>

    {office ? <>
      {sp.batch && <p className="note">{batch ? <>Showing the message “{batch.subject}” to <b>{batch.batch}</b> ({batch.batch_size}), one conversation each. </> : "Nothing here with this filter. "}<Link href={q({ batch: undefined })}>Show all</Link></p>}
      {mine.length === 0 ? <p className="empty">No messages from the office{show === "open" ? " open" : ""} yet. Use “New message” to write to a parent, student or teacher, or to a whole class or level.</p> :
        <div className="tw"><table><thead><tr><th>To</th><th>Subject</th><th>Last message</th><th></th></tr></thead>
          <tbody>{mine.map((t) => <tr key={t.id} className={t.unread ? "row-new" : undefined}>
            <td><b>{t.name}</b> <span className="pill mute">{WHO[t.to_kind]}</span>{t.about && <div className="muted" style={{ fontSize: 14 }}>about {t.about}</div>}</td>
            <td><b>{t.subject}</b>{t.status === "closed" && <> <span className="pill mute">Closed</span></>}
              {t.batch && !sp.batch && <div className="muted" style={{ fontSize: 14 }}>to <Link href={`/admin/messages?view=office&show=all&batch=${t.batch_id}`}>{t.batch}</Link> ({t.batch_size})</div>}</td>
            <td>{when(t.last_message_at)}{t.unread > 0 && <> <span className="pill info">New reply</span></>}
              <div className="muted" style={{ fontSize: 14 }}>{t.last_sender === "office" ? "You" : WHO[t.last_sender]} · {t.messages} message{t.messages === 1 ? "" : "s"}</div></td>
            <td><Link className="abtn sm" href={`/admin/messages/office/${t.id}`}>Open</Link></td></tr>)}</tbody></table></div>}
    </> : threads.length === 0 ? <p className="empty">No conversations yet. Teachers can write to a family from their dashboard; families will write from their account once the parent area is live.</p> :
      <div className="tw"><table><thead><tr><th>Subject</th><th>Family</th><th>Teacher</th><th>Last message</th><th></th></tr></thead>
        <tbody>{threads.map((t) => <tr key={t.id}><td><b>{t.subject}</b>{t.status === "closed" && <> <span className="pill mute">Closed</span></>}{t.office_copied && <> <span className="pill info">Passed to office</span></>}</td>
          <td>{t.parent}<div className="muted" style={{ fontSize: 14 }}>about {t.student}</div></td><td>{t.teacher}</td>
          <td>{when(t.last_message_at)}{t.status === "open" && t.last_sender === "parent" && Date.parse(t.last_message_at) < cutoff && <> <span className="pill bad">Waiting</span></>}<div className="muted" style={{ fontSize: 14 }}>{t.last_sender ? WHO[t.last_sender] : ""} · {t.messages} message{t.messages === 1 ? "" : "s"}</div></td>
          <td><Link className="abtn sm" href={`/admin/messages/${t.id}`}>Open</Link></td></tr>)}</tbody></table></div>}
  </>;
}
