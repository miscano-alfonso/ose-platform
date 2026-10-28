import Link from "next/link";
import { testMode, heldList } from "@/lib/test-mode";
import { meetStatus, recCanInvite } from "@/lib/meet";
import { classroomStatus } from "@/lib/classroom";
import { inboxStatus } from "@/lib/inbox";
import { emailReady } from "@/lib/email";
import { recStatus } from "@/lib/recordings";
import { inviteCfg } from "@/lib/classroom-invites";
import { stripeStatus } from "@/lib/stripe-read";
import { siteBase } from "@/lib/social";
import { setTestModeAction, clearHeldAction } from "../../actions";

export const dynamic = "force-dynamic";
const when = (s?: string) => s ? new Date(s).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }) : "";
const TAG: Record<string, string> = { "auto-lesson_reminder": "Lesson reminder", "auto-taster_booked": "Taster booked", "auto-taster_link": "Taster joining link", "auto-taster_follow_up": "After a taster",
  "auto-waitlist_open": "Waiting list open", "auto-payment_reminder": "Payment reminder", "auto-payment_failed": "Payment failed", "auto-report_published": "Report ready",
  "auto-booked": "Booked reminder taken back", "admin-message": "Email from the admin", marketing: "Marketing email", "social-report": "Report email" };
const tagName = (t: string | null) => (t && TAG[t]) || (t ? t.replace(/^auto-/, "").replace(/[-_]/g, " ") : "Email");

