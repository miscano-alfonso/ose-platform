import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { withSchool } from "@/lib/db";
import { inboxStatus, signatureFor, inboxEveryone, inboxEvery, EVERY_CHOICES } from "@/lib/inbox";
import { teacherContacts, officeInfo } from "@/lib/teacher-area";
import { disconnectInboxAction, replyFromAction, signatureAction, inboxEveryoneAction, inboxEveryAction } from "../../actions";
import { teacherContactsAction } from "../teacher-contacts/actions";
import { SigPreview } from "../../InboxReply";

export const dynamic = "force-dynamic";
const when = (s: string) => new Date(s).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

// Settings → Email: your signature, the connected inboxes (and which one replies come from), and who teachers can email.
export default async function EmailSettings({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const [sp, me] = await Promise.all([searchParams, requireStaff()]);
  const [box, sig, admins, list, office] = await Promise.all([inboxStatus(), signatureFor(me), withSchool((q) => q<{ id: string; name: string; email: string }>(
    `select id, name, email::text from users where role = 'school_admin' and disabled_at is null order by name`)), teacherContacts(), officeInfo()]);
  const [everyone, every] = await Promise.all([inboxEveryone(), inboxEvery()]);
  const on = new Map(list.map((c) => [c.user_id, c.label]));
  return <>
    <div className="top"><div><h1>Email settings</h1><div className="sub">Your signature, the school inboxes and who teachers can email. Read and answer emails in <Link href="/admin/email">Email</Link>.</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}

    <section className="card"><h2>Your signature</h2>
      <p className="cs">Added under every reply you send from here: your name, job title, email address, website and the school logo. Leave a box empty to leave it out. The logo is blue; email apps that switch to dark mode (Apple Mail, iPhone Mail, Outlook) show it in white instead. Gmail doesn’t tell emails it’s in dark mode, so Gmail readers see the blue one.</p>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-end" }}>
        <form action={signatureAction} className="eform" style={{ margin: 0 }}>
          <label className="fld">Your job title<input name="title" defaultValue={sig.title} maxLength={80} placeholder="e.g. Technical Support" className="mini" style={{ width: 240 }} /></label>
          <label className="fld">Email address<input name="email" type="email" defaultValue={sig.email} maxLength={120} className="mini" style={{ width: 240 }} /></label>
          <label className="fld">Website<input name="web" defaultValue={sig.web} maxLength={120} placeholder="ohsoed.co.uk" className="mini" style={{ width: 200 }} /></label>
          <button className="abtn sm" type="submit">Save</button></form>
        <SigPreview sig={sig} />
      </div></section>

    <section className="card"><h2>Inboxes</h2>
      {!box.connected ? <><p className="cs">Emails from families (replies to school emails, questions, absence notes) show in Email, linked to the family. The site reads the inbox read-only and keeps only emails from people you already know.</p>
        <ol style={{ margin: "0 0 14px", paddingLeft: 20, lineHeight: 1.6 }}>
          <li>In <a href="https://console.cloud.google.com/apis/library/gmail.googleapis.com" target="_blank" rel="noopener">Google Cloud Console</a> (the same project as Google Meet), turn on the <b>Gmail API</b>.</li>
          <li>Press Connect and sign in as the mailbox families write to.</li></ol>
        <a className="abtn pri" href="/admin/meet-api?action=login&what=gmail">Connect the school inbox</a></>
      : <>
      <p className="cs">Checked {every ? `every ${every === 60 ? "hour" : `${every} minutes`}` : "only when you press refresh"}{box.info.at ? `; last checked ${when(box.info.at)}` : ""}.{box.info.error ? ` Last check had a problem: ${box.info.error}` : ""} An email sent to more than one of these shows once.</p>
      {box.mailboxes.some((b) => !b.syncRead) && <p className="note msg" style={{ marginTop: 0 }}>To keep read and unread in step with Gmail (and Mail on your Mac and phone), press <b>Reconnect</b> on each inbox below and allow the site to manage your email when Google asks. Until then, reading an email here doesn’t change it in Mail.</p>}
      {box.mailboxes.map((b) => <div className="li" key={b.mailbox}><div className="t"><b>{b.mailbox}</b><span>connected by {b.by}{b.syncRead ? " · read and unread stay in step with Gmail" : ""}</span></div>
        {!b.syncRead && <a className="abtn sm pri" href={`/admin/meet-api?action=login&what=${b.mailbox === box.mailbox ? "gmail" : "gmail2"}`}>Reconnect</a>}
        <form action={disconnectInboxAction}><input type="hidden" name="mailbox" value={b.mailbox} /><button className="abtn sm" type="submit">Disconnect</button></form></div>)}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginTop: 12 }}>
        {box.mailboxes.length < 5 && <a className="abtn" href="/admin/meet-api?action=login&what=gmail2">Connect another inbox</a>}
        <form action={replyFromAction} className="eform" style={{ margin: 0 }}><label className="fld">Reply from<input name="from" type="email" defaultValue={box.replyFrom} className="mini" style={{ width: 260 }} /></label><button className="abtn sm" type="submit">Save</button></form>
      </div>
      <form action={inboxEveryAction} id="checking" className="li" style={{ marginTop: 12 }}>
        <div className="t"><b>Check for new emails</b><span>While the admin is open (and every few minutes in the background). The refresh button on the Inbox checks straight away.</span></div>
        <select name="every" defaultValue={String(every)} className="mini" style={{ padding: "7px 10px", borderRadius: 10, border: "1.5px solid var(--line)", background: "var(--panel)", color: "var(--ink)", font: "inherit" }}>
          {EVERY_CHOICES.map((m) => <option key={m} value={m}>{m === 0 ? "Only when I press refresh" : m === 60 ? "Every hour" : `Every ${m} minutes`}</option>)}</select>
        <button className="abtn sm" type="submit">Save</button></form>
      <form action={inboxEveryoneAction} className="li" style={{ marginTop: 12 }}><input type="hidden" name="on" value={everyone ? "0" : "1"} />
        <div className="t"><b>Show emails from everyone</b><span>{everyone ? "On: every email in the inbox shows, tagged “Other” when the sender isn’t a family, enquiry, waiting-list family, taster or teacher." : "Off: only emails from families, enquiries, the waiting list, tasters and teachers show; everything else stays in Gmail only."}</span></div>
        <button className={`abtn sm${everyone ? "" : " pri"}`} type="submit">{everyone ? "Turn off" : "Turn on"}</button></form>
      <p className="note" style={{ marginTop: 8 }}>Replies are sent through the Reply from address’s Gmail, in the same conversation for the family. That address must be one of the inboxes above. Inboxes connected before sending was added need to be disconnected and connected again (tick the box to send email).</p></>}
    </section>

    <section className="card"><h2>Who teachers can email</h2>
      <p className="cs">On their Email page, teachers can write to the school inbox or to the people ticked here. Each email shows in Email → Inbox, tagged with who it’s for, and that person also gets it by email.</p>
      <form action={teacherContactsAction} style={{ display: "grid", gap: 10 }}>
        <label className="fld">The school inbox{office.mailbox ? ` (${office.mailbox})` : ""} is shown to teachers as<input name="office_label" defaultValue={office.label === "the office" ? "" : office.label} placeholder="e.g. Leanne" maxLength={60} /></label>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>Teachers can also email these people directly:</p>
        {admins.filter((a) => a.email.toLowerCase() !== (office.mailbox ?? "")).map((a) => <div key={a.id} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "8px 0", borderTop: "1px solid var(--line)" }}>
          <label style={{ display: "flex", gap: 10, alignItems: "center", flex: "1 1 260px", cursor: "pointer" }}>
            <input type="checkbox" name="on" value={a.id} defaultChecked={on.has(a.id)} style={{ width: 20, height: 20 }} />
            <span><b>{a.name}</b><br /><span className="muted" style={{ fontSize: 14 }}>{a.email}</span></span></label>
          <label className="fld" style={{ flex: "1 1 220px" }}>Shown to teachers as<input name={`label_${a.id}`} defaultValue={on.get(a.id) ?? ""} placeholder="e.g. Principal, IT support" maxLength={60} /></label>
        </div>)}
        <div><button className="abtn pri" type="submit">Save</button></div>
      </form></section>
  </>;
}
