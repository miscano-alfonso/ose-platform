import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { stripeStatus, suggestions, recentCharges } from "@/lib/stripe-read";
import { siteBase } from "@/lib/social";
import { connectStripeAction, stripeOptionsAction, confirmStripeAction } from "../../../actions";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";
const when = (s: string) => new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });

// Payments → Stripe payments: OH-SO ED's card payments, read from Stripe with a read-only key, matched to families' terms.
export default async function StripePayments({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  await requireStaff();
  const [st, base] = await Promise.all([stripeStatus(), siteBase()]);
  const [sug, recent] = st.connected ? await Promise.all([suggestions(), recentCharges(25)]) : [[], []];
  const sure = sug.filter((s) => s.sure), unsure = sug.filter((s) => !s.sure);
  return <>
    <p><Link href="/admin/payments">← Payments</Link></p>
    <div className="top"><div><h1>Stripe payments</h1><div className="sub">Card payments read from Stripe and matched to each family’s terms. Read only: this site never charges, refunds or changes anything in Stripe, and never emails families from here.</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}

    {!st.connected ? <section className="card"><h2>Connect Stripe (read only)</h2>
      <ol style={{ margin: "0 0 14px", paddingLeft: 20, lineHeight: 1.7 }}>
        <li>In Stripe, open <b>Developers → API keys</b> and press <b>Create restricted key</b> (choose “Providing this key to another website” if asked; name it “OH-SO ED website, read only”).</li>
        <li>Leave every permission on <b>None</b>, except <b>Read</b> for: <b>Charges</b>, <b>Customers</b>, <b>PaymentIntents</b>, <b>Refunds</b>, <b>Invoices</b>, <b>Subscriptions</b>. (Read on <b>Account</b> too, if it’s offered, so the site can show the account’s name.)</li>
        <li>Create the key, copy it (it starts <code>rk_live_</code>) and paste it below. A full secret key (<code>sk_…</code>) is refused.</li></ol>
      <form action={connectStripeAction} className="eform">
        <label className="fld">Restricted key<input name="key" type="password" autoComplete="off" placeholder="rk_live_…" style={{ width: 360 }} required /></label>
        <button className="abtn pri" type="submit">Connect and read payments</button></form>
      <p className="note" style={{ marginTop: 10 }}>With Read permissions only, Stripe itself refuses anything else from this key, so nothing can be charged, refunded or changed.</p>
    </section> : <>
      <section className="card"><div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Connected, read only</h2><span className={`pill ${st.mode === "live" ? "good" : "warn"}`}>{st.mode === "live" ? "Live" : "Test mode"}</span>
        {st.account && <span className="muted">{st.account}</span>}<span style={{ flex: 1 }} />
        <form action={stripeOptionsAction}><input type="hidden" name="what" value="sync" /><button className="abtn sm" type="submit">Read new payments</button></form>
        {!st.fromEnv && <form action={stripeOptionsAction}><input type="hidden" name="what" value="disconnect" /><button className="abtn sm" type="submit">Disconnect</button></form>}</div>
        <p className="cs" style={{ marginTop: 8 }}>{st.by ? `Connected by ${st.by}. ` : ""}{st.sync?.at ? `Last read ${when(st.sync.at)}${st.sync.error ? `: ${st.sync.error}` : ""}.` : ""}</p>
        <details style={{ marginTop: 6 }} open={!st.webhook}><summary style={{ cursor: "pointer", fontWeight: 600 }}>{st.webhook ? "Automatic updates are on" : "Turn on automatic updates (optional)"}</summary>
          <p className="cs">So new payments, failures and refunds show here straight away. Stripe sends a notification; the site only listens.</p>
          <ol style={{ margin: "0 0 10px", paddingLeft: 20, lineHeight: 1.7 }}><li>In Stripe: <b>Developers → Webhooks → Add endpoint</b>.</li>
            <li>Endpoint URL: <code style={{ userSelect: "all" }}>{base || "https://your-site"}/api/stripe/webhook</code></li>
            <li>Events: <b>charge.succeeded</b>, <b>charge.failed</b>, <b>charge.refunded</b>. Then copy the <b>Signing secret</b> (whsec_…) below.</li></ol>
          <form action={connectStripeAction} className="eform"><input type="hidden" name="key" value="" />
            <label className="fld">Signing secret<input name="whsec" type="password" autoComplete="off" placeholder="whsec_…" style={{ width: 320 }} required /></label><button className="abtn" type="submit">Save</button></form>
          {st.webhook && <form action={stripeOptionsAction} style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}><input type="hidden" name="what" value="auto" />
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" name="on" defaultChecked={st.auto} /> Record new payments that exactly match a family’s unpaid term automatically</label><button className="abtn sm" type="submit">Save</button></form>}
        </details></section>

      <form action={confirmStripeAction} className="card">
        <h2>Payments to record ({sug.length})</h2>
        <p className="cs">Ticked rows are recorded as paid when you press Confirm. Untick anything that looks wrong. Nothing changes until you confirm, and nothing is sent to Stripe or to families.</p>
        {sug.length === 0 ? <p className="empty">Everything read from Stripe is matched.</p> : <div className="tw" style={{ margin: 0 }}><table><thead><tr><th>Record</th><th>Paid</th><th className="n">Amount</th><th>Family</th><th>For</th><th>Set aside</th></tr></thead><tbody>
          {[...sure, ...unsure].map((s) => <tr key={s.charge.id}>
            <td><input type="checkbox" name={`use_${s.charge.id}`} defaultChecked={s.sure} aria-label="Record this payment" disabled={!s.family || (!s.sure && !s.options.length)} /></td>
            <td>{when(s.charge.created_at)}<br /><span className="muted" style={{ fontSize: 12.5 }}>{s.charge.description ?? ""}</span></td>
            <td className="n">{money(s.charge.amount)}{s.charge.refunded ? <><br /><span className="muted" style={{ fontSize: 12.5 }}>{money(s.charge.refunded)} refunded</span></> : null}</td>
            <td>{s.family ? <Link href={`/admin/families/${s.family.id}`}>{s.family.name}</Link> : <span className="muted">Not found</span>}<br /><span className="muted" style={{ fontSize: 12.5 }}>{s.charge.email ?? "no email"}</span></td>
            <td>{s.sure ? <><input type="hidden" name={`terms_${s.charge.id}`} value={s.terms.map((t) => t.term_id).join(",")} /><span className="pill good">{s.terms.map((t) => t.name).join(" + ")}</span><br /><span className="muted" style={{ fontSize: 12.5 }}>{s.why}</span></>
              : s.options.length ? <><select name={`terms_${s.charge.id}`} className="mini" defaultValue=""><option value="">Choose a term…</option>{s.options.map((o) => <option key={o.term_id} value={o.term_id}>{o.name} · {money(o.total)}</option>)}</select><br /><span className="muted" style={{ fontSize: 12.5 }}>{s.why}</span></>
              : <span className="muted" style={{ fontSize: 13.5 }}>{s.why}</span>}</td>
            <td><input type="checkbox" name={`ignore_${s.charge.id}`} aria-label="Set aside (e.g. a registration fee or a 1:1)" /></td></tr>)}
        </tbody></table></div>}
        {sug.length > 0 && <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}><button className="abtn pri" type="submit">Confirm</button>
          <span className="muted" style={{ fontSize: 14 }}>{sure.length} matched, {unsure.length} to check. For a row to check: choose a term and tick Record, or tick Set aside (registration fees, 1:1s, workshops, other payments).</span></div>}
      </form>

      <section className="card"><h2>Recent payments in Stripe</h2>
        {recent.length === 0 ? <p className="empty">None read yet.</p> : <div className="tw" style={{ margin: 0 }}><table><thead><tr><th>Date</th><th className="n">Amount</th><th>Family</th><th>Status</th></tr></thead><tbody>
          {recent.map((r) => <tr key={r.id}><td>{when(r.created_at)}</td><td className="n">{money(r.amount_pence)}{r.refunded_pence ? <span className="muted"> ({money(r.refunded_pence)} refunded)</span> : null}</td>
            <td>{r.family ?? <span className="muted">{r.email ?? "—"}</span>}</td>
            <td>{r.status !== "succeeded" ? <span className="pill bad">{r.status === "failed" ? "Failed" : r.status}</span> : r.terms ? <span className="pill good">Recorded: {r.terms}{r.matched_by === "auto" ? " (auto)" : ""}</span> : r.ignored ? <span className="pill mute">Set aside</span> : <span className="pill warn">To record</span>}</td></tr>)}
        </tbody></table></div>}</section>
    </>}
  </>;
}
