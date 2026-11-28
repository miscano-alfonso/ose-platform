import Link from "next/link";
import { familyDiscountCheck } from "@/lib/payments";
import { applyFamilyDiscountAction } from "../../../actions";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";

// 28 Nov (Alfonso): the course-count discount is for the whole family. Places set up before then were priced on each
// child's own courses; this lists families whose payments still to come would be lower with the family count, and moves
// them across when the office says so. Paid, failed and processing payments are never changed, and nothing is charged.
export default async function FamilyDiscounts({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const [sp, fams] = await Promise.all([searchParams, familyDiscountCheck()]);
  const save = fams.reduce((a, f) => a + f.upcomingTotalNow - f.upcomingTotalNew, 0);
  return <>
    <p className="backlink"><Link className="abtn sm" href="/admin/payments">← Payments</Link></p>
    <div className="top"><div><h1>Family discount check</h1><div className="sub">The course discount (10% for 3 courses, 15% for 5) counts all of a family’s children together. These families’ payments still to come were set up on each child’s own courses, so they’re higher than they should be. Updating changes only scheduled payments that aren’t due yet; nothing is charged or refunded.</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    {fams.length === 0 ? <p className="empty">Every family’s payments still to come already include the family discount.</p> : <>
      <div className="tiles">
        <div className="tile"><span className="k">Families to update</span><span className="v">{fams.length}</span><span className="h">{(() => { const n = fams.reduce((a, f) => a + f.lines.length, 0); return `${n} course place${n === 1 ? "" : "s"}`; })()}</span></div>
        <div className="tile"><span className="k">Lower by, in total</span><span className="v">{money(save)}</span><span className="h">across the payments still to come</span></div>
      </div>
      <div className="tw"><table><thead><tr><th>Family</th><th>Courses</th><th className="n">Per term now</th><th className="n">With the family discount</th><th className="n">Still to come</th><th /></tr></thead><tbody>
        {fams.map((f) => <tr key={f.parent_id}>
          <td><b>{f.name}</b><div className="muted" style={{ fontSize: 13 }}>{f.email} · {f.familyCourses} courses as a family</div></td>
          <td style={{ fontSize: 14 }}>{f.lines.map((l) => <div key={l.enrolment_id}>{l.child.split(" ")[0]} · {l.cls}: <b>{l.oldPct}% → {l.newPct}%</b> <span className="muted">({money(l.nowPerTerm)} → {money(l.newPerTerm)} a term, {l.upcoming} term{l.upcoming === 1 ? "" : "s"} to come)</span></div>)}</td>
          <td className="n">{money(f.nowPerTerm)}</td><td className="n"><b>{money(f.newPerTerm)}</b></td>
          <td className="n">{money(f.upcomingTotalNow)} → <b>{money(f.upcomingTotalNew)}</b></td>
          <td><form action={applyFamilyDiscountAction} className="fd-one"><input type="hidden" name="parent" value={f.parent_id} />
            <label className="chk"><input type="checkbox" name="confirm" /> Confirm</label><button className="abtn sm pri" type="submit">Update</button></form></td></tr>)}
      </tbody></table></div>
      <form action={applyFamilyDiscountAction} className="card fd-all"><input type="hidden" name="all" value="1" />
        <label className="chk"><input type="checkbox" name="confirm" /> I’ve checked the list: update {fams.length === 1 ? "this family" : `all ${fams.length} families`}</label>
        <button className="abtn pri" type="submit">Update all</button>
        <span className="muted">It may be worth letting these families know their termly payment is going down.</span></form>
    </>}
  </>;
}
