import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { teacherEmails, teacherContacts } from "@/lib/teacher-area";
import { teacherEmailAction } from "./actions";

export const dynamic = "force-dynamic";
const when = (s: string) => new Date(s).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

// A teacher's Email: for writing to the school (the office). Parents and teachers talk through Messages instead.
export default async function TeacherEmail({ searchParams }: { searchParams: Promise<{ new?: string; re?: string; ok?: string; err?: string; to?: string }> }) {
  const [sp, me] = await Promise.all([searchParams, requireViewer()]);
  const [mails, contacts] = await Promise.all([teacherEmails(me.id), teacherContacts().catch(() => [])]);
  const labelOf = (name: string | null) => { const c = contacts.find((x) => x.name === name); return name ? `${name}${c ? ` (${c.label})` : ""}` : "the office"; };
  const re = sp.re ? mails.find((m) => m.id === sp.re) : undefined;
  const compose = !!sp.new || !!re;
  // one card per conversation, newest first; inside, oldest first
  const threads = [...mails.reduce((m, e) => m.set(e.thread_id, [...(m.get(e.thread_id) ?? []), e]), new Map<string, typeof mails>()).values()].map((t) => [...t].reverse());
  return <>
    <div className="top"><div><h1>Email</h1><div className="sub">Email the school: the office, or someone in particular. Replies come to {me.email} and show here too. To talk with a parent, use <Link href="/admin/teacher/messages">Messages</Link>.</div></div>
      <span className="grow" />{!compose && <Link className="abtn pri" href="/admin/teacher/email?new=1">Email the school</Link>}</div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    {compose && <section className="card"><h2>{re ? "Reply to the school" : "New email to the school"}</h2>
      <form action={teacherEmailAction} style={{ display: "grid", gap: 10, maxWidth: 720 }}>
        {re && <input type="hidden" name="thread" value={re.thread_id} />}
        {!re && <label className="fld">To<select name="to" defaultValue={sp.to ?? ""} style={{ padding: "8px 12px", borderRadius: 10, border: "1.5px solid var(--line)", background: "var(--panel)", color: "var(--ink)", font: "inherit" }}>
          <option value="">The office (school inbox)</option>
          {contacts.map((c) => <option key={c.user_id} value={c.user_id}>{c.name}: {c.label}</option>)}</select></label>}
        {re && <p className="muted" style={{ margin: 0 }}>To {labelOf(re.to_name)}</p>}
        <label className="fld">Subject<input name="subject" required maxLength={200} defaultValue={re ? (/^re:/i.test(re.subject) ? re.subject : `Re: ${re.subject}`) : ""} /></label>
        <label className="fld">Message<textarea name="body" required rows={8} maxLength={20000} /></label>
        <div style={{ display: "flex", gap: 8 }}><button className="abtn pri" type="submit" disabled={!!me.viewing}>Send to the school</button><Link className="abtn" href="/admin/teacher/email">Cancel</Link></div>
        {me.viewing && <p className="note">You’re viewing as {me.name}: you can read their email but not send as them.</p>}
      </form></section>}
    {threads.length === 0 ? <p className="empty">No emails with the school yet.</p> : threads.map((t) => <section className="card" key={t[0].thread_id}>
      <h2 style={{ marginBottom: 2 }}>{t[t.length - 1].subject || "(no subject)"}</h2><p className="muted" style={{ margin: "0 0 8px", fontSize: 14 }}>To {labelOf(t[0].to_name)}</p>
      {t.map((e) => <div key={e.id} id={`e-${e.id}`} style={{ display: "grid", gap: 8, marginBottom: 12 }}>
        <div className="card" style={{ margin: 0, padding: "10px 14px" }}><div className="muted" style={{ fontSize: 14 }}><b>You</b> · {when(e.at)}{e.local ? "" : " · from your email"}</div>
          <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{e.body}</div></div>
        {e.replied_at && <div className="card" style={{ margin: 0, padding: "10px 14px", borderLeft: "3px solid var(--good)" }}><div className="muted" style={{ fontSize: 14 }}><b>{e.to_name ?? "The school"}</b>{e.reply_from ? ` (${e.reply_from})` : ""} · {when(e.replied_at)}</div>
          <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{e.reply_body}</div></div>}
      </div>)}
      <Link className="abtn sm" href={`/admin/teacher/email?re=${t[t.length - 1].id}`}>Reply</Link>
    </section>)}
  </>;
}
