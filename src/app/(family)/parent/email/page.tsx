import Link from "next/link";
import { requireParent } from "@/lib/family-auth";
import { withSchool } from "@/lib/db";
import { Head } from "../../fmt";

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
const when = (s: string) => new Date(s).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

export default async function ParentEmail() {
  const f = await requireParent();
  const rows = await withSchool((q) => q<{ id: string; subject: string; body: string; tag: string | null; at: string }>(`select id::text, subject, body, tag, coalesce(scheduled_for, sent_at)::text as at
    from email_log where to_email = $1 and coalesce(scheduled_for, sent_at) <= now() order by coalesce(scheduled_for, sent_at) desc limit 150`, [f.email.toLowerCase()])).catch(() => []);
  return <>
    <Head title="Email" sub={`Emails the school has sent you at ${f.email}, newest first`}><Link className="abtn" href="/parent/messages">Messages</Link></Head>
    <section className="card">{rows.length === 0 ? <p className="empty">No emails here yet. Emails from the school show here from 27 November 2026.</p>
      : rows.map((r, i) => <details key={r.id} className="li as-item pe-item" open={i === 0 && rows.length === 1}>
        <summary><span className="pe-ico" aria-hidden="true"><svg viewBox="0 0 20 20" width="16" height="16"><path d="M3 5h14v10H3z M3 5.5l7 5.5 7-5.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg></span>
          <div className="t"><b>{r.subject}</b><span>{label(r.tag)} · {when(r.at)}</span></div>
          <svg className="as-chev" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M6 8l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></summary>
        <div className="pe-body" dangerouslySetInnerHTML={{ __html: rich(r.body) }} /></details>)}</section>
    <p className="note">To answer one, reply to it in your own email, or write to us in <Link href="/parent/messages">Messages</Link>.</p>
  </>;
}
