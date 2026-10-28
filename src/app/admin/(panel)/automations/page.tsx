import Link from "next/link";
import { automations, DEFS } from "@/lib/automations";
import { saveAutomationAction, runAutomationsAction } from "../../actions";
import { emailDesign, senderName } from "@/lib/email";
import { EmailPreview } from "../../EmailPreview";

export const dynamic = "force-dynamic";
const NAME = Object.fromEntries(DEFS.map((d) => [d.key, d.name]));

export default async function Automations({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; open?: string }> }) {
  const sp = await searchParams;
  const [{ rows, ready, recent }, design, from] = await Promise.all([automations(), emailDesign(), senderName()]);
  const vars = { parent: "Laura", child: "Sam", class: "KS3 Maths", date: "Tuesday 3 November", time: "16:00", teacher: "Becky", meet_link: "https://meet.google.com/abc-defg-hij",
    book_link: "ohsoed.co.uk/courses", amount: "£150.00", hours: "48", report: "Term 1 Progress Report", school: design.school };
  const on = rows.filter((r) => r.enabled).length;
  return <>
    <div className="top"><div><h1>Automations</h1><div className="sub">Emails that send themselves when something happens. Switch each one on, change the wording and timing, and send yourself a test first.</div></div>
      <span className="grow" /><form action={runAutomationsAction}><button className="abtn sm" type="submit">Check now</button></form></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    {!ready && <p className="note msg">Email isn’t connected yet, so nothing can send. Connect Brevo under <Link href="/admin/newsletter">Newsletter → Sending with Brevo</Link>.</p>}
    <div className="tiles">
      <div className="tile"><span className="k">Switched on</span><span className="v">{on}/{rows.length}</span><span className="h">automations</span></div>
      <div className="tile"><span className="k">Sent this week</span><span className="v">{rows.reduce((a, r) => a + r.sent7, 0)}</span><span className="h">emails</span></div>
      <div className="tile"><span className="k">Booked to send</span><span className="v">{rows.reduce((a, r) => a + r.scheduled, 0)}</span><span className="h">reminders in the next 2 days</span></div>
      <div className={`tile${rows.some((r) => r.failed7) ? " alert" : ""}`}><span className="k">Didn’t send</span><span className="v">{rows.reduce((a, r) => a + r.failed7, 0)}</span><span className="h">this week</span></div>
    </div>
    {rows.map((r) => <section className="card" key={r.key} id={r.key}>
      <details open={sp.open === r.key}>
        <summary style={{ cursor: "pointer", listStyle: "none", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span className={`pill ${r.enabled ? "good" : "mute"}`}>{r.enabled ? "On" : "Off"}</span>
          <div style={{ flex: 1, minWidth: 220 }}><b style={{ fontSize: 17 }}>{r.name}</b><div className="muted" style={{ fontSize: 14.5 }}>{r.when}{r.timing && r.minutes != null ? ` ${r.minutes} ${r.timing.label}.` : ""} To: {[r.to_parent && "parent", r.to_student && "student"].filter(Boolean).join(" and ")}.</div></div>
          <span className="muted" style={{ fontSize: 14 }}>{r.sent7} sent this week{r.scheduled ? ` · ${r.scheduled} booked` : ""}{r.failed7 ? ` · ${r.failed7} failed` : ""}</span>
          <span className="abtn sm">Edit</span>
        </summary>
        <form action={saveAutomationAction} className="cmp" style={{ marginTop: 14 }}><div className="cmp-main">
          <input type="hidden" name="key" value={r.key} />
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" name="enabled" defaultChecked={r.enabled} /> <b>Switched on</b></label>
            {r.timing && <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="number" name="minutes" min={0} defaultValue={r.minutes ?? r.timing.default} className="mini" style={{ width: 80 }} /> {r.timing.label}</label>}
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" name="to_parent" defaultChecked={r.to_parent} /> Parent</label>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" name="to_student" defaultChecked={r.to_student} /> Student (their Google account)</label>
          </div>
          <label className="fld">Subject<input name="subject" defaultValue={r.subject} maxLength={200} required className="mini" style={{ width: "100%" }} /></label>
          <label className="fld">Message<textarea name="body" defaultValue={r.body} rows={8} maxLength={5000} required className="mini" style={{ width: "100%" }} /></label>
          <p className="note" style={{ margin: 0 }}>You can use: {r.fields.map((f) => `{{${f}}}`).join(" ")}</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button className="abtn pri" type="submit">Save</button><button className="abtn" type="submit" name="test" value="1">Send me a test</button></div>
        </div><EmailPreview design={design} from={from} vars={vars} /></form>
      </details>
    </section>)}
    <section className="card"><h2>Recent emails</h2>
      {recent.length === 0 ? <p className="empty">Nothing sent yet.</p> : <div className="tw" style={{ border: 0, marginBottom: 0 }}><table><thead><tr><th>When</th><th>Automation</th><th>To</th><th>Status</th></tr></thead><tbody>
        {recent.map((s, i) => <tr key={i}><td className="mono">{s.at}</td><td>{NAME[s.key] ?? s.key}</td><td>{s.to}</td>
          <td><span className={`pill ${s.status === "sent" ? "good" : s.status === "scheduled" ? "info" : s.status === "failed" ? "bad" : "mute"}`} title={s.error ?? ""}>{s.status === "scheduled" ? "Booked" : s.status === "sent" ? "Sent" : s.status === "failed" ? "Didn’t send" : "Cancelled"}</span></td></tr>)}
      </tbody></table></div>}
      <p className="note">Timed emails (lesson reminders, taster links) are booked with Brevo up to 2 days ahead, so they arrive on the minute. If a lesson is cancelled, an absence is reported or a child leaves the class, the booked reminder is taken back. Each email goes once.</p></section>
  </>;
}
