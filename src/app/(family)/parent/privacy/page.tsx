import { requireParent } from "@/lib/family-auth";
import { details, privacy } from "@/lib/family";
import { marketingAction, privacyRequestAction } from "../../actions";
import { Head, Flash, dm } from "../../fmt";

const PURPOSE: Record<string, string> = { marketing_email: "News and offers by email", contact_sharing: "Other parents can ask to swap details", send_shared_with_teachers: "Support needs shared with teachers",
  leaderboard_name: "Name on the rewards leaderboard", photos: "Photos", student_chat: "Chat with classmates" };
const KIND: [string, string][] = [["access", "A copy of everything you hold about us"], ["rectification", "Correct something that’s wrong"], ["erasure", "Delete our data"], ["objection", "Stop using our data for something"]];
export default async function Privacy({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const [sp, f] = await Promise.all([searchParams, requireParent()]);
  const [d, p] = await Promise.all([details(f.id), privacy(f.id)]);
  return <>
    <Head title="Privacy" sub="Your choices about how we use your family’s information, and your rights" />
    <Flash sp={sp} />
    <div className="dgrid"><div className="dstack">
      <section className="card" style={{ margin: 0 }}><h2>Emails</h2><form action={marketingAction} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ display: "flex", gap: 8 }}><input type="checkbox" name="on" defaultChecked={d.p.marketing} /> News, offers and new courses by email</label><button className="abtn sm" type="submit">Save</button></form>
        <p className="note" style={{ marginTop: 6 }}>Messages about your bookings, lessons, payments and reports always come: we need to send those.</p></section>
      <section className="card" style={{ margin: 0 }}><h2>Your choices so far</h2>{p.consents.length === 0 ? <p className="empty">Nothing recorded yet.</p> : p.consents.map((c, i) => <div className="li" key={i}>
        <div className="t"><b>{PURPOSE[c.purpose] ?? c.purpose}{c.student ? ` · ${c.student}` : ""}</b><span>{c.granted ? "Yes" : "No"} · {dm(c.at)}</span></div></div>)}
        <p className="note">Change chat, the leaderboard and support-needs sharing under My details.</p></section>
    </div><div className="dstack">
      <section className="card" style={{ margin: 0 }}><h2>Your rights</h2><p className="cs">We reply within one month. Read our <a href="/privacy">privacy notice</a>.</p>
        <form action={privacyRequestAction} style={{ display: "grid", gap: 10 }}><label className="fld">I’d like<select name="kind" className="mini">{KIND.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <div><button className="abtn pri" type="submit">Send request</button></div></form>
        {p.requests.length > 0 && <div style={{ marginTop: 10 }}>{p.requests.map((r, i) => <div className="li" key={i}><div className="t"><b>{KIND.find(([k]) => k === r.kind)?.[1] ?? r.kind}</b><span>Sent {dm(r.received)} · reply by {dm(r.due)}</span></div>
          <span className={`pill ${r.status === "open" ? "info" : "good"}`}>{r.status === "open" ? "In progress" : r.status === "done" ? "Done" : "Closed"}</span></div>)}</div>}</section>
    </div></div>
  </>;
}
