import { requireParent } from "@/lib/family-auth";
import { kids, details } from "@/lib/family";
import { saveDetailsAction, saveGuardianAction, saveChildAction } from "../../actions";
import { Head, Flash, dm } from "../../fmt";
import { safetyCfg, rulesVersion } from "@/lib/chat-safety";

export default async function Details({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const [sp, f] = await Promise.all([searchParams, requireParent()]);
  const [ks, d, safe] = await Promise.all([kids(f.id), details(f.id), safetyCfg()]);
  const ver = rulesVersion(safe.rules);
  return <>
    <Head title="My details" sub="Your contact details, a second parent, and each child’s settings" />
    <Flash sp={sp} />
    <div className="dgrid"><div className="dstack">
      <section className="card" style={{ margin: 0 }}><h2>You</h2><p className="cs">{d.p.first} {d.p.last} · {d.p.email}. To change your name or email, message us.</p>
        <form action={saveDetailsAction} style={{ display: "grid", gap: 10 }}>
          <label className="fld">Phone<input name="phone" defaultValue={d.p.phone ?? ""} maxLength={40} className="mini" /></label>
          <label className="fld">Address (for prizes and letters)<textarea name="address" defaultValue={d.p.address ?? ""} rows={3} maxLength={300} className="mini" style={{ width: "100%" }} /></label>
          <div><button className="abtn pri" type="submit">Save</button></div></form></section>
      <section className="card" style={{ margin: 0 }}><h2>Second parent or guardian</h2><p className="cs">They can receive invoices and reports. Marketing emails go to them only once they confirm by email.</p>
        <form action={saveGuardianAction} style={{ display: "grid", gap: 10 }}>
          <div className="eform"><label className="fld">First name<input name="first" defaultValue={d.g?.first ?? ""} required maxLength={60} /></label><label className="fld">Last name<input name="last" defaultValue={d.g?.last ?? ""} required maxLength={60} /></label></div>
          <div className="eform"><label className="fld">Email<input name="email" type="email" defaultValue={d.g?.email ?? ""} required maxLength={120} /></label>
            <label className="fld">Relationship<select name="relationship" defaultValue={d.g?.relationship ?? "Parent"}>{["Parent", "Step-parent", "Guardian", "Grandparent", "Other"].map((r) => <option key={r}>{r}</option>)}</select></label></div>
          <label style={{ display: "flex", gap: 8 }}><input type="checkbox" name="invoices" defaultChecked={d.g?.invoices ?? true} /> Send them invoices and receipts</label>
          <label style={{ display: "flex", gap: 8 }}><input type="checkbox" name="reports" defaultChecked={d.g?.reports ?? true} /> Send them reports</label>
          <label style={{ display: "flex", gap: 8 }}><input type="checkbox" name="marketing" defaultChecked={d.g?.marketing ?? false} /> News and offers (they’ll be asked to confirm){d.g?.confirmed ? " · confirmed" : ""}</label>
          <div style={{ display: "flex", gap: 8 }}><button className="abtn pri" type="submit">Save</button>{d.g && <button className="abtn" type="submit" name="remove" value="1" formNoValidate>Remove</button>}</div></form></section>
    </div><div className="dstack">
      {ks.map((k) => { const s = d.support.find((x) => x.student_id === k.id); return <section className="card" key={k.id} style={{ margin: 0 }}><h2>{k.first} {k.last}</h2>
        <form action={saveChildAction} style={{ display: "grid", gap: 10 }}><input type="hidden" name="student" value={k.id} />
          <label className="fld">{k.first}’s own Google account (for Classroom and Meet)<input name="email" type="email" defaultValue={k.email ?? ""} maxLength={120} className="mini" /></label>
          <label className="fld">Chat with classmates<select name="chat" defaultValue={k.chat_access} className="mini"><option value="none">Off</option><option value="class">Class chats only</option><option value="class_and_private">Class chats and private chats with classmates</option></select></label>
          <details className="chatrules" open={k.chat_rules_version !== ver}><summary style={{ cursor: "pointer", fontWeight: 500 }}>Chat rules{k.chat_rules_version === ver && k.chat_rules_agreed_at ? ` · agreed ${dm(k.chat_rules_agreed_at)}` : k.chat_rules_version ? " · updated, please agree again" : ""}</summary>
            <ol style={{ margin: "8px 0", paddingLeft: 20, fontSize: 15, lineHeight: 1.5 }}>{safe.rules.map((r, i) => <li key={i}>{r}</li>)}</ol>
            {k.chat_rules_version !== ver && <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}><input type="checkbox" name="agree_rules" style={{ marginTop: 3 }} /> I’ve read these rules with {k.first}, and we agree to them. {k.chat_access === "none" ? "(Needed to turn chat on.)" : ""}</label>}
          </details>
          <label style={{ display: "flex", gap: 8 }}><input type="checkbox" name="leaderboard" defaultChecked={k.leaderboard_name !== "hidden"} /> Show {k.first}’s first name and initial on the rewards leaderboard</label>
          {s?.has_send === "yes" && <><input type="hidden" name="share_present" value="1" /><label style={{ display: "flex", gap: 8 }}><input type="checkbox" name="share" defaultChecked={s.share} /> Share {k.first}’s support needs with their teachers</label></>}
          <div><button className="abtn pri" type="submit">Save</button></div></form>
        <p className="note" style={{ marginTop: 6 }}>Chat is off unless you turn it on, after agreeing the chat rules with your child; private chats need both parents to allow them. Teachers and the office can see every chat, and messages that break the rules are blocked or flagged to the school. Each change is recorded with the date.</p></section>; })}
    </div></div>
  </>;
}
