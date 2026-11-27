import Link from "next/link";
import { requireParent } from "@/lib/family-auth";
import { withSchool } from "@/lib/db";
import { Head } from "../../fmt";
import { parentEmailReadAction } from "../../actions";
import { GuideSlides } from "../../../admin/GuideSlides";
import { FAMILY_GUIDES } from "../../../admin/guides";

export const dynamic = "force-dynamic";

// 27 Nov (Alfonso: "separate the emails and messages on teacher and parent dashboards ... like the admin one"): the emails
// the school has sent this parent (reminders, reports, letters from the office…), newest first. Messages has the
// conversations in the app. Copies are kept from 27 Nov 2026 (db/126).
const LABEL: Record<string, string> = { "admin-message": "From the office", marketing: "Newsletter", "auto-lesson_reminder": "Lesson reminder", "auto-payment_reminder": "Payment", "auto-payment_failed": "Payment",
  "auto-payment_chase": "Payment", "auto-report_published": "Report", "report-pdf": "Report", "auto-assignment_due": "Classroom work", "auto-assignment_overdue": "Classroom work", "auto-handin_redo": "Classroom work",
  "auto-attendance_week": "Attendance", "auto-reward_points": "Reward points", "auto-lesson_moved": "Lesson change", "auto-lesson_cancelled": "Lesson change" };
const label = (t: string | null) => (t && (LABEL[t] ?? (t.startsWith("auto-taster") ? "Taster" : t.startsWith("auto-waitlist") ? "Waiting list" : t.includes("message") ? "Message" : null))) ?? "From the school";
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
/** The email's words as it was written: paragraphs, [words](link) and **bold**. */
const rich = (body: string) => body.trim().split(/\n{2,}/).map((p) => `<p>${esc(p)
  .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_m, t: string, u: string) => `<a href="${u}" target="_blank" rel="noopener">${t}</a>`)
  .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>').replace(/\n/g, "<br>")}</p>`).join("");
