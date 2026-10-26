import { requireViewer } from "@/lib/auth";
import { myPay } from "@/lib/teacher-area";
import { dm, gbp } from "../fmt";

export const dynamic = "force-dynamic";
const PILL: Record<string, string> = { Paid: "good", Approved: "good", "Being checked": "info", "This term": "mute", Upcoming: "mute" };

export default async function MyPay() {
  const me = await requireViewer();
  const { rates, rows, tut } = await myPay(me.id);
  return <>
    <div className="top"><div><h1>My pay</h1><div className="sub">Per lesson: {rates.filter((r) => r.rate != null).map((r) => `${r.level} ${gbp(r.rate!)}`).join(" · ") || "rates not set yet"}</div></div></div>
    <div className="tw"><table><thead><tr><th>Term</th><th>Pay day</th><th className="n">Lessons</th><th className="n">Gross pay</th><th>Status</th></tr></thead><tbody>
      {rows.map((r) => <tr key={r.id}><td>{r.name}</td><td>{dm(r.pay_date)}</td><td className="n">{r.lessons}</td><td className="n">{r.gross || r.status !== "Upcoming" ? gbp(r.gross) : "—"}</td>
        <td><span className={`pill ${PILL[r.status]}`}>{r.status}</span></td></tr>)}
    </tbody></table></div>
    <p className="note" style={{ marginTop: 8 }}>Gross pay. Covered lessons are paid to whoever taught them; cancelled lessons aren’t paid. This term’s figure grows as lessons are taught.
      {tut.length ? ` 1:1s: ${tut.map((t) => `${t.level} ${gbp(t.pay)}`).join(" · ")} per 45 minutes, paid with your lessons.` : ""}</p>
  </>;
}
