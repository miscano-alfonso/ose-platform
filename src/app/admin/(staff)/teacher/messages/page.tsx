import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { listThreads } from "@/lib/community";

export const dynamic = "force-dynamic";
const when = (s: string) => new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });

export default async function TeacherMessages({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const [sp, me] = await Promise.all([searchParams, requireViewer()]);
  const show = sp.show === "closed" || sp.show === "all" ? sp.show : "open";
  const threads = await listThreads(me.id, show);
  return <>
    <div className="top"><div><h1>Messages</h1><div className="sub">Message the parents of the students you teach. The office can read these conversations.</div></div>
      <span className="grow" /><Link className="abtn pri" href="/admin/messages/new">New message</Link></div>
    <div role="group" aria-label="Show" style={{ display: "flex", gap: 6, marginBottom: 12 }}>{[["open", "Open"], ["closed", "Closed"], ["all", "All"]].map(([k, l]) =>
      <Link key={k} className={`abtn sm${show === k ? " pri" : ""}`} href={`/admin/teacher/messages?show=${k}`} aria-current={show === k ? "page" : undefined}>{l}</Link>)}</div>
    <section className="card">{threads.length === 0 ? <p className="empty">No conversations{show === "open" ? " open" : ""}.</p> : threads.map((t) => <div className="li" key={t.id}>
      <div className="t"><b>{t.subject}</b><span>{t.parent} · about {t.student} · {when(t.last_message_at)} · {t.messages} message{t.messages === 1 ? "" : "s"}</span></div>
      {t.last_sender === "parent" && t.status === "open" && <span className="pill warn">Waiting for your reply</span>}
      <Link className={`abtn sm${t.last_sender === "parent" ? " pri" : ""}`} href={`/admin/messages/${t.id}`}>Open</Link></div>)}</section>
  </>;
}