const LDN = "Europe/London";
const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: LDN });
/** As in the admin's inbox: the time today, "Yesterday", the weekday this week, else the date. */
function shortWhen(s: string) {
  const d = new Date(Date.parse(s.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00"))), now = new Date(), days = Math.round((Date.parse(dayKey(now)) - Date.parse(dayKey(d))) / 864e5);
  if (days <= 0) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: LDN });
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString("en-GB", { weekday: "short", timeZone: LDN });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}), timeZone: LDN });
}
const fullWhen = (s: string) => new Date(Date.parse(s.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00"))).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: LDN }).replace(" at ", ", ");
/** The first words of the email, for the list. */
const snip = (b: string) => b.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\*\*/g, "").replace(/\s+/g, " ").trim().slice(0, 160);

// 27 Nov (Alfonso: "make the email and message features you've made for admin, the EXACT same for the teachers and
// parents"): the same layout as Admin → Email → Inbox: New / All (Newest first / Unread first), the list on the left with
// unread emails in bold with a blue bar, the open email on the right with Reply (writes to the office in Messages) and
// Mark unread. Opening an email marks it read (email_log.read_at, db/129).
export default async function ParentEmail({ searchParams }: { searchParams: Promise<{ show?: string; sort?: string; m?: string }> }) {
  const [sp, f] = await Promise.all([searchParams, requireParent()]);
  const me = f.email.toLowerCase();
  if (sp.m && /^\d+$/.test(sp.m) && !f.viewer) await withSchool((q) => q(`update email_log set read_at = now() where id = $1 and to_email = $2 and read_at is null`, [sp.m, me])).catch(() => null);
  const [rows, school] = await Promise.all([withSchool((q) => q<{ id: string; subject: string; body: string; tag: string | null; at: string; read: boolean }>(`select id::text, subject, body, tag, coalesce(scheduled_for, sent_at)::text as at, read_at is not null as read
    from email_log where to_email = $1 and coalesce(scheduled_for, sent_at) <= now() order by coalesce(scheduled_for, sent_at) desc limit 150`, [me])).catch(() => []),
    withSchool((q) => q<{ name: string }>(`select name from schools where id = current_school()`)).then((r) => r[0]?.name ?? "The school").catch(() => "The school")]);
  const unread = rows.filter((r) => !r.read).length;
  const show = sp.show === "all" ? "all" : sp.show === "new" ? "new" : unread || sp.m ? "new" : "all";   // nothing new: open on All
  const unreadFirst = show === "all" && sp.sort === "unread";
  const list = show === "all" ? (unreadFirst ? [...rows.filter((r) => !r.read), ...rows.filter((r) => r.read)] : rows) : rows.filter((r) => !r.read || r.id === sp.m);
  const qs = `show=${show}${unreadFirst ? "&sort=unread" : ""}`;
  const sel = sp.m ? rows.find((r) => r.id === sp.m) ?? null : null;
  return <>
    <Head title="Email" sub={`Emails the school has sent you at ${f.email}. To answer one, press Reply, or reply in your own email.`}><GuideSlides slides={[...FAMILY_GUIDES["p-messages"].slides]} title={FAMILY_GUIDES["p-messages"].title} /></Head>
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
      <div className="segl" role="group" aria-label="Show"><Link href="/parent/email?show=new" aria-current={show === "new" ? "true" : undefined}>New{unread ? ` (${unread})` : ""}</Link><Link href="/parent/email?show=all" aria-current={show === "all" ? "true" : undefined}>All</Link></div>
      {show === "all" && <div className="segl" role="group" aria-label="Order"><Link href="/parent/email?show=all" aria-current={!unreadFirst ? "true" : undefined}>Newest first</Link><Link href="/parent/email?show=all&sort=unread" aria-current={unreadFirst ? "true" : undefined}>Unread first</Link></div>}
      <span className="grow" />
      {unread > 1 && !f.viewer && <form action={parentEmailReadAction}><input type="hidden" name="all" value="1" /><input type="hidden" name="show" value={show} /><button className="abtn sm" type="submit">Mark all read</button></form>}
    </div>
    {rows.length === 0 ? <section className="card"><p className="empty">No emails here yet. Emails from the school show here from 27 November 2026.</p></section>
      : list.length === 0 ? <section className="card"><p className="empty">Nothing new. <Link href="/parent/email?show=all">See all your emails</Link>.</p></section>
      : <div className={`ibx${sel ? " picked" : ""}`}>
        <nav className="ibx-list" aria-label="Emails">{list.map((r) => <div key={r.id} className={`ibx-row${r.read ? "" : " unread"}`} aria-current={r.id === sel?.id ? "true" : undefined}>
          <Link className="ibx-hit" href={`/parent/email?${qs}&m=${r.id}`} aria-label={`${r.read ? "" : "Unread: "}${r.subject}`} />
          <span className="ibx-top"><b>{school}</b><time dateTime={r.at}>{shortWhen(r.at)}</time></span>
          <span className="ibx-subj">{r.subject}</span>
          <span className="ibx-snip">{snip(r.body)}</span>
          <span className="ibx-tags"><span className="pill info">{label(r.tag)}</span></span>
        </div>)}</nav>
        {sel ? <div className="ibp" aria-label={`Email: ${sel.subject}`}>
          <div className="ibp-head">
            <div className="ibp-who"><b>{school}</b><span className="muted">to {f.email}</span></div>
            <span className="ibp-when"><Link className="abtn sm pri" href={`/parent/messages?new=1&subject=${encodeURIComponent(/^re:/i.test(sel.subject) ? sel.subject : `Re: ${sel.subject}`)}`}>Reply</Link>{fullWhen(sel.at)}</span>
          </div>
          <h3 className="ibp-subj">{sel.subject} <span className="pill info" style={{ fontSize: 12, verticalAlign: 2 }}>{label(sel.tag)}</span></h3>
          <div className="ibp-acts"><Link className="abtn sm ibp-back" href={`/parent/email?${qs}`}>← All emails</Link>
            {!f.viewer && <form action={parentEmailReadAction}><input type="hidden" name="id" value={sel.id} /><input type="hidden" name="show" value={show} /><button className="abtn sm" type="submit">Mark unread</button></form>}</div>
          <p className="ibp-orig first">{school} wrote · {fullWhen(sel.at)}</p>
          <div className="irp-mail pe-mail" dangerouslySetInnerHTML={{ __html: rich(sel.body) }} />
        </div> : <div className="ibp tml-empty"><b>Choose an email</b><span className="muted">Pick one on the left to read it.</span></div>}
      </div>}
  </>;
}
