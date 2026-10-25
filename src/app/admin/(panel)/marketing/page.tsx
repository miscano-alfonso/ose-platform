import { recipients, emailReady, history } from "@/lib/email";
import { withSchool } from "@/lib/db";
import { Composer, NotConnected } from "../../Composer";

const when = (s: string) => new Date(s).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

export default async function Marketing({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const [list, past, stats] = await Promise.all([recipients("marketing"), history("marketing"),
    withSchool(async (q) => (await q<{ parents: number; opted: number }>(`select count(*)::int as parents, count(*) filter (where marketing_opt_in)::int as opted from parents`))[0])]);
  const ready = emailReady();
  return <>
    <div className="top"><div><h1>Marketing</h1><div className="sub">{list.length} people have agreed to marketing emails ({stats.opted} of {stats.parents} account holders).</div></div>
      <span className="grow" />{list.length > 0 && <a className="abtn sm" href="/admin/marketing-export">Download the list (CSV)</a>}</div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    <p className="note">Only people who ticked “send me news and offers” are on this list (UK GDPR / PECR). Families imported from TechSaga join it once they agree in their account or at checkout. Use Email for messages about lessons, which every family gets.</p>
    {!ready && <NotConnected />}
    {list.length === 0 ? <p className="empty">No one has agreed to marketing emails yet.</p> :
      <Composer kind="marketing" options={[{ value: "marketing", label: "Everyone who agreed to marketing", count: list.length }]} ready={ready} />}
    <h2 style={{ font: "600 20px Jost", margin: "22px 0 10px" }}>Sent newsletters</h2>
    {past.length === 0 ? <p className="empty">Nothing sent yet.</p> : <div className="tw"><table><thead><tr><th>When</th><th>Subject</th><th>Delivered</th><th>By</th></tr></thead>
      <tbody>{past.map((c) => <tr key={c.id}><td>{when(c.created_at)}</td><td>{c.subject}</td><td>{c.sent}/{c.recipients}</td><td>{c.by}</td></tr>)}</tbody></table></div>}
  </>;
}
