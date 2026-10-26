import { audiences, recipients, emailReady, history } from "@/lib/email";
import { Composer, NotConnected } from "../../Composer";

const when = (s: string) => new Date(s).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

export default async function Email({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; audience?: string; subject?: string; body?: string }> }) {
  const sp = await searchParams;
  const auds = await audiences();
  const options = await Promise.all(auds.map(async (a) => ({ ...a, count: (await recipients(a.value)).length })));
  const past = await history("message");
  const ready = await emailReady();
  return <>
    <div className="top"><div><h1>Email</h1><div className="sub">Send a message to every family, a level, a class or the teachers.</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    {!ready && <NotConnected />}
    <Composer kind="message" options={options} ready={ready} draft={{ audience: sp.audience, subject: sp.subject, body: sp.body }} />
    <h2 style={{ font: "600 20px Jost", margin: "22px 0 10px" }}>Sent</h2>
    {past.length === 0 ? <p className="empty">Nothing sent yet.</p> : <div className="tw"><table><thead><tr><th>When</th><th>To</th><th>Subject</th><th>Delivered</th><th>By</th></tr></thead>
      <tbody>{past.map((c) => <tr key={c.id}><td>{when(c.created_at)}</td><td>{c.audience_label}</td><td>{c.subject}</td>
        <td>{c.failed ? <span className="pill bad" title={c.error ?? ""}>{c.sent}/{c.recipients} sent</span> : <span className="pill good">{c.sent} sent</span>}</td><td>{c.by}</td></tr>)}</tbody></table></div>}
  </>;
}
