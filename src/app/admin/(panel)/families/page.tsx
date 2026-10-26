import Link from "next/link";
import LiveSearch from "../../LiveSearch";
import { familyList, contactLog, type FamState } from "@/lib/families";
import { stopContactAction } from "../../actions";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";
const STATE: Record<FamState, [string, string]> = { failed: ["bad", "Payment failed"], overdue: ["warn", "Not recorded as paid"], unscheduled: ["info", "No payment schedule"],
  check: ["warn", "Needs a check"], paid: ["good", "Paid to date"], none: ["mute", "No courses"] };
const CR: Record<string, [string, string]> = { pending: ["info", "Waiting"], accepted: ["good", "Shared"], declined: ["mute", "Declined"], withdrawn: ["mute", "Withdrawn"], expired: ["mute", "Expired"], revoked: ["bad", "Stopped"] };
const day = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export default async function Families({ searchParams }: { searchParams: Promise<{ show?: string; q?: string; ok?: string }> }) {
  const sp = await searchParams;
  const [all, log] = await Promise.all([familyList(), contactLog()]);
  const q = (sp.q ?? "").toLowerCase().trim(), show = ["attention", "paid"].includes(sp.show ?? "") ? sp.show! : "all";
  const list = all.filter((f) => (!q || [f.name, f.email, ...f.children.map((c) => c.first)].some((x) => x.toLowerCase().includes(q))) &&
    (show === "all" || (show === "attention" && ["failed", "overdue", "unscheduled", "check"].includes(f.state)) || (show === "paid" && f.state === "paid")));
  const kids = all.reduce((n, f) => n + f.children.length, 0);
  const href = (s: string) => `/admin/families?${new URLSearchParams({ ...(s !== "all" ? { show: s } : {}), ...(sp.q ? { q: sp.q } : {}) })}`;
  return <>
    <div className="top"><div><h1>Families</h1><div className="sub">{all.length} families · {kids} students · bookings come from the website</div></div>
      <span className="grow" /><Link className="abtn" href="/admin/import">Import families</Link></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
      <LiveSearch placeholder="Search parent, child or email" label="Search families" />
      <div className="segl" role="group" aria-label="Filter">{[["all", "All"], ["attention", "Needs attention"], ["paid", "Paid to date"]].map(([k, l]) =>
        <Link key={k} scroll={false} href={href(k)} aria-current={show === k ? "true" : undefined}>{l}</Link>)}</div>
    </div>
    <div className="tw"><table><thead><tr><th>Parent</th><th>Children</th><th className="n">Courses</th><th>Payments</th><th className="n">Next payment</th></tr></thead><tbody>
      {list.length === 0 ? <tr><td colSpan={5} className="muted" style={{ padding: 24, textAlign: "center" }}>{all.length ? "No families match." : "No families yet. Use Import families to bring them across from TechSaga."}</td></tr>
      : list.map((f) => <tr key={f.id} className="click">
        <td><Link href={`/admin/families/${f.id}`} className="rowlink"><b>{f.name}</b></Link><br /><span className="muted">{f.email}</span></td>
        <td>{f.children.map((k, i) => <div key={i}>{k.first} <span className="muted">{k.level}</span></div>)}</td>
        <td className="n">{f.courses}</td>
        <td><span className={`pill ${STATE[f.state][0]}`}>{STATE[f.state][1]}</span>{f.checks > 1 && <span className="muted" style={{ fontSize: 13.5 }}> · {f.checks} to check</span>}</td>
        <td className="n">{f.next_on ? <>{money(f.next_due)}<br /><span className="muted">{day(f.next_on)}</span></> : "—"}</td></tr>)}
    </tbody></table></div>

    <section className="card" style={{ marginTop: 16 }}><h2>Parent-to-parent contact</h2>
      <p className="cs">Requests between parents of classmates. Details are shared only when the parent asked accepts. You can stop any sharing for safeguarding reasons. {log.accepting} of {log.total} families accept requests.</p>
      <div className="tw" style={{ border: 0, marginBottom: 0 }}><table><thead><tr><th>Sent</th><th>From</th><th>To</th><th>Class</th><th>Status</th><th /></tr></thead><tbody>
        {log.rows.length === 0 ? <tr><td colSpan={6} className="muted">None yet.</td></tr> : log.rows.map((r) => <tr key={r.id}><td>{day(r.sent)}</td>
          <td>{r.from_name}<br /><span className="muted">for {r.from_child}</span></td><td>{r.to_name}<br /><span className="muted">for {r.to_child}</span></td><td>{r.class}</td>
          <td><span className={`pill ${CR[r.status]?.[0] ?? "mute"}`}>{CR[r.status]?.[1] ?? r.status}</span>{r.revoked_by === "admin" && <span className="muted"> by admin</span>}</td>
          <td>{(r.status === "accepted" || r.status === "pending") && <form action={stopContactAction}><input type="hidden" name="id" value={r.id} /><button className="abtn sm" type="submit">Stop</button></form>}</td></tr>)}
      </tbody></table></div></section>
  </>;
}
