import Link from "next/link";
import { audiences, recipients, emailReady, history, emailDesign, senderName } from "@/lib/email";
import { EmailPreview } from "../../EmailPreview";
import { saveEmailDesignAction } from "../../actions";
import { automations } from "@/lib/automations";
import { Composer, NotConnected } from "../../Composer";
import { inboxStatus, inboxList } from "@/lib/inbox";
import { syncInboxAction, markInboxAction, disconnectInboxAction, replyFromAction, signatureAction } from "../../actions";
import { InboxPanel, SigPreview } from "../../InboxReply";
import { requireStaff } from "@/lib/auth";

const KIND: Record<string, [string, string]> = { family: ["good", "Family"], taster: ["info", "Taster"], waiting: ["warn", "Waiting list"], enquiry: ["mute", "Enquiry"], staff: ["warn", "Teacher"] };

const LDN = "Europe/London";
const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: LDN });
/** List dates the way mail apps show them: the time today, "Yesterday", the weekday this week, else the date. */
function shortWhen(s: string) {
  const d = new Date(s), now = new Date(), t = (x: Date) => x.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: LDN });
  const days = Math.round((Date.parse(dayKey(now)) - Date.parse(dayKey(d))) / 864e5);
  if (days <= 0) return t(d);
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString("en-GB", { weekday: "short", timeZone: LDN });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}), timeZone: LDN });
}
const fullWhen = (s: string) => new Date(s).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: LDN }).replace(" at ", ", ");
const when = (s: string) => new Date(s).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

