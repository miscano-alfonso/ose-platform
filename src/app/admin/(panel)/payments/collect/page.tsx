import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { payStatus, payOverview } from "@/lib/stripe-pay";
import { siteBase } from "@/lib/social";
import { connectPayAction, paySwitchAction, allowCardAction, runCollectionAction, disconnectPayAction } from "../../../actions";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Termly payments" };
const day = (d: string) => new Date(d.slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
const ago = (iso: string) => { const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : day(iso); };
const ST: Record<string, [string, string]> = { none: ["mute", "Not set up"], pending: ["info", "Direct Debit being set up"], active: ["good", "Active"], inactive: ["bad", "Cancelled at the bank"] };
const CS: Record<string, [string, string]> = { creating: ["mute", "Starting"], processing: ["info", "Collecting"], succeeded: ["good", "Paid"], failed: ["bad", "Failed"], cancelled: ["mute", "Cancelled"] };

// Payments → Termly payments (11 Nov): the site takes each term's payment itself, by Direct Debit (default) or card.
// Test key only until the school leaves TechSaga.
export default async function Collect({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  await requireStaff();
  const [st, base] = await Promise.all([payStatus(), siteBase()]);
  const ov = st.connected ? await payOverview() : { families: [], recent: [] };
  const fams = st.test ? ov.families.filter((f) => f.test) : ov.families;
  const setUp = ov.families.filter((f) => f.status === "active" || f.status === "pending").length;
  return <>
    <p className="backlink"><Link className="abtn sm" href="/admin/payments">← Payments</Link></p>
    <div className="top"><div><h1>Termly payments</h1><div className="sub">Each family’s term payment collected automatically through Stripe: Direct Debit by default, or card when you allow it. Bank and card details stay with Stripe.</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    <p className="note msg" style={{ marginTop: 0 }}><b>Test only for now.</b> This accepts only a Stripe <b>test</b> key, so no real money moves, and it only works for families on the test list (Settings → Test mode). TechSaga keeps taking the real payments until the switch-over.</p>

    {!st.connected ? <section className="card"><h2>Connect Stripe for payments (test mode)</h2>
      <ol style={{ margin: "0 0 14px", paddingLeft: 20, lineHeight: 1.7 }}>
        <li>In Stripe, turn on <b>Test mode</b> (the switch at the top), then open <b>Settings → Payment methods</b> and make sure <b>Bacs Direct Debit</b> and <b>Cards</b> are on.</li>
        <li>Open <b>Developers → API keys → Create restricted key</b>, name it “OH-SO ED website, termly payments (test)”, and set <b>Write</b> on <b>Customers</b>, <b>Checkout Sessions</b>, <b>SetupIntents</b> and <b>PaymentIntents</b>, and <b>Read</b> on <b>PaymentMethods</b> and <b>Mandates</b>. Leave everything else as None. Copy the key (it starts <code>rk_test_</code>).</li>
        <li>Still in test mode, open <b>Developers → Webhooks → Add endpoint</b>: address <code>{base}/api/stripe/webhook</code>, events <code>checkout.session.completed</code>, <code>payment_intent.succeeded</code>, <code>payment_intent.payment_failed</code>, <code>payment_intent.processing</code>, <code>mandate.updated</code> and <code>charge.dispute.created</code>. Copy its signing secret (<code>whsec_…</code>).</li>
        <li>Paste both below. You paste them yourself; they’re stored on the server and never shown again.</li>
      </ol>
      <form action={connectPayAction} className="pm-form"><label className="fld">Restricted test key<input name="key" required autoComplete="off" placeholder="rk_test_…" /></label>
        <label className="fld">Webhook signing secret (test)<input name="secret" autoComplete="off" placeholder="whsec_…" /></label>
        <div><button className="abtn pri" type="submit">Connect</button></div></form>
    </section> : <>
      <div className="tiles">
        <div className="tile"><span className="k">Stripe</span><span className="v" style={{ fontSize: 20 }}>Test mode</span><span className="h">connected{st.by ? ` by ${st.by}` : ""}{st.at ? `, ${ago(st.at)}` : ""}{st.hasSecret ? "" : " · no webhook secret yet"}</span></div>
        <div className="tile"><span className="k">Families set up</span><span className="v">{setUp}</span><span className="h">of {ov.families.length} with courses{st.test ? ` · ${fams.length} on the test list` : ""}</span></div>
        <div className={`tile${st.collect ? "" : ""}`}><span className="k">Taking termly payments</span><span className="v" style={{ fontSize: 20 }}>{st.collect ? "On" : "Off"}</span><span className="h">{st.last ? `last run ${ago(st.last.at)}: ${st.last.made} asked, ${st.last.skipped} skipped` : "not run yet"}</span></div>
      </div>
      <section className="card pm-sec">
        <form action={paySwitchAction} className="pm-row"><input type="hidden" name="which" value="collect" />
          <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><input type="checkbox" name="on" defaultChecked={st.collect} /> <b>Take termly payments through this site</b></label>
          <button className="abtn sm pri" type="submit">Save</button>
          <span className="muted" style={{ flexBasis: "100%", fontSize: 14 }}>Every day from 8am, each family’s payments due that day (all their children’s courses for that term) are collected together: card straight away, Direct Debit in about 3 working days. A failed payment is tried once more (card after 3 days, Direct Debit after 5) and the family gets the “Payment failed” email. With the test key, only families on the test list.</span></form>
        <div className="pm-row"><form action={runCollectionAction}><button className="abtn sm" type="submit">Collect what’s due now</button></form>
          <form action={disconnectPayAction}><button className="abtn sm" type="submit">Disconnect the test key</button></form></div>
      </section>
      <section className="card pm-sec"><h2>Families{st.test ? " on the test list" : ""}</h2>
        {fams.length === 0 ? <p className="empty" style={{ margin: 0 }}>{st.test ? "No families with courses are on the test list. Add a test family’s email under Settings → Test mode." : "No families with courses yet."}</p> :
        <div className="tw"><table><thead><tr><th>Family</th><th>How they pay</th><th>Next payment</th><th>Card instead</th></tr></thead>
          <tbody>{fams.map((f) => <tr key={f.parent_id}><td><b>{f.family}</b><div className="muted" style={{ fontSize: 13.5 }}>{f.email}</div></td>
            <td><span className={`pill ${ST[f.status]?.[0] ?? "mute"}`}>{ST[f.status]?.[1] ?? f.status}</span>{f.label && <div className="muted" style={{ fontSize: 13.5 }}>{f.method === "bacs" ? "Direct Debit" : "Card"} · {f.label}</div>}</td>
            <td>{f.next_due ? <>{money(f.next_amount)}<div className="muted" style={{ fontSize: 13.5 }}>{day(f.next_due)}</div></> : <span className="muted">nothing due</span>}</td>
            <td><form action={allowCardAction} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><input type="hidden" name="parent" value={f.parent_id} /><input type="hidden" name="on" value={f.card_allowed ? "" : "1"} />
              <button className="abtn sm" type="submit">{f.card_allowed ? "Allowed · stop" : "Allow card"}</button></form></td></tr>)}</tbody></table></div>}
        <p className="muted" style={{ fontSize: 13.5, margin: "10px 0 0" }}>Families set up their Direct Debit themselves on their dashboard (Payments → How you pay each term). Card is only offered to families you allow here.</p>
      </section>
      <section className="card pm-sec"><h2>Recent collections</h2>
        {ov.recent.length === 0 ? <p className="empty" style={{ margin: 0 }}>None yet.</p> :
        <div className="tw"><table><thead><tr><th>Family</th><th>Due</th><th>How</th><th className="n">Amount</th><th>Status</th></tr></thead>
          <tbody>{ov.recent.map((c) => <tr key={c.id}><td><b>{c.family}</b></td><td>{day(c.due_on)}{c.attempt > 1 ? <span className="muted"> · retry</span> : null}</td><td>{c.method === "bacs" ? "Direct Debit" : "Card"}</td>
            <td className="n">{money(c.amount_pence)}</td><td><span className={`pill ${CS[c.status]?.[0] ?? "mute"}`}>{CS[c.status]?.[1] ?? c.status}</span>{c.error && <div className="muted" style={{ fontSize: 13.5 }}>{c.error}</div>}<div className="muted" style={{ fontSize: 12.5 }}>{ago(c.at)}</div></td></tr>)}</tbody></table></div>}
      </section>
    </>}
  </>;
}
