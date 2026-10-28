import { requireViewer } from "@/lib/auth";
import { myPay } from "@/lib/teacher-area";
import { dm, gbp } from "../fmt";

export const dynamic = "force-dynamic";
const PILL: Record<string, string> = { Paid: "good", Approved: "good", "Being checked": "info", "This term": "mute", Upcoming: "mute" };

export default async function MyPay() {
  const me = await requireViewer();
  const { rates, rows, tut } = await myPay(me.id);
  return <>
    <div className="top"><div><h1>My pay</h1><div className="sub">Open a term to see the lessons, 1:1s and workshops in it.</div></div></div>
    <div className="payx" role="table" aria-label="My pay by term">
      <div className="payx-h" role="row"><span role="columnheader">Term</span><span role="columnheader">Pay day</span><span role="columnheader" className="n">Lessons</span><span role="columnheader" className="n">Gross pay</span><span role="columnheader">Status</span></div>
      {rows.map((r) => <details key={r.id} className="payx-r">
        <summary role="row"><span><i className="chev" aria-hidden="true" />{r.name}</span><span>{dm(r.pay_date)}</span><span className="n">{r.lessons}</span>
          <span className="n">{r.gross || r.status !== "Upcoming" ? gbp(r.gross) : "—"}</span><span><span className={`pill ${PILL[r.status]}`}>{r.status}</span></span></summary>
        <div className="payx-b">{r.parts.length === 0 ? <p className="muted" style={{ margin: 0 }}>{r.status === "Upcoming" ? "Nothing taught yet this term." : "No lessons, 1:1s or workshops recorded for this term."}</p> :
          <table><tbody>{r.parts.map((p) => <tr key={p.label}><td>{p.label}</td><td className="n">{p.count} {p.unit}</td>
            <td className="n muted">{p.count ? `${gbp(Math.round(p.pay / p.count))} each` : ""}</td><td className="n"><b>{gbp(p.pay)}</b></td></tr>)}
            <tr className="tot"><td>Total</td><td className="n">{r.parts.reduce((n, p) => n + p.count, 0)}</td><td /><td className="n"><b>{gbp(r.parts.reduce((n, p) => n + p.pay, 0))}</b></td></tr></tbody></table>}
          {r.parts.length > 0 && r.parts.reduce((n, p) => n + p.pay, 0) !== r.gross && r.gross > 0 && <p className="muted" style={{ margin: "8px 0 0", fontSize: 14 }}>The gross pay above is the figure the office approved for this term.</p>}
        </div></details>)}
    </div>
    <div className="payx-notes">
      <p><b>Per lesson:</b> {rates.filter((r) => r.rate != null).map((r) => `${r.level} ${gbp(r.rate!)}`).join(" · ") || "rates not set yet"}</p>
      {tut.length > 0 && <p><b>1:1s:</b> {tut.map((t) => `${t.level} ${gbp(t.pay)}`).join(" · ")} per 45 minutes, paid with your lessons.</p>}
      <p>Gross pay. Covered lessons are paid to whoever taught them; cancelled lessons aren’t paid.</p>
      <p>This term’s figure grows as lessons are taught.</p>
    </div>
  </>;
}
