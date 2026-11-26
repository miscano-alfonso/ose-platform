import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { automations } from "@/lib/automations";
import { approvals, approvalState, sampleVars, wordingHash } from "@/lib/automation-review";
import { emailDesign, senderName } from "@/lib/email";
import { approveAutomationAction } from "../../../actions";
import { EmailPreview } from "../../../EmailPreview";
import { AutoTabs } from "../AutoTabs";

export const dynamic = "force-dynamic";

const STATE = {
  approved: { pill: "good", text: "Approved" }, changed: { pill: "warn", text: "Changed since approved" },
  changes: { pill: "bad", text: "Changes asked for" }, none: { pill: "mute", text: "Not approved yet" },
} as const;
const fillIn = (t: string, v: Record<string, string>) => t.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => v[k] ?? m);
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

// 27 Nov: every automatic email as it will arrive, filled in with example details, to approve one by one.
export default async function ReviewAutomations({ searchParams }: { searchParams: Promise<{ show?: string; ok?: string }> }) {
  await requireStaff();
  const sp = await searchParams, show = sp.show === "todo" || sp.show === "done" ? sp.show : "all";
  const [{ rows }, ok, design, from] = await Promise.all([automations(), approvals(), emailDesign(), senderName()]);
  const base = (process.env.SITE_URL || "https://dev.ohsoed.co.uk").replace(/\/$/, "");
  const list = rows.map((r) => ({ ...r, hash: wordingHash(r), a: ok[r.key] })).map((r) => ({ ...r, st: approvalState(r.a, r.hash) }));
  const done = list.filter((r) => r.st === "approved").length, onUnapproved = list.filter((r) => r.enabled && r.st !== "approved").length;
  const shown = list.filter((r) => show === "all" || (show === "done" ? r.st === "approved" : r.st !== "approved"));
  return <>
    <div className="top"><div><h1>Automations</h1><div className="sub">Each automatic email as it will arrive, filled in with example details. Approve the ones that read right, or ask for changes with a note. If the wording, who it goes to or its timing changes later, it needs approving again.</div></div></div>
    <AutoTabs here="review" toApprove={list.length - done} />
    {sp.ok && <p className="note msg">{sp.ok}</p>}
    <div className="tiles">
      <div className="tile"><span className="k">Approved</span><span className="v">{done}/{list.length}</span><span className="h">emails</span></div>
      <div className="tile"><span className="k">To approve</span><span className="v">{list.length - done}</span><span className="h">not approved, changed or sent back</span></div>
      <div className={`tile${onUnapproved ? " alert" : ""}`}><span className="k">On but not approved</span><span className="v">{onUnapproved}</span><span className="h">switched on and sending</span></div>
    </div>
    <div className="segl" role="group" aria-label="Show" style={{ margin: "4px 0 16px" }}>
      {([["all", `All (${list.length})`], ["todo", `To approve (${list.length - done})`], ["done", `Approved (${done})`]] as const).map(([k, l]) =>
        <Link key={k} href={`/admin/automations/review${k === "all" ? "" : `?show=${k}`}`} aria-current={show === k ? "true" : undefined}>{l}</Link>)}
    </div>
    {shown.length === 0 && <p className="empty">{show === "todo" ? "Everything is approved." : "Nothing approved yet."}</p>}
    {shown.map((r) => { const s = STATE[r.st];
      const to = r.to_teacher ? "The class’s teacher" : [r.to_parent && "Parent", r.to_student && "Student (their Google account)"].filter(Boolean).join(" and ");
      return <section className={`card ar-card ar-${r.st}`} key={r.key} id={r.key}>
        <div className="ar-info">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><span className={`pill ${s.pill}`}>{s.text}</span><span className={`pill ${r.enabled ? "info" : "mute"}`}>{r.enabled ? "Switched on" : "Switched off"}</span></div>
          <h2 style={{ margin: "10px 0 6px" }}>{r.name}</h2>
          <dl className="ar-dl">
            <dt>Sends</dt><dd>{r.when}{r.timing && r.minutes != null ? ` ${r.minutes} ${r.timing.label}.` : ""}</dd>
            <dt>To</dt><dd>{to}</dd>
            <dt>Subject</dt><dd>{fillIn(r.subject, sampleVars(r.key, design.school, base))}</dd>
          </dl>
          {r.a && <p className="ar-who">{r.st === "approved" ? `Approved by ${r.a.by}, ${when(r.a.at)}.`
            : r.st === "changes" ? <>Changes asked for by {r.a.by}, {when(r.a.at)}: <q>{r.a.note}</q></>
            : `${r.a.status === "approved" ? "Approved" : "Sent back"} by ${r.a.by} on ${when(r.a.at)}, but the email has changed since.`}</p>}
          <div className="ar-acts">
            {r.st !== "approved" && <form action={approveAutomationAction}><input type="hidden" name="key" value={r.key} /><input type="hidden" name="show" value={show} /><input type="hidden" name="what" value="approve" />
              <button className="abtn pri" type="submit">Approve this email</button></form>}
            <Link className="abtn" href={`/admin/automations?open=${r.key}#${r.key}`}>Edit wording</Link>
            {r.a && <form action={approveAutomationAction}><input type="hidden" name="key" value={r.key} /><input type="hidden" name="show" value={show} /><input type="hidden" name="what" value="undo" />
              <button className="abtn sm" type="submit">{r.st === "approved" ? "Undo approval" : "Clear"}</button></form>}
          </div>
          {r.st !== "approved" && <details className="ar-ask"><summary>Ask for changes</summary>
            <form action={approveAutomationAction}><input type="hidden" name="key" value={r.key} /><input type="hidden" name="show" value={show} /><input type="hidden" name="what" value="changes" />
              <textarea name="note" rows={3} maxLength={1000} required placeholder="What should change? e.g. say “lesson” not “session”" className="mini" style={{ width: "100%" }} defaultValue={r.st === "changes" ? r.a?.note : ""} />
              <button className="abtn" type="submit">Ask for changes</button></form></details>}
        </div>
        <EmailPreview design={design} from={from} vars={sampleVars(r.key, design.school, base)} sample={{ subject: r.subject, body: r.body }} />
      </section>; })}
    <p className="note">Examples use made-up details (Laura and Sam). Real emails fill in each family’s own names, class, dates and links. “Send me a test” on the other tab sends one to your inbox.</p>
  </>;
}