export default async function TestMode({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const base = await siteBase().catch(() => "");
  const [t, held, meet, cls, inbox, brevo, rec, inv, canInvite, stripe] = await Promise.all([testMode(), heldList(200), meetStatus(base).catch(() => null), classroomStatus().catch(() => null),
    inboxStatus().catch(() => null), emailReady().catch(() => false), recStatus().catch(() => null), inviteCfg().catch(() => ({ auto: false })), recCanInvite().catch(() => "none" as const), stripeStatus().catch(() => null)]);
  const ready = (ok: boolean | null | undefined, yes: string, no: React.ReactNode) => <span className={`pill ${ok ? "good" : "warn"}`}>{ok ? yes : "To do"}</span>;
  const row = (title: string, ok: boolean | null | undefined, yes: string, detail: React.ReactNode, href: string) => <div className="li"><div className="t"><b>{title}</b><span>{detail}</span></div>{ready(ok, yes, null)}<Link className="abtn sm" href={href}>Open</Link></div>;
  return <>
    <div className="top"><div><h1>Test mode</h1><div className="sub">Use the new dashboards on real data without anything going out to families, students or teachers.</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}

    <section className="card" style={{ borderColor: t.on ? "var(--sky)" : undefined }}>
      <h2 style={{ display: "flex", gap: 10, alignItems: "center" }}>{t.on ? "Test mode is on" : "The site is live"} <span className={`pill ${t.on ? "info" : "good"}`}>{t.on ? "Testing" : "Live"}</span></h2>
      <p className="cs">{t.at ? `Changed ${when(t.at)}${t.by ? ` by ${t.by}` : ""}.` : "Every new school starts in test mode."}</p>
      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", margin: "8px 0 14px" }}>
        <div><b>Still happens, on real data</b><ul style={{ margin: "6px 0 0", paddingLeft: 20, lineHeight: 1.6 }}>
          <li>Google Meet attendance is read and marks are made</li><li>Google Classroom classes, rosters and work are read</li>
          <li>Family emails arrive in the Inbox</li><li>Stripe payments are read</li><li>Recordings are watched (filed and posted by the Apps Script as now)</li>
          <li>Inbox replies you write are sent (you send each one yourself)</li></ul></div>
        <div><b>Held while test mode is on</b><ul style={{ margin: "6px 0 0", paddingLeft: 20, lineHeight: 1.6 }}>
          <li>Every email to anyone not on the list below: automatic emails (lesson reminders, payment, tasters, reports), emails from Send an email, sign-in links, alerts to teachers</li>
          <li>Google Classroom invitations and removals</li><li>Recording posts to Classroom, and renaming or moving recordings</li><li>Newsletters</li></ul></div>
      </div>
      <form action={setTestModeAction} className="eform" style={{ display: "grid", gap: 10, maxWidth: 720 }}>
        <label className="fld">Emails still go to these addresses (one per line or separated by commas)
          <textarea name="allow" rows={3} defaultValue={t.allow.join("\n")} className="mini" placeholder="e.g. leanne@ohsoed.co.uk" /></label>
        <span className="muted" style={{ fontSize: 14 }}>Always allowed: the admin accounts ({t.admins.join(", ") || "none"}). Add your own test addresses to try sign-in links and automatic emails yourself.</span>
        {t.on ? <><input type="hidden" name="on" value="1" />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}><button className="abtn" type="submit">Save the list</button></div>
          </> : <><input type="hidden" name="on" value="0" /><div><button className="abtn" type="submit" name="confirm" value="on">Save the list</button></div></>}
      </form>
      <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
        {t.on ? <form action={setTestModeAction} style={{ display: "grid", gap: 10, maxWidth: 720 }}><input type="hidden" name="on" value="0" />{t.allow.map((a) => <input key={a} type="hidden" name="allow" value={a} />)}
            <b>Go live (for Term 3)</b>
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}><input type="checkbox" name="confirm" style={{ marginTop: 4 }} /> I’ve checked the list below and want emails, Classroom invitations and posts to go to families, students and teachers from now on.</label>
            <div><button className="abtn pri" type="submit">Go live</button></div>
            <span className="muted" style={{ fontSize: 14 }}>Lesson reminders held for lessons still to come are booked again. Emails held for things already past are not sent.</span></form>
          : <form action={setTestModeAction}><input type="hidden" name="on" value="1" />{t.allow.map((a) => <input key={a} type="hidden" name="allow" value={a} />)}<button className="abtn" type="submit">Switch test mode back on</button></form>}
      </div>
    </section>

    <section className="card"><h2>Ready to go live?</h2>
      <p className="cs">What the site needs to read real data. Each one can be set up while test mode is on.</p>
      {row("Google Meet attendance", meet?.connected, "Connected", meet?.connected ? `Connected by ${meet.by}. Last read ${when(meet.sync?.at) || "not yet"}${meet.sync?.error ? `: ${meet.sync.error}` : ""}.` : "Connect Google (the account that owns the Meet calls) so attendance is read.", "/admin/attendance")}
      {row("Google Classroom (reading)", !!cls?.granted, "Connected", cls?.granted ? `${cls.linked} class${cls.linked === 1 ? "" : "es"} linked to Classroom. Last read ${when(cls.info.at) || "not yet"}.` : "Connect Google again and allow Classroom, so classes, rosters and work are read.", "/admin/classes")}
      {row("Recordings account (ose@)", rec?.connected, "Connected", rec?.connected ? `${rec.account}. Mode: ${rec.cfg.mode === "live" ? "Do the work" : "Watch only"}${t.on ? " (watch only while testing)" : ""}.` : "Connect ose@ in Recordings → Settings.", "/admin/recordings")}
      {row("Classroom invitations", canInvite === "ok", "Ready", canInvite === "ok" ? `Allowed. Automatic sending is ${inv.auto ? "on" : "off"}${t.on ? " (held while testing)" : ""}.` : "ose@ needs permission to send invitations (connect it again in Recordings → Settings).", "/admin/classes")}
      {row("School inbox", inbox?.connected, "Connected", inbox?.connected ? `${inbox.mailboxes.map((m) => m.mailbox).join(", ")}.` : "Connect the school inbox under Email → Inbox.", "/admin/email?tab=inbox")}
      {row("Sending email (Brevo)", brevo, "Connected", brevo ? "Connected. Emails to people not on the list are held while testing." : "Connect Brevo so automatic emails can go out.", "/admin/newsletter")}
      {row("Stripe payments (read only)", stripe?.connected, "Connected", stripe?.connected ? `Last read ${when(stripe.sync?.at) || "not yet"}.` : "Connect Stripe with a read-only key.", "/admin/payments/stripe")}
      {row("Daily background job", !!process.env.CRON_SECRET, "Set up", process.env.CRON_SECRET ? "Reads Meet, Classroom, the inbox and recordings every morning, even when nobody has the admin open." : "Add CRON_SECRET in Vercel (Settings → Environment Variables) so the daily job can run.", "/admin/test-mode")}
    </section>

    <section className="card"><div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}><h2 style={{ margin: 0 }}>Held, not sent ({held.total})</h2><span className="grow" />
      {held.total > 0 && <form action={clearHeldAction}><button className="abtn sm" type="submit">Clear the list</button></form>}</div>
      <p className="cs">What would have gone out if the site were live. Open one to read it.{held.byTag.length > 0 && <> {held.byTag.map((b) => `${tagName(b.tag)}: ${b.n}`).join(" · ")}</>}</p>
      {held.rows.length === 0 ? <p className="empty">Nothing held yet.</p> : held.rows.map((h) => <details key={h.id} className="li" style={{ display: "block" }}>
        <summary style={{ cursor: "pointer", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}><span className="muted" style={{ fontSize: 13.5, minWidth: 110 }}>{when(h.created_at)}</span>
          <span className="pill mute" style={{ fontSize: 12 }}>{tagName(h.tag)}</span><b>{h.to_name ? `${h.to_name} · ` : ""}{h.to_addr}</b><span>{h.subject}</span></summary>
        {h.body && <div style={{ whiteSpace: "pre-wrap", fontSize: 14.5, background: "var(--soft)", borderRadius: 10, padding: "10px 12px", marginTop: 8 }}>{h.body}</div>}</details>)}
    </section>
  </>;
}
