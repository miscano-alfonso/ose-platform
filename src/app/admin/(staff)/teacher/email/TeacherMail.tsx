import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { teacherContacts, officeInfo } from "@/lib/teacher-area";
import { teacherMail, fillMailBodies, mailUnread, seenMap, markSchoolSeen } from "@/lib/teacher-inbox";
import { teacherEmailAction, markAllMailReadAction } from "./actions";
import { markUnreadAction } from "../messages/actions";
import { NavCountSync } from "../../../NavCountSync";
import { GuideSlides } from "../../../GuideSlides";
import { TEACHER_GUIDES } from "../../../guides";

// 27 Nov (Alfonso: "why are the teacher email feature not working like the admin's one?"). The teacher's Email now works
// like Admin → Email → Inbox: New / All (with Newest first / Unread first), the list on the left with unread emails in bold
// with a blue bar, and the open conversation on the right as emails (newest first, "X wrote · date"), with Reply and
// Mark unread. It shows both sides: the teacher's emails and everything the school sent them, whether from the admin or
// from Gmail itself (db/129). Earlier emails quoted under each one are left off, as in a mail app.
export type MailParams = { show?: string; sort?: string; school?: string; to?: string; new?: string; reply?: string; ok?: string; err?: string };
const LDN = "Europe/London";
const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: LDN });
/** As in the admin's inbox: the time today, "Yesterday", the weekday this week, else the date. */
function shortWhen(s: string) {
  const d = new Date(s), now = new Date(), days = Math.round((Date.parse(dayKey(now)) - Date.parse(dayKey(d))) / 864e5);
  if (days <= 0) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: LDN });
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString("en-GB", { weekday: "short", timeZone: LDN });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}), timeZone: LDN });
}
const fullWhen = (s: string) => new Date(s).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: LDN }).replace(" at ", ", ");
const kb = (n: number) => n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`;
const BASE = "/admin/teacher/email";

export async function TeacherMail({ searchParams }: { searchParams: Promise<MailParams> }) {
  const [sp, me] = await Promise.all([searchParams, requireViewer()]);
  const [contacts, office] = await Promise.all([teacherContacts().catch(() => []), officeInfo().catch(() => ({ label: "the office", mailbox: null }))]);
  const read = !me.viewing;   // an admin "Viewing as" doesn't mark anything read
  if (sp.school && read) await markSchoolSeen(me.id, sp.school);
  const [threads, seen] = await Promise.all([teacherMail(me.id, office.label), seenMap(me.id)]);
  const unreadOf = (id: string) => { const t = threads.find((x) => x.id === id); return !!t && mailUnread(t, seen); };
  const unread = threads.filter((t) => unreadOf(t.id)).length;
  const show = sp.show === "all" ? "all" : sp.show === "new" ? "new" : unread || sp.school ? "new" : "all";   // nothing new: open on All
  const unreadFirst = show === "all" && sp.sort === "unread";
  // "New" keeps the open conversation, so it doesn't vanish once opened (and so read)
  const rows = show === "all" ? (unreadFirst ? [...threads.filter((t) => unreadOf(t.id)), ...threads.filter((t) => !unreadOf(t.id))] : threads)
    : threads.filter((t) => unreadOf(t.id) || t.id === sp.school);
  const qs = `show=${show}${unreadFirst ? "&sort=unread" : ""}`;
  const sel = sp.school ? threads.find((t) => t.id === sp.school) ?? null : null;
  if (sel) await fillMailBodies(sel);
  const to = sp.to === "all" && contacts.length > 1 ? { user_id: "all", name: contacts.map((c) => c.name.split(" ")[0]).join(" & "), label: "everyone" } : contacts.find((c) => c.user_id === sp.to);
  const writing = !sel && (!!to || sp.new === "1");
  const viewingNote = me.viewing ? <p className="note" style={{ margin: 0 }}>You’re viewing as {me.name}: you can read their email but not send as them.</p> : null;

  let pane: React.ReactNode = null;
  if (sel) {
    const last = sel.msgs[0], other = sel.msgs.find((m) => !m.mine);
    const subject = sel.subject || "(no subject)";
    pane = <div className="ibp" aria-label={`Email: ${subject}`}>
      <div className="ibp-head">
        <div className="ibp-who"><b>{sel.who}</b><span className="muted">{other?.email ?? "The school"}</span></div>
        <span className="ibp-when">{!me.viewing && <Link className="abtn sm pri" href={`${BASE}?${qs}&school=${encodeURIComponent(sel.id)}&reply=1#reply`}>Reply</Link>}{fullWhen(last.at)}</span>
      </div>
      <h3 className="ibp-subj">{subject} <span className="pill info" style={{ fontSize: 12, verticalAlign: 2 }}>School</span></h3>
      <div className="ibp-acts"><Link className="abtn sm ibp-back" href={`${BASE}?${qs}`}>← All emails</Link>
        {sel.officeAt && !me.viewing && <form action={markUnreadAction}><input type="hidden" name="kind" value="school" /><input type="hidden" name="id" value={sel.id} />
          <input type="hidden" name="mode" value="email" /><input type="hidden" name="f" value={show} /><button className="abtn sm" type="submit">Mark unread</button></form>}</div>
      {!me.viewing ? <form id="reply" action={teacherEmailAction} encType="multipart/form-data" className="ibp-reply tm-reply">
        <input type="hidden" name="thread" value={sel.id} /><input type="hidden" name="subject" value={/^re:/i.test(subject) ? subject : `Re: ${subject}`} />
        <details open={sp.reply === "1"}><summary className="abtn sm">Write a reply</summary>
          <label className="fld">Reply to {sel.who}<textarea name="body" required rows={6} maxLength={20000} className="mini" style={{ width: "100%" }} /></label>
          <details><summary>Attach files or Google Drive links</summary><div className="tm-extra">
            <label className="fld">Files <span className="muted">(up to 5, 3.5 MB in total)</span><input type="file" name="files" multiple /></label>
            <label className="fld">Google Drive links <span className="muted">(one per line)</span><textarea name="links" rows={2} placeholder="https://drive.google.com/…" /></label></div></details>
          <div><button className="abtn pri" type="submit">Send reply</button></div>
          <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>It goes to the school’s inbox, and their reply shows here and comes to {me.email}.</p>
        </details></form> : viewingNote}
      {sel.msgs.map((m, i) => <div key={m.key} className="tml-msg">
        <p className={`ibp-orig${i === 0 ? " first" : ""}`}><b>{m.who}</b>{m.mine ? "" : " wrote"} · {fullWhen(m.at)}</p>
        <div className={`irp-mail${m.mine ? " mine" : ""}`}>{m.body || (m.partial ? "Couldn’t load this email just now. Try again in a moment." : "(This email has no text.)")}</div>
        {(m.files.length > 0 || m.links.length > 0) && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          {m.files.map((x) => <a key={x.id} className="abtn sm" href={`/admin/email-file/${x.id}`}>{x.name} · {kb(x.size)}</a>)}
          {m.links.map((l) => <a key={l} className="abtn sm" href={l} target="_blank" rel="noopener">{/drive\.google|docs\.google/.test(l) ? "Google Drive link" : l.replace(/^https:\/\//, "").slice(0, 40)}</a>)}</div>}
      </div>)}
    </div>;
  } else if (writing) {
    pane = <div className="ibp">
      <h3 className="ibp-subj">New email</h3>
      <div className="ibp-acts"><Link className="abtn sm ibp-back" href={`${BASE}?${qs}`}>← All emails</Link></div>
      <p className="ct-k" style={{ margin: 0 }}>To the school</p>
      <div className="tm-contacts">{contacts.length === 0 ? <p className="muted" style={{ margin: 0 }}>No one is set up yet. Ask the office to choose who teachers can email.</p>
        : contacts.map((c) => <Link key={c.user_id} href={`${BASE}?to=${c.user_id}#write`} className={`tm-contact${to?.user_id === c.user_id ? " on" : ""}`}>
          <span className="tm-av" aria-hidden="true">{c.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span><span><b>{c.name}</b><span className="muted">{c.label}</span></span></Link>)}
        {contacts.length > 1 && <Link href={`${BASE}?to=all#write`} className={`tm-contact${to?.user_id === "all" ? " on" : ""}`}>
          <span className="tm-av" aria-hidden="true">+</span><span><b>Everyone</b><span className="muted">{contacts.map((c) => c.name.split(" ")[0]).join(" & ")}</span></span></Link>}</div>
      {to && <form id="write" action={teacherEmailAction} encType="multipart/form-data" className="tm-form"><input type="hidden" name="to" value={to.user_id} />
        <p className="ct-k">{to.user_id === "all" ? `To ${to.name}, together` : `To ${to.name} · ${to.label}`}</p>
        <label className="fld">Subject<input name="subject" required maxLength={200} /></label>
        <label className="fld">Message<textarea name="body" required rows={8} maxLength={20000} /></label>
        <details><summary>Attach files or Google Drive links</summary><div className="tm-extra">
          <label className="fld">Files <span className="muted">(up to 5, 3.5 MB in total)</span><input type="file" name="files" multiple /></label>
          <label className="fld">Google Drive links <span className="muted">(one per line)</span><textarea name="links" rows={2} placeholder="https://drive.google.com/…" /></label></div></details>
        <div style={{ display: "flex", gap: 8 }}><button className="abtn pri" type="submit" disabled={!!me.viewing}>Send</button><Link className="abtn" href={BASE}>Cancel</Link></div>
        <p className="note" style={{ margin: 0 }}>{to.user_id === "all" ? "Each of them also gets it by email." : "They also get it by email."} Their reply shows here and comes to {me.email}.</p>
      </form>}
      {viewingNote}
    </div>;
  } else if (rows.length) {
    pane = <div className="ibp tml-empty"><b>Choose an email</b><span className="muted">Pick one on the left to read it and reply.</span></div>;
  }

  return <>
    <div className="top"><div><h1>Email</h1><div className="sub">Your emails with the school. They also come to {me.email}, and your replies go to the school’s inbox.</div></div>
      <span className="grow" /><GuideSlides slides={TEACHER_GUIDES.messages.slides} title={TEACHER_GUIDES.messages.title} /><Link className="abtn pri" href={`${BASE}?new=1`}>New email</Link></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    {!me.viewing && <NavCountSync href={BASE} count={unread} />}
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
      <div className="segl" role="group" aria-label="Show"><Link href={`${BASE}?show=new`} aria-current={show === "new" ? "true" : undefined}>New{unread ? ` (${unread})` : ""}</Link><Link href={`${BASE}?show=all`} aria-current={show === "all" ? "true" : undefined}>All</Link></div>
      {show === "all" && <div className="segl" role="group" aria-label="Order"><Link href={`${BASE}?show=all`} aria-current={!unreadFirst ? "true" : undefined}>Newest first</Link><Link href={`${BASE}?show=all&sort=unread`} aria-current={unreadFirst ? "true" : undefined}>Unread first</Link></div>}
      <span className="grow" />
      {unread > 1 && !me.viewing && <form action={markAllMailReadAction}><input type="hidden" name="show" value={show} /><button className="abtn sm" type="submit">Mark all read</button></form>}
    </div>
    {rows.length === 0 && !pane ? <section className="card"><p className="empty">{show === "new" ? <>Nothing new from the school. <Link href={`${BASE}?show=all`}>See all your emails</Link>.</> : <>No emails with the school yet. <Link href={`${BASE}?new=1`}>Write one</Link>.</>}</p></section>
      : <div className={`ibx${sel || writing ? " picked" : ""}`}>
        <nav className="ibx-list" aria-label="Emails">{rows.length === 0 ? <p className="empty" style={{ padding: 16 }}>Nothing new.</p> : rows.map((t) => { const u = unreadOf(t.id);
          return <div key={t.id} className={`ibx-row${u ? " unread" : ""}`} aria-current={t.id === sel?.id ? "true" : undefined}>
            <Link className="ibx-hit" href={`${BASE}?${qs}&school=${encodeURIComponent(t.id)}`} aria-label={`${u ? "Unread: " : ""}${t.who}: ${t.subject || "(no subject)"}`} />
            <span className="ibx-top"><b>{t.who}</b><time dateTime={t.at}>{shortWhen(t.at)}</time></span>
            <span className="ibx-subj">{t.subject || "(no subject)"}</span>
            <span className="ibx-snip">{t.preview}</span>
            <span className="ibx-tags"><span className="pill info">School</span>{t.msgs.length > 1 && <span className="muted">{t.msgs.length} emails</span>}</span>
          </div>; })}</nav>
        {pane}
      </div>}
  </>;
}
