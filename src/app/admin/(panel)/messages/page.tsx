import Link from "next/link";
import { listThreads } from "@/lib/community";

const when = (s: string) => new Date(s).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const WHO: Record<string, string> = { parent: "Parent", teacher: "Teacher", office: "Office" };

export default async function Messages({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const sp = await searchParams;
  const show = sp.show === "closed" || sp.show === "all" ? sp.show : "open";
  const threads = await listThreads(null, show);
  return <>
    <div className="top"><div><h1>Messages</h1><div className="sub">Conversations between families and teachers. Admins can read and reply to all of them (safeguarding).</div></div></div>
    <nav className="tabs" style={{ marginBottom: 14 }}>{(["open", "closed", "all"] as const).map((s) => <Link key={s} className={`abtn sm${s === show ? " pri" : ""}`} href={`/admin/messages?show=${s}`}>{s[0].toUpperCase() + s.slice(1)}</Link>)}</nav>
    {threads.length === 0 ? <p className="empty">No conversations yet. Teachers can write to a family from their dashboard; families will write from their account once the parent area is live.</p> :
      <div className="tw"><table><thead><tr><th>Subject</th><th>Family</th><th>Teacher</th><th>Last message</th><th></th></tr></thead>
        <tbody>{threads.map((t) => <tr key={t.id}><td><b>{t.subject}</b>{t.status === "closed" && <> <span className="pill mute">Closed</span></>}{t.office_copied && <> <span className="pill info">Passed to office</span></>}</td>
          <td>{t.parent}<div className="muted" style={{ fontSize: 14 }}>about {t.student}</div></td><td>{t.teacher}</td>
          <td>{when(t.last_message_at)}<div className="muted" style={{ fontSize: 14 }}>{t.last_sender ? WHO[t.last_sender] : ""} · {t.messages} message{t.messages === 1 ? "" : "s"}</div></td>
          <td><Link className="abtn sm" href={`/admin/messages/${t.id}`}>Open</Link></td></tr>)}</tbody></table></div>}
  </>;
}
