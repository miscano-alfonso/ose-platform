import Link from "next/link";
import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { teacherContacts, officeInfo, familyMsgsOn, FAMILY_MSGS_OFF } from "@/lib/teacher-area";
import { teacherEmailAction } from "../email/actions";
import { teacherOfficeReplyAction, replyThreadAction } from "../../../actions";
import { myOfficeThread } from "@/lib/office-messages";
import { teacherInbox, markSchoolSeen, familyThread, type InboxItem } from "@/lib/teacher-inbox";
import { markUnreadAction } from "./actions";
import { NavCountSync } from "../../../NavCountSync";
import { LiveMessages } from "../../../LiveMessages";
import { messagesStamp } from "@/lib/live-stamp";
import { GuideSlides } from "../../../GuideSlides";
import { TEACHER_GUIDES } from "../../../guides";

const when = (s: string) => new Date(s).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const kb = (n: number) => n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`;
/** "10:42" today, "Yest." yesterday, otherwise "24 Nov" (London time). */
function stamp(iso: string) {
  const d = new Date(iso), f = (x: Date) => x.toLocaleDateString("en-GB", { timeZone: "Europe/London" }), now = new Date();
  if (f(d) === f(now)) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  if (f(d) === f(new Date(now.getTime() - 864e5))) return "Yest.";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
}
// 27 Nov (Alfonso: "separate the emails and messages ... like the admin one"): Email (the teacher's emails with the school)
// and Messages (in the app: from the office and with families) are two pages built from this one view.
export type InboxMode = "email" | "messages";
const BASE = { email: "/admin/teacher/email", messages: "/admin/teacher/messages" } as const;
const TABS_OF = { email: [["all", "All"], ["unread", "Unread"]], messages: [["all", "All"], ["unread", "Unread"], ["school", "Office"], ["families", "Families"]] } as const;
const href = (it: InboxItem, f: string) => `${it.kind === "school" ? BASE.email : BASE.messages}?${it.kind === "office" ? "office" : it.kind === "school" ? "school" : "family"}=${encodeURIComponent(it.id)}${f !== "all" ? `&f=${f}` : ""}`;

// Messages (31 Oct; 26 Nov as one inbox, Option B): every conversation in one list on the left (messages from the office, the
// teacher's emails to the school, conversations with families), unread in bold with a yellow count; the open conversation
// on the right as bubbles with the reply box underneath. ?office= / ?school= / ?family= opens one; ?to= or ?new=1 writes a new one.
export type InboxParams = { f?: string; to?: string; school?: string; office?: string; family?: string; new?: string; ok?: string; err?: string };
export async function TeacherInbox({ mode, searchParams }: { mode: InboxMode; searchParams: Promise<InboxParams> }) {
  const [sp, me] = await Promise.all([searchParams, requireViewer()]);
  // a link to the other kind of conversation (e.g. an old notification) goes to the right page
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]).toString();
  if (mode === "messages" && (sp.school || sp.to)) redirect(`${BASE.email}?${qs}`);
  if (mode === "email" && (sp.office || sp.family)) redirect(`${BASE.messages}?${qs}`);
  const TABS = TABS_OF[mode], base = BASE[mode];
  const f = TABS.some(([k]) => k === sp.f) ? sp.f! : "all";
  const [contacts, office, canMsg, paused] = await Promise.all([teacherContacts().catch(() => []), officeInfo().catch(() => ({ label: "the office", mailbox: null })), familyMsgsOn(),
    import("@/lib/test-mode").then((t) => t.betaOn()).catch(() => false)]);
  const read = !me.viewing;   // an admin "Viewing as" doesn't mark anything read
  // open the chosen conversation first (that marks it read), then build the list
  const ot = sp.office ? await myOfficeThread("teacher", me.id, sp.office, read) : null;
  const ft = sp.family ? await familyThread(me.id, sp.family, read) : null;
  if (sp.school && read) await markSchoolSeen(me.id, sp.school);
  const { items, mails } = await teacherInbox(me.id, office.label, contacts);
  const school = sp.school ? mails.filter((e) => e.thread_id === sp.school).reverse() : [];   // oldest first
  const to = sp.to === "all" && contacts.length > 1 ? { user_id: "all", name: contacts.map((c) => c.name.split(" ")[0]).join(" & "), label: "everyone" } : contacts.find((c) => c.user_id === sp.to);
  const writing = !!to || sp.new === "1";
  const chosen = ot || ft || school.length > 0 || writing;
  const mine = items.filter((i) => mode === "email" ? i.kind === "school" : i.kind !== "school");
  const unreadN = mine.filter((i) => i.unread > 0).length;
  const list = mine.filter((i) => f === "unread" ? i.unread > 0 : f === "school" ? i.kind === "office" : f === "families" ? i.kind === "family" : true);
  const sel = ot ? `office:${ot.th.id}` : ft ? `family:${ft.th.id}` : school.length ? `school:${sp.school}` : "";
  const off = me.viewing ? <p className="note">You’re viewing as {me.name}: you can read their messages but not send as them.</p> : null;
  const familyOff = !canMsg ? FAMILY_MSGS_OFF : paused ? "Messages to families are paused during the beta." : null;
  const back = <Link className="abtn sm ib-back" href={`${base}${f !== "all" ? `?f=${f}` : ""}`}>← All {mode === "email" ? "emails" : "messages"}</Link>;

  // 26 Nov: "Mark as unread" (a small form, so it works without scripts)
  const unreadBtn = (kind: InboxItem["kind"], id: string, cls: string, label: string) => me.viewing ? null : <form action={markUnreadAction} className={cls}>
    <input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={id} /><input type="hidden" name="f" value={f} /><input type="hidden" name="mode" value={mode} />
    <button type="submit" className="abtn sm" title="Mark as unread"><span aria-hidden="true" className="ib-dot" />{label}</button></form>;
  const head = (it: { initials: string; kind: string }, title: string, sub: string, tag: string, mu?: [InboxItem["kind"], string]) => <div className="ib-ch">
    <span className={`ib-av ${it.kind === "family" ? "fam" : "sch"}`} aria-hidden="true">{it.initials}</span>
    <div className="t"><h2>{title}</h2><span className="muted">{sub}</span></div>{mu && unreadBtn(mu[0], mu[1], "ib-mu-h", "Mark as unread")}<span className={`ib-tag ${it.kind === "family" ? "fam" : "sch"}`}>{tag}</span></div>;
  // 27 Nov (Alfonso): each message says whether it came by email or in the app (an envelope or a speech bubble)
  const bubble = (key: string, mine: boolean, who: string, at: string, body: React.ReactNode, extra?: React.ReactNode, id?: string, via: "email" | "app" = "app") =>
    <div key={key} id={id} className={`ib-b ${mine ? "me" : "them"}`}><div className="ib-body">{body}</div>{extra}<small><Via v={via} /> {who} · {via === "email" ? "by email" : "in the app"} · {when(at)}</small></div>;
  const itemFor = (kind: InboxItem["kind"], id: string) => items.find((i) => i.kind === kind && i.id === id);

  // ---------- the right-hand pane ----------
  let pane: React.ReactNode = <div className="ib-empty"><b>{mine.length ? "Choose a conversation" : mode === "email" ? "No emails yet" : "No messages yet"}</b>
    <span>{mine.length ? "Pick one on the left to read it and reply." : mode === "email" ? "Your emails with the school show here." : "Messages from the office and from families show here."}</span>
    <Link className="abtn pri" href={`${base}?new=1`}>{mode === "email" ? "New email" : "New message"}</Link></div>;
  if (ot) { const it = itemFor("office", ot.th.id); pane = <>
    {head({ initials: it?.initials ?? "O", kind: "office" }, ot.th.subject, `${it?.who ?? office.label} · the office${ot.th.status === "closed" ? " · closed" : ""}`, "School", ["office", ot.th.id])}
    <div className="ib-msgs">{ot.msgs.map((m) => bubble(m.id, m.sender !== "office", m.who, m.at, m.body))}</div>
    {ot.th.status === "open" ? <form action={teacherOfficeReplyAction} className="ib-reply"><input type="hidden" name="id" value={ot.th.id} />
      <textarea name="body" required rows={3} maxLength={5000} placeholder="Write a reply…" aria-label="Reply" /><button className="abtn pri" type="submit" disabled={!!me.viewing}>Send</button></form>
      : <p className="note">This conversation is closed.</p>}{off}</>; }
  else if (ft) { const it = itemFor("family", ft.th.id); pane = <>
    {head({ initials: it?.initials ?? "P", kind: "family" }, ft.th.subject, `${ft.th.parent} · about ${ft.th.student}${ft.th.status === "closed" ? " · closed" : ""}`, "Family", ["family", ft.th.id])}
    <div className="ib-msgs">{ft.msgs.map((m) => bubble(m.id, m.sender === "teacher", m.sender === "teacher" ? "You" : m.who, m.created_at, m.body))}</div>
    {familyOff ? <p className="note">{familyOff}</p> : ft.th.status === "closed" ? <p className="note">This conversation is closed.</p>
      : <form action={replyThreadAction} className="ib-reply"><input type="hidden" name="id" value={ft.th.id} /><input type="hidden" name="back" value="teacher" />
        <textarea name="body" required rows={3} maxLength={5000} placeholder="Write a reply…" aria-label="Reply" /><button className="abtn pri" type="submit" disabled={!!me.viewing}>Send</button></form>}{off}</>; }
  else if (school.length) { const last = school[school.length - 1], it = itemFor("school", sp.school!); pane = <>
    {head({ initials: it?.initials ?? "S", kind: "school" }, last.subject || "(no subject)", `${it?.who ?? office.label} · the school`, "School", school.some((e) => e.replied_at) ? ["school", sp.school!] : undefined)}
    <div className="ib-msgs">{school.map((e) => <div key={e.id} id={`e-${e.id}`} className="ib-pair">
      {bubble(e.id + "a", true, "You", e.at, e.body, (e.files.length > 0 || (e.links?.length ?? 0) > 0) && <div className="tm-att">
        {e.files.map((x) => <a key={x.id} className="abtn sm" href={`/admin/email-file/${x.id}`}>{x.name} · {kb(x.size)}</a>)}
        {(e.links ?? []).map((l) => <a key={l} className="abtn sm" href={l} target="_blank" rel="noopener">{/drive\.google|docs\.google/.test(l) ? "Google Drive link" : l.replace(/^https:\/\//, "").slice(0, 40)}</a>)}</div>, undefined, e.local ? "app" : "email")}
      {e.replied_at && bubble(e.id + "b", false, `${e.to_name ?? office.label}${e.reply_from ? ` (${e.reply_from})` : ""}`, e.replied_at, e.reply_body, undefined, undefined, "email")}</div>)}</div>
    <form action={teacherEmailAction} encType="multipart/form-data" className="ib-reply wide"><input type="hidden" name="thread" value={last.thread_id} />
      <input type="hidden" name="subject" value={/^re:/i.test(last.subject) ? last.subject : `Re: ${last.subject}`} />
      <textarea name="body" required rows={3} maxLength={20000} placeholder="Write a reply…" aria-label="Reply" />
      <details><summary>Attach</summary><div className="tm-extra">
        <label className="fld">Files <span className="muted">(up to 5, 3.5 MB in total)</span><input type="file" name="files" multiple /></label>
        <label className="fld">Google Drive links <span className="muted">(one per line)</span><textarea name="links" rows={2} placeholder="https://drive.google.com/…" /></label></div></details>
      <button className="abtn pri" type="submit" disabled={!!me.viewing}>Send</button></form>{off}</>; }
  else if (writing) pane = <div className="ib-new">
    <h2>{mode === "email" ? "New email" : "New message"}</h2>
    {mode === "email" && <><p className="ct-k">To the school</p>
    <div className="tm-contacts">{contacts.length === 0 ? <p className="muted" style={{ margin: 0 }}>No one is set up yet. Ask the office to choose who teachers can message.</p>
      : contacts.map((c) => <Link key={c.user_id} href={`${BASE.email}?to=${c.user_id}#write`} className={`tm-contact${to?.user_id === c.user_id ? " on" : ""}`}>
        <span className="tm-av" aria-hidden="true">{c.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span><span><b>{c.name}</b><span className="muted">{c.label}</span></span></Link>)}
      {contacts.length > 1 && <Link href={`${BASE.email}?to=all#write`} className={`tm-contact${to?.user_id === "all" ? " on" : ""}`}>
        <span className="tm-av" aria-hidden="true">+</span><span><b>Everyone</b><span className="muted">{contacts.map((c) => c.name.split(" ")[0]).join(" & ")}</span></span></Link>}</div>
    {to && <form id="write" action={teacherEmailAction} encType="multipart/form-data" className="tm-form"><input type="hidden" name="to" value={to.user_id} />
      <p className="ct-k">{to.user_id === "all" ? `To ${to.name}, together` : `To ${to.name} · ${to.label}`}</p>
      <label className="fld">Subject<input name="subject" required maxLength={200} /></label>
      <label className="fld">Message<textarea name="body" required rows={6} maxLength={20000} /></label>
      <details><summary>Attach files or Google Drive links</summary><div className="tm-extra">
        <label className="fld">Files <span className="muted">(up to 5, 3.5 MB in total)</span><input type="file" name="files" multiple /></label>
        <label className="fld">Google Drive links <span className="muted">(one per line)</span><textarea name="links" rows={2} placeholder="https://drive.google.com/…" /></label></div></details>
      <div style={{ display: "flex", gap: 8 }}><button className="abtn pri" type="submit" disabled={!!me.viewing}>Send</button><Link className="abtn" href={base}>Cancel</Link></div>
      <p className="note" style={{ margin: 0 }}>{to.user_id === "all" ? "Each of them also gets it by email." : "They also get it by email."} Their reply shows here and comes to {me.email}.</p>
    </form>}</>}
    {mode === "messages" && <><p className="ct-k">To a family</p>
    {familyOff ? <p className="note" style={{ margin: 0 }}>{familyOff}</p> : <Link className="abtn" href="/admin/messages/new">Message a family</Link>}
    <p className="muted" style={{ fontSize: 14, marginTop: 14 }}>To write to the school, use <Link href={`${BASE.email}?new=1`}>Email</Link>.</p></>}
    {off}</div>;

  return <>
    <div className="top"><div><h1>{mode === "email" ? "Email" : "Messages"}</h1><div className="sub">{mode === "email" ? "Your emails with the school: they come and go by email too." : "Messages in the app: from the office, and with the parents of the students you teach."}</div></div>
      <span className="grow" /><GuideSlides slides={TEACHER_GUIDES.messages.slides} title={TEACHER_GUIDES.messages.title} /><Link className="abtn pri" href={`${base}?new=1`}>{mode === "email" ? "New email" : "New message"}</Link></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    {!me.viewing && <NavCountSync href={base} count={unreadN} />}<LiveMessages stamp={await messagesStamp()} />
    <div className={`card ib${chosen ? " has-sel" : ""}`}>
      <div className="ib-list">
        <div className="segl ib-tabs" role="group" aria-label="Show">{TABS.map(([k, l]) => <Link key={k} scroll={false} href={`${base}${k !== "all" ? `?f=${k}` : ""}`} aria-current={f === k ? "true" : undefined}>
          {l}{k === "unread" && unreadN > 0 && <b className="ib-n">{unreadN}</b>}</Link>)}</div>
        {list.length === 0 ? <p className="empty">{f === "unread" ? "Nothing unread." : mode === "email" ? "No emails yet." : "No conversations yet."}</p>
          : <nav className="ib-items" aria-label="Conversations">{list.map((it) => { const k = `${it.kind}:${it.id}`;
            return <div key={k} className="ib-row"><Link href={href(it, f)} className={`ib-it${it.unread ? " unread" : " read"}${sel === k ? " sel" : ""}`} aria-current={sel === k ? "true" : undefined}>
              <span className={`ib-av ${it.kind === "family" ? "fam" : "sch"}`} aria-hidden="true">{it.initials}</span>
              <span className="t"><span className="n"><b>{it.who}</b><span className="d">{stamp(it.at)}</span></span>
                <span className="s">{it.subject}</span><span className="p">{it.preview}</span>
                <span className="m"><span className={`ib-tag ${it.kind === "family" ? "fam" : "sch"}`}>{it.kind === "family" ? "Family" : it.kind === "office" ? "Office" : "School"}</span>{it.sub && it.kind === "family" && <span className="muted">{it.sub}</span>}
                  {it.waiting && <span className="pill warn">Waiting for your reply</span>}{it.closed && <span className="pill mute">Closed</span>}</span></span>
              {it.unread > 0 && <span className="ib-n" aria-label={`${it.unread} unread`}>{it.unread}</span>}</Link>
              {!it.unread && !(it.kind === "school" && it.mine && it.preview.startsWith("You:")) && unreadBtn(it.kind, it.id, "ib-mu", "Mark unread")}</div>; })}</nav>}
      </div>
      <section className="ib-conv" aria-label="Conversation">{chosen && back}{pane}</section>
    </div>
  </>;
}

/** 27 Nov (Alfonso): an envelope (came by email) or a speech bubble (sent in the app). */
function Via({ v }: { v: "email" | "app" }) {
  return <span className={`ib-via via-${v}`} title={v === "email" ? "By email" : "In the app"} aria-label={v === "email" ? "By email" : "In the app"}>
    {v === "email" ? <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><path d="M3 5h14v10H3z M3 5.5l7 5.5 7-5.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>
      : <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><path d="M4 4h12a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 16 14H9l-4 3v-3H4a1.5 1.5 0 0 1-1.5-1.5v-7A1.5 1.5 0 0 1 4 4z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>}</span>;
}
