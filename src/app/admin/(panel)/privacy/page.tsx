import Link from "next/link";
import { privacyOverview } from "@/lib/privacy";
import { addPrivReqAction, closePrivReqAction, eraseFamilyAction, runRetentionAction, setRetentionAction, addBreachAction, breachStepAction, addProcessorAction, setDpaAction } from "../../actions";

export const dynamic = "force-dynamic";
const dm = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const KIND: Record<string, string> = { access: "Copy of their data", erasure: "Delete their data", rectification: "Correct their data", restriction: "Restrict use", objection: "Objection", portability: "Data to take elsewhere" };
const WHAT: Record<string, string> = { send_details: "SEND details", student_chat: "Student chat", family_export: "Family data export" };
const KEPT: Record<string, string> = { enquiry: "Enquiries", waitlist: "Waiting-list sign-ups", taster: "Taster bookings", email_code: "Email sign-in codes", meet_session: "Google Meet joins", student_chat: "Student chat messages",
  parent_message: "Parent–teacher messages", send_details: "SEND details", access_log: "Who viewed sensitive data", student_record: "Student records (attendance, reports)", financial: "Payment records" };
const days = (d: string) => Math.ceil((Date.parse(d + "T23:59:59Z") - Date.now()) / 864e5);

export default async function Privacy({ searchParams }: { searchParams: Promise<{ tab?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const d = await privacyOverview();
  const open = d.requests.filter((r) => r.status === "open");
  const tab = ["requests", "access", "retention", "breaches", "processors"].includes(sp.tab ?? "") ? sp.tab! : "requests";
  const TABS: [string, string][] = [["requests", `Rights requests${open.length ? ` (${open.length})` : ""}`], ["access", "Who viewed what"], ["retention", "Retention"], ["breaches", "Breach log"], ["processors", "Suppliers"]];
  const dpaOn = d.processors.filter((p) => p.dpa).length;
  return <>
    <div className="top"><div><h1>Data protection</h1><div className="sub">Rights requests, retention, access to sensitive data, incidents and suppliers</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    <div className="tiles">
      <div className={`tile${open.some((r) => days(r.due) <= 7) ? " alert" : ""}`}><span className="k">Open requests</span><span className="v">{open.length}</span><span className="h">{open[0] ? `next due ${dm(open[0].due)}` : "one month to reply"}</span></div>
      <div className="tile"><span className="k">Sensitive data views</span><span className="v">{d.accessCount}</span><span className="h">SEND details and chats, logged</span></div>
      <div className={`tile${d.processors.length && dpaOn < d.processors.length ? " alert" : ""}`}><span className="k">Supplier agreements</span><span className="v">{dpaOn}/{d.processors.length}</span><span className="h">on file</span></div>
      <div className="tile"><span className="k">Incidents</span><span className="v">{d.breaches.length}</span><span className="h">in the breach log</span></div>
    </div>
    <div className="segl" role="tablist" style={{ marginBottom: 14 }}>{TABS.map(([k, l]) => <Link key={k} href={`/admin/privacy?tab=${k}`} aria-current={tab === k ? "true" : undefined}>{l}</Link>)}</div>

    {tab === "requests" && <>
      <section className="card">{d.requests.length === 0 ? <p className="empty">No requests.</p> : d.requests.map((r) => { const n = days(r.due); return <div className="li" key={r.id} style={{ flexWrap: "wrap" }}>
        <span className={`pill ${r.status !== "open" ? "good" : n <= 7 ? "bad" : "info"}`}>{r.status === "done" ? "Done" : r.status === "refused" ? "Refused" : n < 0 ? "Overdue" : `${n} days left`}</span>
        <div className="t"><b>{KIND[r.kind]} · {r.family ?? r.email}</b><span>Received {dm(r.received)} · reply by {dm(r.due)}{r.detail ? ` · “${r.detail}”` : ""}{r.outcome ? ` · ${r.outcome}` : ""}</span></div>
        {r.status === "open" && <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(r.kind === "access" || r.kind === "portability") && r.parent_id && <a className="abtn sm" href={`/admin/privacy-export?family=${r.parent_id}`}>Download the family’s data</a>}
          {r.kind === "erasure" && r.parent_id && <form action={eraseFamilyAction} style={{ display: "flex", gap: 4 }}><input type="hidden" name="id" value={r.id} /><input name="confirm" className="mini" placeholder="Type ERASE" style={{ width: 100 }} /><button className="abtn sm danger" type="submit">Erase family</button></form>}
          <form action={closePrivReqAction}><input type="hidden" name="id" value={r.id} /><button className="abtn sm" type="submit">Mark done</button></form>
          <form action={closePrivReqAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value="refused" /><button className="abtn sm" type="submit">Refuse</button></form></div>}
      </div>; })}</section>
      <section className="card"><h2>Record a request</h2><form action={addPrivReqAction} className="eform">
        <label className="fld">Family<select name="family" defaultValue=""><option value="">Not a current family</option>{d.families.map((f) => <option key={f.id} value={f.id}>{f.name} ({f.email})</option>)}</select></label>
        <label className="fld">Requester’s email<input name="email" type="email" required /></label>
        <label className="fld">They asked for<select name="kind">{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="fld">Details<input name="detail" maxLength={500} style={{ width: 260 }} /></label>
        <button className="abtn pri" type="submit">Record</button></form></section>
      <p className="note">Check the requester’s identity before sending data. The deadline can be extended by two months for complex requests; tell the family why within the first month. Erasure removes or anonymises everything except payment records, which the law says to keep for six years (without names).</p></>}

    {tab === "access" && <><div className="tw"><table><thead><tr><th>When</th><th>Who</th><th>Viewed</th><th>Student</th><th>Why</th></tr></thead><tbody>
      {d.access.length === 0 ? <tr><td colSpan={5} className="muted">Nothing viewed yet.</td></tr> : d.access.map((a, i) => <tr key={i}><td className="mono">{a.at}</td><td>{a.who ?? "—"}</td><td>{WHAT[a.what] ?? a.what}</td><td>{a.student ?? "—"}</td><td>{a.reason ?? ""}</td></tr>)}
    </tbody></table></div><p className="note">Every view of a child’s SEND details, a student chat or a family data export is recorded and kept for 2 years.</p></>}

    {tab === "retention" && <><div className="tw"><table><thead><tr><th>Data</th><th className="n">Kept for</th><th>After</th></tr></thead><tbody>
      {d.retention.map((r) => <tr key={r.data_kind}><td>{KEPT[r.data_kind] ?? r.data_kind}</td>
        <td className="n"><form action={setRetentionAction} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><input type="hidden" name="kind" value={r.data_kind} />
          <input type="number" name="months" min={0} max={240} defaultValue={r.keep_months} className="mini" style={{ width: 64, textAlign: "right" }} aria-label="Months" /> months <button className="abtn sm" type="submit">Save</button></form></td>
        <td>{r.after_event}</td></tr>)}
    </tbody></table></div>
      <form action={runRetentionAction} style={{ display: "flex", gap: 8, alignItems: "center" }}><button className="abtn" type="submit">Run the clean-up now</button><span className="note">Deletes what has passed its retention period.</span></form></>}

    {tab === "breaches" && <>
      <section className="card">{d.breaches.length === 0 ? <p className="empty">No incidents recorded.</p> : d.breaches.map((b) => <div className="li" key={b.id} style={{ flexWrap: "wrap" }}>
        <span className={`pill ${b.risk === "unlikely" ? "mute" : "bad"}`}>{b.risk === "unlikely" ? "Low risk" : b.risk === "high_risk" ? "High risk" : "Report to ICO"}</span>
        <div className="t"><b>{b.what}</b><span>Found {dm(b.found)} · {b.data}{b.risk !== "unlikely" ? (b.ico ? ` · ICO told ${dm(b.ico)}` : ` · report by ${dm(new Date(Date.parse(b.found) + 3 * 864e5).toISOString().slice(0, 10))}`) : ""}{b.told ? ` · families told ${dm(b.told)}` : ""}{b.closed ? ` · closed ${dm(b.closed)}` : ""}</span></div>
        {!b.closed && <div style={{ display: "flex", gap: 6 }}>{b.risk !== "unlikely" && !b.ico && <Step id={b.id} step="ico" label="Reported to the ICO" />}{b.risk === "high_risk" && !b.told && <Step id={b.id} step="told" label="Families told" />}
          {(b.risk === "unlikely" || b.ico) && <Step id={b.id} step="closed" label="Close" />}</div>}</div>)}</section>
      <section className="card"><h2>Record an incident</h2><form action={addBreachAction} className="eform">
        <label className="fld">What happened<input name="what" required maxLength={500} placeholder="e.g. Confirmation email sent to the wrong address" style={{ width: 320 }} /></label>
        <label className="fld">Data involved<input name="data" required maxLength={300} placeholder="e.g. Parent name, child’s courses" style={{ width: 240 }} /></label>
        <label className="fld">People affected<input name="people" type="number" min={0} style={{ width: 90 }} /></label>
        <label className="fld">Risk to the people involved<select name="risk"><option value="unlikely">Unlikely to cause harm (log only)</option><option value="risk">Could cause harm (tell the ICO within 72 hours)</option><option value="high_risk">High risk (tell the ICO and the families)</option></select></label>
        <button className="abtn pri" type="submit">Record</button></form></section></>}

    {tab === "processors" && <>
      <div className="tw"><table><thead><tr><th>Supplier</th><th>Used for</th><th>Where</th><th>Safeguard</th><th>Agreement</th></tr></thead><tbody>
        {d.processors.length === 0 ? <tr><td colSpan={5} className="muted">No suppliers listed yet.</td></tr> : d.processors.map((p) => <tr key={p.id}><td><b>{p.name}</b><div className="muted" style={{ fontSize: 13.5 }}>{p.data}</div></td><td>{p.purpose}</td><td>{p.location}</td><td>{p.safeguard ?? "—"}</td>
          <td><form action={setDpaAction} style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}><input type="hidden" name="id" value={p.id} />
            {p.dpa ? <span className="pill good">On file {dm(p.dpa)}</span> : <span className="pill warn">Needed</span>}
            <input type="date" name="on" defaultValue={p.dpa ?? ""} className="mini" aria-label="Agreement signed on" /><button className="abtn sm" type="submit">Save</button></form></td></tr>)}
      </tbody></table></div>
      {d.processors.length === 0 && <form action={addProcessorAction} style={{ marginBottom: 12 }}><input type="hidden" name="usual" value="1" /><button className="abtn pri" type="submit">Add the suppliers this site uses</button> <span className="note">Vercel, Neon, Stripe, Brevo, Google Workspace, Anthropic</span></form>}
      <section className="card"><h2>Add a supplier</h2><form action={addProcessorAction} className="eform">
        <label className="fld">Name<input name="name" required maxLength={80} /></label><label className="fld">Used for<input name="purpose" required maxLength={200} /></label>
        <label className="fld">Data<input name="data" required maxLength={200} /></label><label className="fld">Where<input name="location" required maxLength={80} /></label>
        <label className="fld">Safeguard<input name="safeguard" maxLength={120} placeholder="e.g. UK IDTA" /></label><label className="fld">Agreement signed<input type="date" name="dpa" /></label>
        <button className="abtn" type="submit">Add</button></form></section></>}
  </>;
}

function Step({ id, step, label }: { id: string; step: string; label: string }) {
  return <form action={breachStepAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="step" value={step} /><button className="abtn sm" type="submit">{label}</button></form>;
}
