import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { listThreads } from "@/lib/community";
import { teacherEmails, teacherContacts, officeInfo } from "@/lib/teacher-area";
import { teacherEmailAction } from "../email/actions";

export const dynamic = "force-dynamic";
const day = (s: string) => new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
const when = (s: string) => new Date(s).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const kb = (n: number) => n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`;

// Messages (31 Oct): one place for a teacher's conversations, with the school (the people it lists, e.g. the principal
// and IT support; this was the separate "Email" page) and with the families of the students they teach.
// ?to=<contact> writes to someone at the school, ?school=<thread> opens a conversation with the school.
export default async function TeacherMessages({ searchParams }: { searchParams: Promise<{ show?: string; to?: string; school?: string; ok?: string; err?: string }> }) {
  const [sp, me] = await Promise.all([searchParams, requireViewer()]);
  const show = sp.show === "closed" || sp.show === "all" ? sp.show : "open";
  const [threads, mails, contacts, office] = await Promise.all([listThreads(me.id, show), teacherEmails(me.id), teacherContacts().catch(() => []),
    officeInfo().catch(() => ({ label: "the office", mailbox: null }))]);
  const labelOf = (name: string | null) => { const c = contacts.find((x) => x.name === name); return name ? `${name}${c ? ` · ${c.label}` : ""}` : office.label; };
  // conversations with the school: one per thread, newest first; inside, oldest first
  const school = [...mails.reduce((m, e) => m.set(e.thread_id, [...(m.get(e.thread_id) ?? []), e]), new Map<string, typeof mails>()).values()].map((t) => [...t].reverse());
  const open = sp.school ? school.find((t) => t[0].thread_id === sp.school) : undefined;
  const to = contacts.find((c) => c.user_id === sp.to);
  const off = me.viewing ? <p className="note">You’re viewing as {me.name}: you can read their messages but not send as them.</p> : null;

  // one conversation with the school
  if (open) { const last = open[open.length - 1]; return <>
    <p className="backlink"><Link className="abtn sm" href="/admin/teacher/messages">← Messages</Link></p>
    <div className="top"><div><h1>{last.subject || "(no subject)"}</h1><div className="sub">With {labelOf(open[0].to_name)}</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    <div className="tm-msgs">{open.map((e) => <div key={e.id} id={`e-${e.id}`} className="tm-pair">
      <div className="card bubble b-teacher"><div className="muted tm-who"><b>You</b> · {when(e.at)}{e.local ? "" : " · from your email"}</div>
        <div className="tm-body">{e.body}</div>
        {(e.files.length > 0 || (e.links?.length ?? 0) > 0) && <div className="tm-att">
          {e.files.map((f) => <a key={f.id} className="abtn sm" href={`/admin/email-file/${f.id}`}>{f.name} · {kb(f.size)}</a>)}
          {(e.links ?? []).map((l) => <a key={l} className="abtn sm" href={l} target="_blank" rel="noopener">{/drive\.google|docs\.google/.test(l) ? "Google Drive link" : l.replace(/^https:\/\//, "").slice(0, 40)}</a>)}</div>}</div>
      {e.replied_at && <div className="card bubble b-office"><div className="muted tm-who"><b>{e.to_name ?? office.label}</b>{e.reply_from ? ` (${e.reply_from})` : ""} · {when(e.replied_at)}</div>
        <div className="tm-body">{e.reply_body}</div></div>}
    </div>)}</div>
    <form action={teacherEmailAction} encType="multipart/form-data" className="card tm-form"><input type="hidden" name="thread" value={last.thread_id} />
      <input type="hidden" name="subject" value={/^re:/i.test(last.subject) ? last.subject : `Re: ${last.subject}`} />
      <label className="fld">Reply<textarea name="body" required rows={5} maxLength={20000} /></label>
      <details><summary>Attach files or Google Drive links</summary><div className="tm-extra">
        <label className="fld">Files <span className="muted">(up to 5, 3.5 MB in total)</span><input type="file" name="files" multiple /></label>
        <label className="fld">Google Drive links <span className="muted">(one per line)</span><textarea name="links" rows={2} placeholder="https://drive.google.com/…" /></label></div></details>
      <div><button className="abtn pri" type="submit" disabled={!!me.viewing}>Send</button></div>{off}
    </form>
  </>; }

  return <>
    <div className="top"><div><h1>Messages</h1><div className="sub">Talk to the school, and to the parents of the students you teach. The office can read conversations with families.</div></div>
      <span className="grow" /><Link className="abtn pri" href="/admin/messages/new">Message a family</Link></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}

    <section className="card"><h2>The school</h2>
      <div className="tm-contacts">{contacts.length === 0 ? <p className="muted" style={{ margin: 0 }}>No one is set up yet. Ask the office to choose who teachers can message.</p>
        : contacts.map((c) => <Link key={c.user_id} href={`/admin/teacher/messages?to=${c.user_id}#write`} className={`tm-contact${to?.user_id === c.user_id ? " on" : ""}`}>
          <span className="tm-av" aria-hidden="true">{c.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span><span><b>{c.name}</b><span className="muted">{c.label}</span></span></Link>)}</div>
      {to && <form id="write" action={teacherEmailAction} encType="multipart/form-data" className="tm-form"><input type="hidden" name="to" value={to.user_id} />
        <p className="ct-k">New message to {to.name} · {to.label}</p>
        <label className="fld">Subject<input name="subject" required maxLength={200} /></label>
        <label className="fld">Message<textarea name="body" required rows={6} maxLength={20000} /></label>
        <details><summary>Attach files or Google Drive links</summary><div className="tm-extra">
          <label className="fld">Files <span className="muted">(up to 5, 3.5 MB in total)</span><input type="file" name="files" multiple /></label>
          <label className="fld">Google Drive links <span className="muted">(one per line)</span><textarea name="links" rows={2} placeholder="https://drive.google.com/…" /></label></div></details>
        <div style={{ display: "flex", gap: 8 }}><button className="abtn pri" type="submit" disabled={!!me.viewing}>Send</button><Link className="abtn" href="/admin/teacher/messages">Cancel</Link></div>{off}
        <p className="note" style={{ margin: 0 }}>They also get it by email. Their reply shows here and comes to {me.email}.</p>
      </form>}
      {school.length > 0 && <div className="tm-list">{school.map((t) => { const last = t[t.length - 1]; const replied = !!last.replied_at;
        return <Link key={last.thread_id} className="li tm-row" href={`/admin/teacher/messages?school=${encodeURIComponent(last.thread_id)}`}>
          <div className="t"><b>{last.subject || "(no subject)"}</b><span>With {labelOf(t[0].to_name)} · {day(last.replied_at ?? last.at)} · {t.length + t.filter((e) => e.replied_at).length} message{t.length + t.filter((e) => e.replied_at).length === 1 ? "" : "s"}</span></div>
          {replied ? <span className="pill good">Replied</span> : <span className="pill mute">Sent</span>}<span className="abtn sm">Open</span></Link>; })}</div>}
    </section>

    <section className="card"><div className="tm-head"><h2>Families</h2>
      <div className="segl" role="group" aria-label="Show">{[["open", "Open"], ["closed", "Closed"], ["all", "All"]].map(([k, l]) =>
        <Link key={k} scroll={false} href={`/admin/teacher/messages?show=${k}`} aria-current={show === k ? "true" : undefined}>{l}</Link>)}</div></div>
      {threads.length === 0 ? <p className="empty">No conversations{show === "open" ? " open" : ""}.</p> : threads.map((t) => <div className="li" key={t.id}>
        <div className="t"><b>{t.subject}</b><span>{t.parent} · about {t.student} · {day(t.last_message_at)} · {t.messages} message{t.messages === 1 ? "" : "s"}</span></div>
        {t.last_sender === "parent" && t.status === "open" && <span className="pill warn">Waiting for your reply</span>}
        <Link className={`abtn sm${t.last_sender === "parent" ? " pri" : ""}`} href={`/admin/messages/${t.id}`}>Open</Link></div>)}</section>
  </>;
}
