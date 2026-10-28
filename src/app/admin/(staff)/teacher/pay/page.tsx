import { requireViewer } from "@/lib/auth";
import { myPay } from "@/lib/teacher-area";
import { dm, gbp } from "../fmt";

export const dynamic = "force-dynamic";
const PILL: Record<string, string> = { Paid: "good", Approved: "good", "Being checked": "info", "This term": "mute", Upcoming: "mute" };

export default async function MyPay() {
  const me = await requireViewer();
  const { rates, rows, tut, levels } = await myPay(me.id);
  return <>
    <div className="top"><div><h1>My pay</h1><div className="sub">Lessons at each level, 1:1s and workshops, and anything else added, for each term.</div></div></div>
    <div className="tw"><table><thead><tr><th>Term</th><th>Pay day</th>{levels.map((l) => <th key={l} className="n">{l}</th>)}<th className="n">1:1s &amp; workshops</th><th className="n">Other</th><th className="n">Gross pay</th><th>Status</th></tr></thead>
      <tbody>{rows.map((r) => { const none = r.status === "Upcoming" && !r.gross; return <tr key={r.id}><td>{r.name}</td><td>{dm(r.pay_date)}</td>
        {levels.map((l) => <td key={l} className="n">{none ? "—" : r.by_level[l] ?? 0}</td>)}
        <td className="n" title={r.extras ? gbp(r.extras_pay) : undefined}>{r.extras ? `${r.extras} · ${gbp(r.extras_pay)}` : "—"}</td>
        <td className="n" title={r.adj_note ?? undefined}>{r.adj ? gbp(r.adj) : "—"}</td>
        <td className="n"><b>{none ? "—" : gbp(r.gross)}</b></td><td><span className={`pill ${PILL[r.status]}`}>{r.status}</span></td></tr>; })}</tbody></table></div>
    <div className="payx-notes">
      <p><b>Per lesson:</b> {rates.filter((r) => r.rate != null).map((r) => `${r.level} ${gbp(r.rate!)}`).join(" · ") || "rates not set yet"}</p>
      {tut.length > 0 && <p><b>1:1s:</b> {tut.map((t) => `${t.level} ${gbp(t.pay)}`).join(" · ")} per 45 minutes, paid with your lessons.</p>}
      <p>Gross pay, the same figures the office sees in Payroll. Every lesson that isn’t cancelled is paid to whoever taught it; covered lessons go to the cover teacher.</p>
      <p>This term’s figure grows as lessons are taught.</p>
    </div>
  </>;
}
