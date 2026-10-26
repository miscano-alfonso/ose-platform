import Link from "next/link";
import { audiences, recipients, emailReady, history } from "@/lib/email";
import { automations } from "@/lib/automations";
import { Composer, NotConnected } from "../../Composer";

const when = (s: string) => new Date(s).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

export default async function Email({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; audience?: string; subject?: string; body?: string; tab?: string }> }) {
  const sp = await searchParams;
  const tab = ["auto", "compose", "sent"].includes(sp.tab ?? "") ? sp.tab! : sp.audience || sp.ok || sp.err ? "compose" : "auto";
  const ready = await emailReady();
  const TABS: [string, string][] = [["auto", "Automatic emails"], ["compose", "Send an email"], ["sent", "Sent"]];
  const head = <>
    <div className="top"><div><h1>Email</h1><div className="sub">Automatic emails, one-off messages to families, students or teachers, and everything sent.</div></div></div>
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
    const options = await Promise.all(auds.map(async (a) => ({ ...a, count: (await recipients(a.value)).length })));
    return <>{head}<Composer kind="message" options={options} ready={ready} draft={{ audience: sp.audience, subject: sp.subject, body: sp.body }} /></>;
  }
  const past = await history("message");
  return <>{head}
    {past.length === 0 ? <p className="empty">Nothing sent yet.</p> : <div className="tw"><table><thead><tr><th>When</th><th>To</th><th>Subject</th><th>Delivered</th><th>By</th></tr></thead>
      <tbody>{past.map((c) => <tr key={c.id}><td>{when(c.created_at)}</td><td>{c.audience_label}</td><td>{c.subject}</td>
        <td>{c.failed ? <span className="pill bad" title={c.error ?? ""}>{c.sent}/{c.recipients} sent</span> : <span className="pill good">{c.sent} sent</span>}</td><td>{c.by}</td></tr>)}</tbody></table></div>}
  </>;
}
