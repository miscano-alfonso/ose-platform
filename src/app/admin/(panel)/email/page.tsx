import Link from "next/link";
import { audiences, recipients, emailReady, history } from "@/lib/email";
import { automations } from "@/lib/automations";
import { Composer, NotConnected } from "../../Composer";
import { inboxStatus, inboxList } from "@/lib/inbox";
import { syncInboxAction, markInboxAction, disconnectInboxAction, replyFromAction } from "../../actions";

const KIND: Record<string, [string, string]> = { family: ["good", "Family"], taster: ["info", "Taster"], waiting: ["warn", "Waiting list"], enquiry: ["mute", "Enquiry"] };

const when = (s: string) => new Date(s).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

export default async function Email({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; audience?: string; subject?: string; body?: string; tab?: string; show?: string }> }) {
  const sp = await searchParams;
  const tab = ["auto", "compose", "inbox", "sent"].includes(sp.tab ?? "") ? sp.tab! : sp.audience || sp.ok || sp.err ? "compose" : "auto";
  const ready = await emailReady();
  const box = await inboxStatus();
  const unread = box.connected ? (await inboxList("new")).unread : 0;
  const TABS: [string, string][] = [["auto", "Automatic emails"], ["compose", "Send an email"], ["inbox", `Inbox${unread ? ` (${unread})` : ""}`], ["sent", "Sent"]];
  const head = <>
    <div className="top"><div><h1>Email</h1><div className="sub">Automatic emails, one-off messages to families, students or teachers, replies from families, and everything sent.</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    {!ready && <NotConnected />}
    <div className="segl" role="tablist" style={{ marginBottom: 14 }}>{TABS.map(([k, l]) => <Link key={k} href={`/admin/email?tab=${k}`} aria-current={tab === k ? "true" : undefined}>{l}</Link>)}</div></>;
  if (tab === "auto") {
    const { rows } = await automations();
    return <>{head}<div className="tw"><table><thead><tr><th>Email</th><th>When it goes</th><th>To</th><th>This week</th><th>On</th><th /></tr></thead><tbody>
      {rows.map((a) => <tr key={a.key}><td><b>{a.name}</b></td><td>{a.when}{a.timing && a.minutes != null ? ` ${a.minutes} ${a.timing.label}.` : ""}</td><td>{[a.to_parent && "Parent", a.to_student && "Student"].filter(Boolean).join(", ")}</td>
        <td>{a.sent7} sent{a.scheduled ? ` · ${a.scheduled} booked` : ""}</td><td><span className={`pill ${a.enabled ? "good" : "mute"}`}>{a.enabled ? "On" : "Off"}</span></td>
        <td><Link className="abtn sm" href={`/admin/automations?open=${a.key}#${a.key}`}>Edit wording</Link></td></tr>)}</tbody></table></div>
      <p className="note">These use the timetable, term dates and payment plans, so they stop in the holidays and never send twice. Switch them on and change the wording under Automations.</p></>;
  }
  if (tab === "compose") {
    const auds = await audiences();
    const options = await Promise.all(auds.map(async (a) => { const to = await recipients(a.value); return { ...a, count: to.length, people: to.map((r) => ({ name: r.name, email: r.email })) }; }));
    return <>{head}<Composer kind="message" options={options} ready={ready} draft={{ audience: sp.audience, subject: sp.subject, body: sp.body }} /></>;
  }
  if (tab === "inbox") {
    if (!box.connected) return <>{head}<section className="card"><h2>Connect the school inbox</h2>
      <p className="cs">Emails from families (replies to school emails, questions, absence notes) show here, linked to the family. The site reads the inbox read-only and keeps only emails from people you already know: families, enquiries, the waiting list and taster bookings. Everything else stays in Gmail only.</p>
      <ol style={{ margin: "0 0 14px", paddingLeft: 20, lineHeight: 1.6 }}>
        <li>In <a href="https://console.cloud.google.com/apis/library/gmail.googleapis.com" target="_blank" rel="noopener">Google Cloud Console</a> (the same project as Google Meet), turn on the <b>Gmail API</b>.</li>
        <li>Press Connect and sign in as the mailbox families write to (the address school emails come from).</li></ol>
      <a className="abtn pri" href="/admin/meet-api?action=login&what=gmail">Connect the school inbox</a>
      <p className="note" style={{ marginTop: 10 }}>Google Meet has to be connected first (Attendance → Google Meet), because the inbox uses the same Google app.</p></section></>;
    const show = sp.show === "all" ? "all" : "new";
    const { rows } = await inboxList(show);
    const gm = (t: string, mb?: string | null) => `https://mail.google.com/mail/?authuser=${encodeURIComponent(mb || box.mailbox)}#all/${t}`;
    // Reply as the chosen address: open the thread itself when it arrived in that inbox, otherwise a new Gmail message in that account
    const reply = (m: { thread_id: string; mailbox: string | null; from_email: string; subject: string }) => (m.mailbox || box.mailbox) === box.replyFrom ? gm(m.thread_id, m.mailbox)
      : `https://mail.google.com/mail/?authuser=${encodeURIComponent(box.replyFrom)}&view=cm&fs=1&to=${encodeURIComponent(m.from_email)}&su=${encodeURIComponent(/^re:/i.test(m.subject) ? m.subject : `Re: ${m.subject}`)}`;
    const many = box.mailboxes.length > 1;
    return <>{head}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <div className="segl" role="group" aria-label="Show"><Link href="/admin/email?tab=inbox" aria-current={show === "new" ? "true" : undefined}>New</Link><Link href="/admin/email?tab=inbox&show=all" aria-current={show === "all" ? "true" : undefined}>All</Link></div>
        <span className="grow" />
        {unread > 1 && <form action={markInboxAction}><input type="hidden" name="all" value="1" /><button className="abtn sm" type="submit">Mark all read</button></form>}
        <form action={syncInboxAction}><button className="abtn sm" type="submit">Check now</button></form></div>
      <section className="card">{rows.length === 0 ? <p className="empty">{show === "new" ? "Nothing new from families." : "No emails from families yet."}</p> : rows.map((m) => <div key={m.id} className="li" style={{ flexWrap: "wrap" }}>
        <span className={`pill ${m.read ? "mute" : "info"}`}>{m.read ? "Read" : "New"}</span>
        <div className="t"><b>{m.from_name || m.from_email} · {m.subject || "(no subject)"}</b><span>{m.snippet}</span>
          <span style={{ display: "block", fontSize: 13.5 }}>{when(m.received_at)} · <span className={`pill ${KIND[m.kind]?.[0] ?? "mute"}`} style={{ fontSize: 12 }}>{KIND[m.kind]?.[1] ?? m.kind}</span>
            {m.parent_id && <> · <Link href={`/admin/families/${m.parent_id}`}>{m.family}</Link></>}{m.from_name ? ` · ${m.from_email}` : ""}{many && m.mailbox ? ` · to ${m.mailbox}` : ""}</span></div>
        <a className="abtn sm pri" href={reply(m)} target="_blank" rel="noopener" title={`Reply from ${box.replyFrom}`}>Reply</a>
        <a className="abtn sm" href={gm(m.thread_id, m.mailbox)} target="_blank" rel="noopener">Open in Gmail</a>
        <form action={markInboxAction}><input type="hidden" name="id" value={m.id} /><input type="hidden" name="show" value={show} /><input type="hidden" name="read" value={m.read ? "0" : "1"} /><button className="abtn sm" type="submit">{m.read ? "Mark unread" : "Mark read"}</button></form></div>)}</section>
      <section className="card"><h2>Inboxes</h2>
        <p className="cs">Read-only, checked every 15 minutes while the admin is open{box.info.at ? `; last checked ${when(box.info.at)}` : ""}.{box.info.error ? ` Last check had a problem: ${box.info.error}` : ""} An email sent to more than one of these shows once.</p>
        {box.mailboxes.map((b) => <div className="li" key={b.mailbox}><div className="t"><b>{b.mailbox}</b><span>connected by {b.by}</span></div>
          <form action={disconnectInboxAction}><input type="hidden" name="mailbox" value={b.mailbox} /><button className="abtn sm" type="submit">Disconnect</button></form></div>)}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginTop: 12 }}>
          {box.mailboxes.length < 5 && <a className="abtn" href="/admin/meet-api?action=login&what=gmail2">Connect another inbox</a>}
          <form action={replyFromAction} className="eform" style={{ margin: 0 }}><label className="fld">Reply from<input name="from" type="email" defaultValue={box.replyFrom} className="mini" style={{ width: 260 }} /></label><button className="abtn sm" type="submit">Save</button></form>
        </div>
        <p className="note" style={{ marginTop: 8 }}>Reply opens Gmail signed in as the Reply from address: the thread itself if the email arrived there, otherwise a new message to the family with “Re:” and the subject. To connect another inbox, sign in to Google as that address when asked.</p>
      </section></>;
  }
  const past = await history("message");
  return <>{head}
    {past.length === 0 ? <p className="empty">Nothing sent yet.</p> : <div className="tw"><table><thead><tr><th>When</th><th>To</th><th>Subject</th><th>Delivered</th><th>By</th></tr></thead>
      <tbody>{past.map((c) => <tr key={c.id}><td>{when(c.created_at)}</td><td>{c.audience_label}</td><td>{c.subject}</td>
        <td>{c.failed ? <span className="pill bad" title={c.error ?? ""}>{c.sent}/{c.recipients} sent</span> : <span className="pill good">{c.sent} sent</span>}</td><td>{c.by}</td></tr>)}</tbody></table></div>}
  </>;
}
