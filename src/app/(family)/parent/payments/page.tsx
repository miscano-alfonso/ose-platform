import { requireParent } from "@/lib/family-auth";
import { familyDetail, cancelPreview, swapOptions } from "@/lib/families";
import { parentCancelAction, parentSwapAction, startPayMethodAction } from "../../actions";
import { payAccess, payMethod } from "@/lib/stripe-pay";
import { Head, Flash, gbp, dm } from "../../fmt";
import { paymentHistory, latePayments } from "@/lib/family";
import { PrintButton } from "../../PrintButton";

const PAID = new Set(["paid", "refunded", "part_refunded"]);
const CELL: Record<string, [string, string]> = { paid: ["good", "Paid"], scheduled: ["mute", "Due"], processing: ["info", "Processing"], failed: ["bad", "Failed"], refunded: ["info", "Refunded"],
  part_refunded: ["info", "Part refund"], cancelled: ["mute", "Not charged"], waived: ["mute", "Waived"] };
export default async function Payments({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const [sp, f] = await Promise.all([searchParams, requireParent()]);
  const [d, hist] = await Promise.all([familyDetail(f.id), paymentHistory(f.id)]);
  if (!d) return null;
  const live = d.children.flatMap((c) => c.courses).filter((c) => c.status === "active" && !c.notice_given_on);
  const [pre, sw] = await Promise.all([Promise.all(live.map((c) => cancelPreview(c.id))), Promise.all(live.map((c) => swapOptions(c.id)))]);
  const X = Object.fromEntries(live.map((c, i) => [c.id, { pre: pre[i], sw: sw[i] }]));
  // 11 Nov: how the family pays each term: Direct Debit (or card, when the school allows it), set up on Stripe's secure page
  const online = await payAccess(f.email).catch(() => false);
  const pm = online ? await payMethod(f.id) : null;
  const setUp = pm && pm.status !== "none" && pm.status !== "inactive";
  // 27 Nov (Alfonso): late payments (declined or rejected; or, where we collect, past their date) are listed first
  const collects = online && (await import("@/lib/stripe-pay").then((m) => m.payStatus()).then((x) => x.collect).catch(() => false));
  const late = await latePayments(f.id, collects);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const lateCell = (c: { status: string; due_on: string }) => c.status === "failed" || (collects && c.status === "scheduled" && c.due_on < today);
  const counts = (c: { status: string } | null) => !!c && c.status !== "cancelled" && c.status !== "waived";
  const termSum = (courses: { cells: ({ status: string; amount: number; refunded: number } | null)[] }[], i: number) => courses.reduce((a, c) => a + (counts(c.cells[i]) ? c.cells[i]!.amount - c.cells[i]!.refunded : 0), 0);
  const allCourses = d ? d.children.flatMap((c) => c.courses) : [];
  return <>
    <Head title="Payments" sub={online ? "Each term’s payment for all your children’s courses is collected automatically, by Direct Debit" : "Each course is paid in one payment per term, taken from your saved card"} />
    <Flash sp={sp} />
    {pm && <section className="card pm-how" id="how">
      <div><h3 style={{ margin: "0 0 4px", font: "600 18px Jost, sans-serif" }}>How you pay each term</h3>
        {setUp ? <p style={{ margin: 0 }}><b>{pm.method === "bacs" ? "Direct Debit" : "Card"}</b> · {pm.label}{pm.status === "pending" ? <> · <span className="pill info">Being set up by your bank</span></> : <> · <span className="pill good">Active</span></>}
          <span className="muted" style={{ display: "block", fontSize: 14, marginTop: 4 }}>{pm.method === "bacs" ? "Each term’s payment is collected on its payment date and takes about 3 working days to reach us. Stripe, who handle payments for us, email you before each collection." : "Each term’s payment is taken from this card on its payment date."}</span></p>
        : <p style={{ margin: 0 }}>{pm.status === "inactive" ? <><span className="pill bad">Direct Debit cancelled</span> Your Direct Debit was cancelled at your bank. Please set it up again so your termly payments can be collected.</> : "Please set up a Direct Debit so each term’s payment is collected automatically. It takes a couple of minutes on Stripe’s secure page; your bank details never come to us."}</p>}
        {!setUp && <p className="muted" style={{ fontSize: 13.5, margin: "8px 0 0" }}>Your payments are protected by the <a href="https://www.directdebit.co.uk/direct-debit-explained/direct-debit-guarantee/" target="_blank" rel="noopener">Direct Debit Guarantee</a>.</p>}</div>
      <div className="pm-btns">
        <form action={startPayMethodAction}><input type="hidden" name="kind" value="bacs" /><button className="abtn pri" type="submit">{setUp && pm.method === "bacs" ? "Change bank account" : "Set up Direct Debit"}</button></form>
        {pm.card_allowed && <form action={startPayMethodAction}><input type="hidden" name="kind" value="card" /><button className="abtn" type="submit">{setUp && pm.method === "card" ? "Change card" : "Pay by card instead"}</button></form>}
      </div></section>}
    {late.length > 0 && <section className="card pay-late" id="late"><h2 style={{ margin: "0 0 4px" }}>Overdue</h2>
      {late.map((l) => <div key={l.due} className="pay-late-row">
        <div><b>{l.term} payment of {gbp(l.amount)}</b> <span className="muted">· due {dm(l.due)}</span>
          <p style={{ margin: "4px 0 0" }}>{l.failed ? <>Your bank or card declined it{l.reason ? ` (${l.reason.replace(/\.$/, "")})` : ""}.{l.retry ? <> We’ll try again on <b>{dm(l.retry)}</b>.</> : ""}</> : "We haven’t been able to take this payment yet."}</p>
          <ul className="pay-lines">{l.lines.map((x, k) => <li key={k}><span>{x.who}: {x.what}</span><span>{gbp(x.amount)}</span></li>)}</ul></div>
      </div>)}
      <div className="pay-late-acts">{pm && <a className="abtn pri sm" href="#how">Update how you pay</a>}<a className="abtn sm" href="/parent/messages?new=1">Message us</a></div></section>}
    <div className="tiles"><div className="tile"><span className="k">Paid this year</span><span className="v" style={{ fontSize: 26 }}>{gbp(d.paid)}</span></div>
      <div className="tile"><span className="k">Still to pay</span><span className="v" style={{ fontSize: 26 }}>{gbp(d.toPay)}</span></div>
      {d.failed > 0 && late.length === 0 && <div className="tile alert"><span className="k">Didn’t go through</span><span className="v" style={{ fontSize: 26 }}>{gbp(d.failed)}</span><span className="h">we’ll try again in 3 days</span></div>}</div>
    {d.children.map((st) => <section key={st.id} style={{ marginBottom: 16 }}><h3 style={{ margin: "0 0 8px", font: "600 18px Jost, sans-serif" }}>{st.first}</h3>
      <div className="tw" style={{ marginBottom: 0 }}><table><thead><tr><th>Course</th><th className="n">Year</th>{d.terms.map((t) => <th key={t.id} className="n">T{t.number}</th>)}</tr></thead><tbody>
        {st.courses.length === 0 ? <tr><td colSpan={d.terms.length + 2} className="muted">No courses this year.</td></tr> : st.courses.map((c) => { const x = X[c.id]; return <tr key={c.id}>
          <td><span className="dot" style={{ background: c.colour }} /> <b>{c.subject}</b> <span className="muted">{c.level}</span>
            {c.cpl && c.list > 0 && <span className="muted" style={{ display: "block", fontSize: 13.5 }}>{Math.round(c.list / c.cpl)} lessons × {gbp(c.cpl)}{c.discount > 0 ? `, less ${Math.round((c.discount / c.list) * 100)}% multi-course discount` : ""}</span>}
            {c.status !== "active" && <> <span className="pill mute">{c.status === "swapped" ? "Swapped" : "Cancelled"}</span></>}
            {c.notice_given_on && c.status === "active" && <> <span className="pill warn">Notice given {dm(c.notice_given_on)}</span></>}
            {x && <details style={{ marginTop: 6 }}><summary className="abtn sm" style={{ cursor: "pointer" }}>Swap or cancel</summary>
              <div style={{ display: "grid", gap: 10, background: "var(--soft)", borderRadius: 10, padding: 12, marginTop: 8, maxWidth: 520 }}>
                {x.sw.length > 0 && <form action={parentSwapAction} style={{ display: "grid", gap: 8 }}><input type="hidden" name="id" value={c.id} /><b>Swap to another class</b>
                  <select name="to" className="mini">{x.sw.map((o) => <option key={o.id} value={o.id}>{o.name}{o.slots ? ` · ${o.slots}` : ""}</option>)}</select>
                  <select name="start" className="mini"><option value="current">Move now: the new course’s lessons from the start of this term</option><option value="next">From next term (nothing to pay now)</option></select>
                  <div><button className="abtn sm" type="submit">Swap</button></div></form>}
                {x.pre && <form action={parentCancelAction} style={{ display: "grid", gap: 8, borderTop: x.sw.length ? "1px solid var(--line)" : 0, paddingTop: x.sw.length ? 10 : 0 }}><input type="hidden" name="id" value={c.id} />
                  <b>Cancel {c.subject}</b><span>{x.pre.cooling ? <>You’re within the 14-day cooling-off period: everything is cancelled{x.pre.refund ? <> and {gbp(x.pre.refund)} is refunded</> : null}.</>
                    : <>{x.pre.notice} term{x.pre.notice > 1 ? "s’" : "’s"} notice: lessons and payments continue{x.pre.lastTerm ? ` to the end of ${x.pre.lastTerm}` : ""} ({gbp(x.pre.stillDue)} still to pay){x.pre.notCharged ? <>, then nothing more ({gbp(x.pre.notCharged)} not charged)</> : null}.</>}</span>
                  <div><button className="abtn sm danger" type="submit">{x.pre.cooling ? "Cancel and refund" : "Cancel with notice"}</button></div></form>}
              </div></details>}</td>
          <td className="n">{gbp(c.net)}</td>
          {c.cells.map((cell, i) => <td key={i} className="n">{cell ? <div style={{ display: "grid", gap: 2, justifyItems: "end" }}><span>{gbp(cell.amount)}</span>{/* 27 Nov (Alfonso): the date under each payment; a paid one opens the payment history */}
            {lateCell(cell) ? <a href="#late" className="pill bad" style={{ fontSize: 12.5, textDecoration: "none" }}>{cell.status === "failed" ? "Declined" : "Overdue"} ›</a>
              : PAID.has(cell.status) ? <a href="#history" className={`pill ${CELL[cell.status]?.[0] ?? "mute"}`} style={{ fontSize: 12.5, textDecoration: "none" }} title="See it in your payment history">{CELL[cell.status]?.[1] ?? cell.status} ›</a>
              : <span className={`pill ${CELL[cell.status]?.[0] ?? "mute"}`} style={{ fontSize: 12.5 }}>{CELL[cell.status]?.[1] ?? cell.status}</span>}
            {cell.status !== "cancelled" && cell.status !== "waived" && <span className="muted" style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>{PAID.has(cell.status) && cell.paid_on ? dm(cell.paid_on) : dm(cell.due_on)}</span>}</div> : <span className="muted">—</span>}</td>)}</tr>; })}
      </tbody>
      {/* 27 Nov (Alfonso): what each term comes to, for this child */}
      {st.courses.length > 1 && <tfoot><tr className="pay-tot"><td><b>Term totals</b></td><td className="n"><b>{gbp(st.courses.reduce((a, c) => a + c.net, 0))}</b></td>
        {d.terms.map((t, i) => { const v = termSum(st.courses, i); return <td key={t.id} className="n">{v ? <b>{gbp(v)}</b> : <span className="muted">—</span>}</td>; })}</tr></tfoot>}
      </table></div></section>)}
    {d.children.filter((c) => c.courses.length).length > 1 && <div className="tw"><table><tbody><tr className="pay-tot"><td><b>All children: term totals</b></td><td className="n"><b>{gbp(allCourses.reduce((a, c) => a + c.net, 0))}</b></td>
      {d.terms.map((t, i) => { const v = termSum(allCourses, i); return <td key={t.id} className="n">{v ? <b>{gbp(v)}</b> : <span className="muted">—</span>}</td>; })}</tr></tbody></table></div>}
    <section className="card pay-hist" id="history"><div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}><h2 style={{ margin: 0 }}>Payment history</h2><span className="grow" style={{ flex: 1 }} /><PrintButton /></div>
      {hist.length === 0 ? <p className="empty">No payments yet.</p> : <div className="tw"><table><thead><tr><th>Date paid</th><th>Payment</th><th className="n">Amount</th><th>Receipt</th></tr></thead><tbody>
        {hist.map((h) => <tr key={h.key} id={`pay-${h.key}`}><td style={{ whiteSpace: "nowrap", verticalAlign: "top" }}>{dm(h.day)} {h.day.slice(0, 4)}</td>
          <td><b>{h.title}</b>{(h.lines.length > 1 || h.lines[0]?.what !== h.title) && <ul className="pay-lines">{h.lines.map((l, k) => <li key={k}><span>{l.who ? `${l.who}: ` : ""}{l.what}</span><span>{gbp(l.amount)}</span></li>)}</ul>}</td>
          <td className="n" style={{ verticalAlign: "top" }}><b>{gbp(h.total)}</b>{h.refunded > 0 && <div className="muted" style={{ fontSize: 13 }}>−{gbp(h.refunded)} refunded</div>}</td>
          <td style={{ verticalAlign: "top" }}>{h.ref ? <a className="abtn sm" href={`/parent/payments/receipt?ref=${encodeURIComponent(h.ref)}`} target="_blank" rel="noopener">Receipt</a> : <span className="muted" style={{ fontSize: 13.5 }}>Ask us</span>}</td></tr>)}
      </tbody></table></div>}
      <p className="cs" style={{ marginTop: 8 }}>Receipts open on Stripe, who handle our payments. No receipt link? Message us and we’ll send one.</p></section>
    <p className="note">Each course costs its lessons × its price per lesson, paid in equal termly payments. Swapping charges the new course for its lessons from the start of the term you move in, less what you’ve already paid for that term. Cancelling needs one full term’s notice for KS3 and Pre-GCSE courses and two full terms’ notice for GCSE courses, as agreed when you booked. Within 14 days of the first lesson, before the Classroom is used, you can cancel for a full refund.{online ? null : " To update your card, message us for now: card payments online are coming."}</p>
  </>;
}