export default async function Email({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; audience?: string; subject?: string; body?: string; tab?: string; show?: string; m?: string }> }) {
  const sp = await searchParams;
  const tab = ["auto", "compose", "inbox", "sent", "design"].includes(sp.tab ?? "") ? sp.tab! : sp.audience || sp.ok || sp.err ? "compose" : "inbox";
  const ready = await emailReady();
  const box = await inboxStatus();
  const unread = box.connected ? (await inboxList("new")).unread : 0;
  const TABS: [string, string][] = [["inbox", `Inbox${unread ? ` (${unread})` : ""}`], ["compose", "Send an email"], ["sent", "Sent"], ["design", "Email design"], ["auto", "Automatic emails"]];
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
    const [design, from] = await Promise.all([emailDesign(), senderName()]);
    return <>{head}<Composer kind="message" options={options} ready={ready} draft={{ audience: sp.audience, subject: sp.subject, body: sp.body }} design={design} from={from} /></>;
  }
  if (tab === "design") {
    const [design, from] = await Promise.all([emailDesign(), senderName()]);
    return <>{head}<form action={saveEmailDesignAction} className="card cmp"><div className="cmp-main">
      <h2>Email design</h2>
      <p className="cs">How every email from the school looks: one-off emails, automatic emails (reminders, taster emails, payment reminders) and replies to forms. The logo is the website logo (change it under Website).</p>
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" name="logo" defaultChecked={design.logo} /> Show the logo at the top</label>
      <label className="fld">Header colour (behind the logo)<input type="color" name="color" defaultValue={design.color} style={{ width: 90, height: 40, padding: 3 }} /></label>
      <label className="fld">Footer, one line per line (address, website, phone, registration details…). Web and email addresses become links.<textarea name="footer" rows={6} maxLength={1000} defaultValue={design.footer} className="mini" style={{ width: "100%" }} /></label>
      <p className="note" style={{ margin: 0 }}>Newsletters and marketing emails also get a line saying how to stop them.</p>
      <div><button className="abtn pri" type="submit">Save email design</button></div>
    </div><EmailPreview design={design} from={from} sample={{ subject: "Lesson reminder: KS3 Maths today at 16:00", body: "Hi Sam,\n\nYour KS3 Maths lesson with Becky starts at 16:00.\n\nJoin the lesson: https://meet.google.com/abc-defg-hij\n\nSee you there!" }} /></form></>;
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
    const [{ rows: allRows }, me] = await Promise.all([inboxList("all"), requireStaff()]);
    // "New" keeps the email that's open, so it doesn't vanish from the list once opened (and so marked read)
    const rows = show === "all" ? allRows : allRows.filter((m) => !m.read || m.id === sp.m);
    const { signatureFor } = await import("@/lib/inbox");
    const sig = await signatureFor(me);
    const gm = (t: string, mb?: string | null) => `https://mail.google.com/mail/?authuser=${encodeURIComponent(mb || box.mailbox)}#all/${t}`;
    const many = box.mailboxes.length > 1;
    const isAddr = (s: string | null) => !s || /@/.test(s);
    // one name per sender: the family's name when we know them, else the name on the email, else the address
    const who = (m: (typeof rows)[number]) => m.family || (isAddr(m.from_name) ? null : m.from_name) || m.from_email;
    const sel = rows.find((m) => m.id === sp.m) ?? rows[0] ?? null;
    const href = (id: string) => `/admin/email?tab=inbox${show === "all" ? "&show=all" : ""}&m=${id}`;
    const panel = sel && { id: sel.id, name: who(sel), email: sel.from_email, familyHref: sel.parent_id ? `/admin/families/${sel.parent_id}` : null, subject: sel.subject,
      when: fullWhen(sel.received_at), kind: KIND[sel.kind] ?? null, mailbox: many ? sel.mailbox : null, gmail: sel.thread_id.startsWith("local:") ? null : gm(sel.thread_id, sel.mailbox), read: sel.read,
      replied: !!sel.replied_at, first: (who(sel).includes("@") ? "" : who(sel).split(" ")[0]) || "there" };
    return <>{head}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <div className="segl" role="group" aria-label="Show"><Link href="/admin/email?tab=inbox" aria-current={show === "new" ? "true" : undefined}>New{unread ? ` (${unread})` : ""}</Link><Link href="/admin/email?tab=inbox&show=all" aria-current={show === "all" ? "true" : undefined}>All</Link></div>
        <span className="grow" />
        {unread > 1 && <form action={markInboxAction}><input type="hidden" name="all" value="1" /><button className="abtn sm" type="submit">Mark all read</button></form>}
        <form action={syncInboxAction}><button className="abtn sm" type="submit">Check now</button></form></div>
      {rows.length === 0 ? <section className="card"><p className="empty">{show === "new" ? "Nothing new from families." : "No emails from families yet."}</p></section> :
      <div className={`ibx${sp.m ? " picked" : ""}`}>
        <nav className="ibx-list" aria-label="Emails">{rows.map((m) => <Link key={m.id} href={href(m.id)} scroll={false} className={`ibx-row${m.read ? "" : " unread"}`} aria-current={m.id === sel?.id ? "true" : undefined}>
          <span className="ibx-top"><b>{who(m)}</b><time dateTime={m.received_at}>{shortWhen(m.received_at)}</time></span>
          <span className="ibx-subj">{m.subject || "(no subject)"}</span>
          <span className="ibx-snip">{m.snippet}</span>
          <span className="ibx-tags">{KIND[m.kind] && <span className={`pill ${KIND[m.kind][0]}`}>{KIND[m.kind][1]}</span>}{m.to_name && <span className="pill info">To {m.to_name.split(" ")[0]}</span>}{m.replied_at && <span className="pill good">Replied</span>}{many && m.mailbox && <span className="muted">to {m.mailbox}</span>}</span>
        </Link>)}</nav>
        {panel && <InboxPanel key={panel.id} m={panel} sig={sig} from={box.replyFrom} opened={!!sp.m} />}
      </div>}
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
        <p className="cs">Read-only, checked every 15 minutes while the admin is open{box.info.at ? `; last checked ${when(box.info.at)}` : ""}.{box.info.error ? ` Last check had a problem: ${box.info.error}` : ""} An email sent to more than one of these shows once.</p>
        {box.mailboxes.map((b) => <div className="li" key={b.mailbox}><div className="t"><b>{b.mailbox}</b><span>connected by {b.by}</span></div>
          <form action={disconnectInboxAction}><input type="hidden" name="mailbox" value={b.mailbox} /><button className="abtn sm" type="submit">Disconnect</button></form></div>)}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginTop: 12 }}>
          {box.mailboxes.length < 5 && <a className="abtn" href="/admin/meet-api?action=login&what=gmail2">Connect another inbox</a>}
          <form action={replyFromAction} className="eform" style={{ margin: 0 }}><label className="fld">Reply from<input name="from" type="email" defaultValue={box.replyFrom} className="mini" style={{ width: 260 }} /></label><button className="abtn sm" type="submit">Save</button></form>
        </div>
        <p className="note" style={{ marginTop: 8 }}>Reply opens the whole email here and sends your answer through the Reply from address’s Gmail, in the same conversation for the family. That address must be one of the inboxes above. Inboxes connected before sending was added need to be disconnected and connected again (tick the box to send email). To connect another inbox, sign in to Google as that address when asked.</p>
      </section></>;
  }
  const past = await history("message");
  return <>{head}
    {past.length === 0 ? <p className="empty">Nothing sent yet.</p> : <div className="tw"><table><thead><tr><th>When</th><th>To</th><th>Subject</th><th>Delivered</th><th>By</th></tr></thead>
      <tbody>{past.map((c) => <tr key={c.id}><td>{when(c.created_at)}</td><td>{c.audience_label}</td><td>{c.subject}</td>
        <td>{c.failed ? <span className="pill bad" title={c.error ?? ""}>{c.sent}/{c.recipients} sent</span> : <span className="pill good">{c.sent} sent</span>}</td><td>{c.by}</td></tr>)}</tbody></table></div>}
  </>;
}
