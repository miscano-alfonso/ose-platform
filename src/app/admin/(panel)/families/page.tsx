import Link from "next/link";
import LiveSearch from "../../LiveSearch";
import { familyList, contactLog, type FamState, type FamilyListRow } from "@/lib/families";
import { stopContactAction } from "../../actions";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";
const STATE: Record<FamState, [string, string]> = { failed: ["bad", "Payment failed"], overdue: ["warn", "Not recorded as paid"], unscheduled: ["info", "No payment schedule"],
  check: ["warn", "Needs a check"], paid: ["good", "Paid to date"], none: ["mute", "No courses"] };
const CR: Record<string, [string, string]> = { pending: ["info", "Waiting"], accepted: ["good", "Shared"], declined: ["mute", "Declined"], withdrawn: ["mute", "Withdrawn"], expired: ["mute", "Expired"], revoked: ["bad", "Stopped"] };
const day = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export default async function Families({ searchParams }: { searchParams: Promise<{ show?: string; q?: string; ok?: string; sort?: string }> }) {
  const sp = await searchParams;
  const [all, log] = await Promise.all([familyList(), contactLog()]);
  const q = (sp.q ?? "").toLowerCase().trim(), show = ["attention", "paid", "latest"].includes(sp.show ?? "") ? sp.show! : "all";
  const SORTS: Record<string, string> = { name: "Name A–Z", name_desc: "Name Z–A", courses: "Most courses", recent: "Newest booking", oldest: "Oldest booking" };
  const sort = sp.sort && SORTS[sp.sort] ? sp.sort : show === "latest" ? "recent" : "name";
  const byName = (a: FamilyListRow, b: FamilyListRow) => a.last_name.localeCompare(b.last_name) || a.name.localeCompare(b.name);
  const cmp: Record<string, (a: FamilyListRow, b: FamilyListRow) => number> = {
    name: byName, name_desc: (a, b) => byName(b, a), courses: (a, b) => b.courses - a.courses || byName(a, b),
    recent: (a, b) => (b.latest_on ?? "").localeCompare(a.latest_on ?? "") || byName(a, b), oldest: (a, b) => (a.first_on ?? "9999").localeCompare(b.first_on ?? "9999") || byName(a, b) };
  const list = all.filter((f) => (!q || [f.name, f.email, ...f.children.map((c) => c.first)].some((x) => x.toLowerCase().includes(q))) &&
    (show === "all" || (show === "latest" && f.latest_on) || (show === "attention" && ["failed", "overdue", "unscheduled", "check"].includes(f.state)) || (show === "paid" && f.state === "paid")))
    .sort(cmp[sort]);
  const ago = (d: string) => { const n = Math.round((Date.now() - Date.parse(d + "T12:00:00Z")) / 864e5); return n <= 0 ? "today" : n === 1 ? "yesterday" : n < 31 ? `${n} days ago` : n < 365 ? `${Math.round(n / 30.4)} months ago` : `${Math.round(n / 365)} yr ago`; };
  const kids = all.reduce((n, f) => n + f.children.length, 0);
  const href = (s: string, o?: string) => `/admin/families?${new URLSearchParams({ ...(s !== "all" ? { show: s } : {}), ...(sp.q ? { q: sp.q } : {}), ...(o ? { sort: o } : {}) })}`;
  const th = (label: string, a: string, b?: string, cls?: string) => { const on = sort === a || sort === b; const next = sort === a && b ? b : a;
    return <th className={cls} aria-sort={on ? (sort === a ? "ascending" : "descending") : undefined}><Link scroll={false} href={href(show, next)} className="thsort">{label}{on ? (sort === a ? " ↓" : " ↑") : ""}</Link></th>; };
  return <>
    <div className="top"><div><h1>Families</h1><div className="sub">{all.length} families · {kids} students · bookings come from the website</div></div>
      <span className="grow" /><Link className="abtn" href="/admin/import">Import families</Link></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
      <LiveSearch placeholder="Search parent, child or email" label="Search families" />
      <div className="segl" role="group" aria-label="Filter">{[["all", "All"], ["latest", "Latest bookings"], ["attention", "Needs attention"], ["paid", "Paid to date"]].map(([k, l]) =>
        <Link key={k} scroll={false} href={href(k)} aria-current={show === k ? "true" : undefined}>{l}</Link>)}</div>
      <form method="get" action="/admin/families" style={{ display: "flex", gap: 6, alignItems: "center" }}>{show !== "all" && <input type="hidden" name="show" value={show} />}{sp.q && <input type="hidden" name="q" value={sp.q} />}
        <label className="muted" htmlFor="fsort" style={{ fontSize: 14 }}>Sort</label><select id="fsort" name="sort" defaultValue={sort} className="mini">{Object.entries(SORTS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <button className="abtn sm" type="submit">Sort</button></form>
    </div>
    {all.some((f) => f.state === "overdue") && <p className="note" style={{ marginTop: 0 }}>“Not recorded as paid” means a term’s payment date has passed and this site hasn’t recorded the payment yet (payments made through TechSaga aren’t known here). <Link href="/admin/payments/stripe">Match payments from Stripe</Link></p>}
    <div className="tw"><table><thead><tr>{th("Parent", "name", "name_desc")}<th>Children</th>{th("Courses", "courses", undefined, "n")}{th("Latest booking", "recent", "oldest")}<th>Payments</th><th className="n">Next payment</th></tr></thead><tbody>
      {list.length === 0 ? <tr><td colSpan={6} className="muted" style={{ padding: 24, textAlign: "center" }}>{all.length ? "No families match." : "No families yet. Use Import families to bring them across from TechSaga."}</td></tr>
      : list.map((f) => <tr key={f.id} className="click">
        <td><Link href={`/admin/families/${f.id}`} className="rowlink"><b>{f.name}</b></Link><br /><span className="muted">{f.email}</span></td>
        <td>{f.children.map((k, i) => <div key={i}>{k.first} <span className="muted">{k.level}</span></div>)}</td>
        <td className="n">{f.courses}</td>
        <td>{f.latest_on ? <><b style={{ fontWeight: 500 }}>{day(f.latest_on)}</b> <span className="muted" style={{ fontSize: 13.5 }}>· {ago(f.latest_on)}</span><br /><span className="muted" style={{ fontSize: 13.5 }}>{f.latest_child}: {f.latest_course}</span>
          {f.first_on && f.first_on !== f.latest_on && <><br /><span className="muted" style={{ fontSize: 12.5 }}>with us since {new Date(f.first_on + "T12:00:00Z").toLocaleDateString("en-GB", { month: "short", year: "numeric" })}</span></>}</> : <span className="muted">—</span>}</td>
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
