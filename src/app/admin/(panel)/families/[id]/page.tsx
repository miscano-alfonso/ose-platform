import Link from "next/link";
import { notFound } from "next/navigation";
import { familyDetail, cancelPreview, swapOptions, type Cell } from "@/lib/families";
import { cancelCourseAction, swapCourseAction, familyTermAction, familyCheckAction } from "../../../actions";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";
const day = (d: string) => new Date(d.slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const CELL: Record<string, [string, string]> = { paid: ["good", "Paid"], scheduled: ["mute", "Due"], processing: ["info", "Processing"], failed: ["bad", "Failed"],
  refunded: ["info", "Refunded"], part_refunded: ["info", "Part refund"], cancelled: ["mute", "Not charged"], waived: ["mute", "Waived"] };
function age(dob: string | null) {
  if (!dob) return null; const b = new Date(dob), n = new Date(); let a = n.getFullYear() - b.getFullYear(); if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--;
  const sy = n.getMonth() >= 8 ? n.getFullYear() : n.getFullYear() - 1, yr = sy - b.getFullYear() - (b.getMonth() >= 8 ? 1 : 0) - 4;
  return `Age ${a} · Year ${yr}`;
}
function CellView({ c, term, family }: { c: Cell; term: number; family: string }) {
  if (!c) return <span className="muted">—</span>;
  const [tone, label] = CELL[c.status] ?? ["mute", c.status];
  return <div style={{ display: "grid", gap: 2, justifyItems: "end" }}><span>{money(c.amount)}</span><span className={`pill ${tone}`} style={{ fontSize: 12.5 }}>{label}</span>
    {(c.status === "scheduled" || c.status === "failed") && <form action={familyTermAction}><input type="hidden" name="parent" value={family} /><input type="hidden" name="term" value={term} /><input type="hidden" name="to" value="paid" />
      <button className="lnk" type="submit" title={`Mark term ${term} paid for the whole family`}>Mark paid</button></form>}</div>;
}

export default async function Family({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const f = await familyDetail(id);
  if (!f) notFound();
  const live = f.children.flatMap((c) => c.courses).filter((c) => c.status === "active" && !c.notice_given_on);
  const [previews, swaps] = await Promise.all([Promise.all(live.map((c) => cancelPreview(c.id))), Promise.all(live.map((c) => swapOptions(c.id)))]);
  const P = Object.fromEntries(live.map((c, i) => [c.id, { pre: previews[i], swaps: swaps[i] }]));
  return <>
    <p><Link href="/admin/families">← Families</Link></p>
    <div className="top"><div><h1>{f.first} {f.last}</h1><div className="sub"><a href={`mailto:${f.email}`}>{f.email}</a>{f.phone ? ` · ${f.phone}` : ""}{f.heard ? ` · found us by ${f.heard.toLowerCase()}` : ""} · courses booked online by the parent</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    {f.note && <p className="note msg">{f.note}</p>}
    <div className="card" style={{ background: "var(--soft)" }}><b>Invoices and receipts go to:</b> {f.invoiceTo.join(", ")}
      {f.guardian && <> · {f.guardian.name} ({f.guardian.relationship.toLowerCase()}) {f.guardian.reports ? "also gets reports" : "doesn’t get reports"}</>}
      {" "}· Marketing: {f.first} {f.marketing ? "yes" : "no"}{f.guardian && `, ${f.guardian.name.split(" ")[0]} ${f.guardian.marketing}`}{f.address ? ` · ${f.address}` : ""}
      {" "}· Other parents can {f.contact ? "" : "not "}ask to swap contact details</div>
    <div className="tiles">
      <div className="tile"><span className="k">Paid this year</span><span className="v" style={{ fontSize: 26 }}>{money(f.paid)}</span></div>
      <div className="tile"><span className="k">Still to pay</span><span className="v" style={{ fontSize: 26 }}>{money(f.toPay)}</span></div>
      <div className={`tile${f.failed ? " alert" : ""}`}><span className="k">Failed</span><span className="v" style={{ fontSize: 26 }}>{money(f.failed)}</span></div>
      <div className="tile"><span className="k">Customer since</span><span className="v" style={{ fontSize: 22 }}>{day(f.since)}</span></div>
    </div>

    {f.children.map((st) => { const disc = st.courses.find((c) => c.status === "active" && c.discount > 0); return <section className="card" key={st.id}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>{st.first} {st.last}</h2>{st.level && <span className="pill mute">{st.level}</span>}{age(st.dob) && <span className="pill mute">{age(st.dob)}</span>}
        {st.send === "yes" && <span className="pill warn" title={`${st.send_details ?? ""}${st.adjustments ? ` · What helps: ${st.adjustments}` : ""}`}>Support needs</span>}
        {disc && disc.list > 0 && <span className="pill info">{Math.round(disc.discount / disc.list * 100)}% bundle discount</span>}
        {st.att != null && <span className={`pill ${st.att < 50 ? "bad" : st.att < 80 ? "warn" : "good"}`}>Attendance {st.att}%</span>}
        {st.email && <span className="muted" style={{ fontSize: 14.5 }}>{st.email}</span>}</div>
      <div className="tw" style={{ marginBottom: 0 }}><table><thead><tr><th>Course</th><th className="n">Year</th>{f.terms.map((t) => <th key={t.id} className="n">T{t.number}</th>)}<th /></tr></thead><tbody>
        {st.courses.length === 0 ? <tr><td colSpan={f.terms.length + 3} className="muted">No courses this year.</td></tr> : st.courses.map((c) => { const x = P[c.id]; return <tr key={c.id}>
          <td><span className="dot" style={{ background: c.colour }} /> <b>{c.subject}</b> <span className="muted">{c.level} · {c.code}</span>
            {c.status !== "active" && <> <span className="pill mute">{c.status === "cancelled" ? "Cancelled" : c.status === "swapped" ? "Swapped" : c.status}</span></>}
            {c.notice_given_on && c.status === "active" && <> <span className="pill warn">Notice given {day(c.notice_given_on)}</span></>}
            {c.needs_check && <> <span className="pill warn">Needs a check</span></>}
            <br /><span className="muted" style={{ fontSize: 14 }}>joined {day(c.enrolled_on)} · {c.notice_terms ?? 1} term{(c.notice_terms ?? 1) > 1 ? "s’" : "’s"} notice{c.discount ? ` · was ${money(c.list)}` : ""}{c.end_reason ? ` · ${c.end_reason}` : ""}{c.note ? ` · ${c.note}` : ""}</span>
            {x && <details className="edit" style={{ marginTop: 6 }}><summary className="abtn sm">Cancel or swap</summary>
              <div style={{ display: "grid", gap: 10, background: "var(--soft)", borderRadius: 10, padding: 12, marginTop: 8, maxWidth: 560 }}>
                {x.pre && <form action={cancelCourseAction} style={{ display: "grid", gap: 8 }}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="family" value={f.id} />
                  <b>Cancel {c.subject} for {st.first}?</b>
                  <span>{x.pre.cooling ? <>Within the 14-day cooling-off period: everything is cancelled{x.pre.refund ? <> and {money(x.pre.refund)} is refunded</> : null}.</>
                    : <>{x.pre.notice} term{x.pre.notice > 1 ? "s’" : "’s"} notice: lessons and payments continue{x.pre.lastTerm ? ` to the end of ${x.pre.lastTerm}` : ""} ({money(x.pre.stillDue)} still due){x.pre.notCharged ? <>, then {money(x.pre.notCharged)} isn’t charged</> : null}.</>}</span>
                  <input name="reason" className="mini" maxLength={200} placeholder="Reason (optional)" />
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><button className="abtn sm danger" type="submit">{x.pre.cooling ? "Cancel and refund" : "Cancel with notice"}</button>
                    {!x.pre.cooling && <button className="abtn sm" type="submit" name="waive" value="1">Cancel now, waive the notice</button>}</div></form>}
                {x.swaps.length > 0 ? <form action={swapCourseAction} style={{ display: "grid", gap: 8, borderTop: "1px solid var(--line)", paddingTop: 10 }}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="family" value={f.id} />
                  <b>Or swap to another class</b>
                  <select name="to" className="mini" required>{x.swaps.map((o) => <option key={o.id} value={o.id}>{o.name}{o.slots ? ` · ${o.slots}` : ""}{o.places != null ? ` · ${o.places} places` : ""}</option>)}</select>
                  <select name="start" className="mini"><option value="current">Move now (this term is re-priced)</option><option value="next">From next term (nothing to pay now)</option></select>
                  <div><button className="abtn sm" type="submit">Swap</button></div></form> : <span className="muted">No other open class at this level to swap to.</span>}
              </div></details>}
            {c.needs_check && <form action={familyCheckAction} style={{ marginTop: 6 }}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="family" value={f.id} /><button className="abtn sm" type="submit">Mark checked</button></form>}
          </td>
          <td className="n">{money(c.net)}</td>
          {c.cells.map((cell, i) => <td key={i} className="n"><CellView c={cell} term={f.terms[i].number} family={f.id} /></td>)}<td /></tr>; })}
      </tbody></table></div>
      {st.send === "yes" && <p className="note" style={{ margin: "8px 0 0" }}><b>Support needs:</b> {st.send_details}{st.adjustments ? ` · What helps: ${st.adjustments}` : ""}{st.share ? " · shared with teachers" : " · not shared with teachers"}</p>}
    </section>; })}

    <div className="card" style={{ background: "var(--soft)" }}>{f.agreed ? <><b>Terms & Conditions</b> (version {f.agreed.version}) agreed at checkout by {f.first} {f.last} on {day(f.agreed.at)}, including the notice period for each course. <span className="muted">Stored with the order: version, time and browser.</span></>
      : <><b>Terms & Conditions:</b> agreed with TechSaga before the move; new bookings record the version, time and browser.</>}</div>
    <p className="note">Each course’s yearly price is split into equal termly instalments, charged on each term’s bill date. Paid instalments are never changed when a course is cancelled. When a course is swapped in the current term, the difference is charged or refunded; swapping from next term costs nothing now. “Mark paid” marks that term paid for the whole family (for example, paid to TechSaga).</p>
  </>;
}
