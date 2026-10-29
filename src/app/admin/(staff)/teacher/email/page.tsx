import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { teacherEmails, teacherContacts, officeInfo } from "@/lib/teacher-area";
import { teacherEmailAction } from "./actions";

export const dynamic = "force-dynamic";
const when = (s: string) => new Date(s).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

// A teacher's Email: for writing to the people the school lists (e.g. the principal, IT support). Parents and teachers talk through Messages instead.
export default async function TeacherEmail({ searchParams }: { searchParams: Promise<{ new?: string; re?: string; ok?: string; err?: string; to?: string }> }) {
  const [sp, me] = await Promise.all([searchParams, requireViewer()]);
  const [mails, contacts, office] = await Promise.all([teacherEmails(me.id), teacherContacts().catch(() => []), officeInfo().catch(() => ({ label: "the office", mailbox: null }))]);
  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
  const labelOf = (name: string | null) => { const c = contacts.find((x) => x.name === name); return name ? `${name}${c ? ` (${c.label})` : ""}` : office.label; };
  const kb = (n: number) => n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`;
  const re = sp.re ? mails.find((m) => m.id === sp.re) : undefined;
  const compose = !!sp.new || !!re;
  // one card per conversation, newest first; inside, oldest first
  const threads = [...mails.reduce((m, e) => m.set(e.thread_id, [...(m.get(e.thread_id) ?? []), e]), new Map<string, typeof mails>()).values()].map((t) => [...t].reverse());
  return <>
    <div className="top"><div><h1>Email</h1><div className="sub">Email {contacts.length ? contacts.map((c) => c.name.split(" ")[0]).join(" or ") : "the school"}. Attach files (up to 3.5 MB) or add Google Drive links. Replies come to {me.email} and show here too. To talk with a parent, use <Link href="/admin/teacher/messages">Messages</Link>.</div></div>
      <span className="grow" />{!compose && <Link className="abtn pri" href="/admin/teacher/email?new=1">Email the school</Link>}</div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    {compose && <section className="card"><h2>{re ? "Reply" : "New email"}</h2>
      <form action={teacherEmailAction} encType="multipart/form-data" style={{ display: "grid", gap: 10, maxWidth: 720 }}>
        {re && <input type="hidden" name="thread" value={re.thread_id} />}
        {!re && <label className="fld">To<select name="to" required defaultValue={sp.to ?? contacts[0]?.user_id ?? ""} style={{ padding: "8px 12px", borderRadius: 10, border: "1.5px solid var(--line)", background: "var(--panel)", color: "var(--ink)", font: "inherit" }}>
          {contacts.length === 0 && <option value="">No one set up yet: ask the office</option>}{contacts.map((c) => <option key={c.user_id} value={c.user_id}>{c.name}: {c.label}</option>)}</select></label>}
        {re && <p className="muted" style={{ margin: 0 }}>To {labelOf(re.to_name)}</p>}
        <label className="fld">Subject<input name="subject" required maxLength={200} defaultValue={re ? (/^re:/i.test(re.subject) ? re.subject : `Re: ${re.subject}`) : ""} /></label>
        <label className="fld">Message<textarea name="body" required rows={8} maxLength={20000} /></label>
        <label className="fld">Attachments <span className="muted" style={{ fontWeight: 400 }}>(optional, up to 5 files, 3.5 MB in total)</span><input type="file" name="files" multiple /></label>
        <label className="fld">Google Drive links <span className="muted" style={{ fontWeight: 400 }}>(optional, one per line)</span><textarea name="links" rows={2} placeholder="https://drive.google.com/…" /></label>
        <div style={{ display: "flex", gap: 8 }}><button className="abtn pri" type="submit" disabled={!!me.viewing}>Send</button><Link className="abtn" href="/admin/teacher/email">Cancel</Link></div>
        {me.viewing && <p className="note">You’re viewing as {me.name}: you can read their email but not send as them.</p>}
      </form></section>}
    {threads.length === 0 ? <p className="empty">No emails with the school yet.</p> : threads.map((t) => <section className="card" key={t[0].thread_id}>
      <h2 style={{ marginBottom: 2 }}>{t[t.length - 1].subject || "(no subject)"}</h2><p className="muted" style={{ margin: "0 0 8px", fontSize: 14 }}>To {labelOf(t[0].to_name)}</p>
      {t.map((e) => <div key={e.id} id={`e-${e.id}`} style={{ display: "grid", gap: 8, marginBottom: 12 }}>
        <div className="card" style={{ margin: 0, padding: "10px 14px" }}><div className="muted" style={{ fontSize: 14 }}><b>You</b> · {when(e.at)}{e.local ? "" : " · from your email"}</div>
          <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{e.body}</div>
          {(e.files.length > 0 || (e.links?.length ?? 0) > 0) && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {e.files.map((f) => <a key={f.id} className="abtn sm" href={`/admin/email-file/${f.id}`}>{f.name} · {kb(f.size)}</a>)}
            {(e.links ?? []).map((l) => <a key={l} className="abtn sm" href={l} target="_blank" rel="noopener">{/drive\.google|docs\.google/.test(l) ? "Google Drive link" : l.replace(/^https:\/\//, "").slice(0, 40)}</a>)}</div>}</div>
        {e.replied_at && <div className="card" style={{ margin: 0, padding: "10px 14px", borderLeft: "3px solid var(--good)" }}><div className="muted" style={{ fontSize: 14 }}><b>{e.to_name ?? cap(office.label)}</b>{e.reply_from ? ` (${e.reply_from})` : ""} · {when(e.replied_at)}</div>
          <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{e.reply_body}</div></div>}
      </div>)}
      <Link className="abtn sm" href={`/admin/teacher/email?re=${t[t.length - 1].id}`}>Reply</Link>
    </section>)}
  </>;
}
