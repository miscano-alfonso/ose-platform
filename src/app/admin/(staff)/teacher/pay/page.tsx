import { requireViewer } from "@/lib/auth";
import { myPay, myPayItems } from "@/lib/teacher-area";
import { dm, dlong, hm, gbp } from "../fmt";

export const dynamic = "force-dynamic";
const PILL: Record<string, string> = { Paid: "good", Approved: "good", "Being checked": "info", "This term": "mute", Upcoming: "mute" };

// My pay (1 Nov: itemised). The table gives each term's totals; under it, every term with anything in it is broken down:
// lessons by class (how many × the rate), each 1:1 and workshop, and anything the office added, adding up to the gross.
export default async function MyPay() {
  const me = await requireViewer();
  const [{ rates, rows, tut, levels }, items] = await Promise.all([myPay(me.id), myPayItems(me.id)]);
  const shown = rows.filter((r) => r.gross || r.adj || items[r.id]?.lessons.length || items[r.id]?.extras.length);
  const link = (id: string, body: React.ReactNode) => shown.some((r) => r.id === id) ? <a className="lnk" href={`#t-${id}`}>{body}</a> : body;
  return <>
    <div className="top"><div><h1>My pay</h1><div className="sub">Lessons at each level, 1:1s and workshops, and anything else added, for each term. Every item is listed below the table.</div></div></div>
    <div className="tw"><table><thead><tr><th>Term</th><th>Pay day</th>{levels.map((l) => <th key={l} className="n">{l}</th>)}<th className="n">1:1s &amp; workshops</th><th className="n">Other</th><th className="n">Gross pay</th><th>Status</th></tr></thead>
      <tbody>{rows.map((r) => { const none = r.status === "Upcoming" && !r.gross; return <tr key={r.id}><td>{link(r.id, r.name)}</td><td>{dm(r.pay_date)}</td>
        {levels.map((l) => <td key={l} className="n">{none ? "—" : r.by_level[l] ?? 0}</td>)}
        <td className="n">{r.extras ? link(r.id, `${r.extras} · ${gbp(r.extras_pay)}`) : "—"}</td>
        <td className="n">{r.adj ? link(r.id, gbp(r.adj)) : "—"}</td>
        <td className="n"><b>{none ? "—" : link(r.id, gbp(r.gross))}</b></td><td><span className={`pill ${PILL[r.status]}`}>{r.status}</span></td></tr>; })}</tbody></table></div>
    <div className="payx-notes">
      <p><b>Per lesson:</b> {rates.filter((r) => r.rate != null).map((r) => `${r.level} ${gbp(r.rate!)}`).join(" · ") || "rates not set yet"}</p>
      {tut.length > 0 && <p><b>1:1s:</b> {tut.map((t) => `${t.level} ${gbp(t.pay)}`).join(" · ")} per 45 minutes, paid with your lessons.</p>}
      <p>Gross pay, the same figures the office sees in Payroll. Every lesson that isn’t cancelled is paid to whoever taught it; covered lessons go to the cover teacher.</p>
      <p>This term’s figure grows as lessons are taught.</p>
    </div>

    {shown.map((r) => { const it = items[r.id] ?? { lessons: [], extras: [] };
      const lessonPay = it.lessons.reduce((a, l) => a + l.pay, 0), extraPay = it.extras.reduce((a, x) => a + x.pay, 0), sum = lessonPay + extraPay + r.adj;
      const ongoing = r.status === "This term";
      const head = <><h2>{r.name}</h2><span className="muted">Pay day {dm(r.pay_date)}</span><span className={`pill ${PILL[r.status]}`}>{r.status}</span><span className="grow" /><b className="payi-total">{gbp(r.gross)}</b></>;
      const body = <>
        <div className="tw"><table className="payi-t"><thead><tr><th>Item</th><th className="n">How many</th><th className="n">Rate</th><th className="n">Pay</th></tr></thead><tbody>
          {it.lessons.length > 0 && <tr className="payi-sec"><td colSpan={4}>Lessons</td></tr>}
          {it.lessons.map((l) => <tr key={`${l.cls}-${l.cover}-${l.rate}`}><td>{l.cls}{l.cover && <span className="pill mute" style={{ marginLeft: 6 }}>Cover</span>}
            {ongoing && l.taught < l.n && <div className="muted payi-sub">{l.taught} taught so far, {l.n - l.taught} to come</div>}</td>
            <td className="n">{l.n}</td><td className="n">{gbp(l.rate)}</td><td className="n">{gbp(l.pay)}</td></tr>)}
          {it.extras.length > 0 && <tr className="payi-sec"><td colSpan={4}>1:1s &amp; workshops</td></tr>}
          {it.extras.map((x) => <tr key={x.at + x.what}><td><b>{dlong(x.at)}, {hm(x.at)}</b> · {x.kind === "1:1" ? "1:1" : "Workshop"}: {x.what}
            {x.status === "no_show" && <div className="muted payi-sub">The student didn’t come; paid as booked</div>}</td>
            <td className="n">{x.minutes} min</td><td className="n">—</td><td className="n">{gbp(x.pay)}</td></tr>)}
          {r.adj !== 0 && <><tr className="payi-sec"><td colSpan={4}>Other</td></tr>
            <tr><td>{r.adj_note || "Added by the office"}</td><td className="n">—</td><td className="n">—</td><td className="n">{gbp(r.adj)}</td></tr></>}
          <tr className="payi-sum"><td colSpan={3}>Gross pay{r.status === "Approved" || r.status === "Paid" ? " (as approved)" : ""}</td><td className="n">{gbp(r.gross)}</td></tr>
        </tbody></table></div>
        {sum !== r.gross && <p className="note" style={{ margin: "8px 0 0" }}>The items add up to {gbp(sum)}; the approved figure is {gbp(r.gross)} because lessons changed after the office approved this term. Ask the office if anything looks wrong.</p>}</>;
      // terms still to come are what's planned so far: folded, open one to see it
      return r.status === "Upcoming"
        ? <details key={r.id} className="card payi" id={`t-${r.id}`} open={it.extras.length > 0 || r.adj !== 0}><summary className="payi-head">{head}</summary>{body}</details>
        : <section key={r.id} className="card payi" id={`t-${r.id}`}><div className="payi-head">{head}</div>{body}</section>; })}
  </>;
}
