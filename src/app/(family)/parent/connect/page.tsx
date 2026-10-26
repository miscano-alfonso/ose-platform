import { requireParent } from "@/lib/family-auth";
import { connect } from "@/lib/family";
import { acceptsContactAction, requestContactAction, respondContactAction } from "../../actions";
import { Head, Flash } from "../../fmt";

export default async function Connect({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const [sp, f] = await Promise.all([searchParams, requireParent()]);
  const c = await connect(f.id);
  return <>
    <Head title="Other parents" sub="Swap contact details with parents of your child’s classmates, only when both of you agree" />
    <Flash sp={sp} />
    <section className="card"><form action={acceptsContactAction} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" name="on" defaultChecked={c.accepts} /> <b>Other parents in my children’s classes can ask to swap contact details with me</b></label>
      <button className="abtn sm" type="submit">Save</button></form>
      <p className="note" style={{ marginTop: 6 }}>Off unless you turn it on. They see only your first name and your child’s first name until you accept; then each of you sees the other’s name and email (never a phone number).</p></section>
    {c.incoming.length > 0 && <section className="card"><h2>Asked to swap details with you</h2>{c.incoming.map((r) => <form key={r.id} action={respondContactAction} className="li" style={{ flexWrap: "wrap" }}>
      <input type="hidden" name="id" value={r.id} /><div className="t"><b>{r.from_first}, {r.child}’s parent</b><span>{r.class} with {r.mine}{r.message ? ` · “${r.message}”` : ""}</span></div>
      <button className="abtn sm pri" type="submit" name="answer" value="accept">Accept</button><button className="abtn sm" type="submit" name="answer" value="decline">Decline</button>
      <button className="abtn sm" type="submit" name="answer" value="block">Decline and block</button></form>)}</section>}
    <div className="dgrid">
      <section className="card" style={{ margin: 0 }}><h2>Classmates’ parents you can ask</h2>{c.classmates.length === 0 ? <p className="empty">Nobody to ask yet: only parents who have turned this on are shown.</p> :
        <form action={requestContactAction} style={{ display: "grid", gap: 10 }}>
          <label className="fld">Ask<select name="who" className="mini">{c.classmates.map((m) => <option key={m.to_parent + m.from_student + m.group_id} value={`${m.to_parent}|${m.to_student}|${m.from_student}|${m.group_id}`}>{m.parent_first} ({m.first}’s parent) · {m.class} with {m.mine}</option>)}</select></label>
          <label className="fld">Message (optional)<input name="message" maxLength={300} className="mini" placeholder="e.g. Would you like to arrange a study session?" /></label>
          <div><button className="abtn pri" type="submit">Send request</button></div></form>}
        {c.sent.length > 0 && <div style={{ marginTop: 12 }}>{c.sent.map((r) => <div className="li" key={r.id}><div className="t"><b>{r.to_child}’s parent</b><span>{r.class}</span></div><span className="pill mute">{r.status === "pending" ? "Waiting" : r.status === "declined" ? "Declined" : "Expired"}</span></div>)}</div>}</section>
      <section className="card" style={{ margin: 0 }}><h2>Shared with you</h2>{c.shared.length === 0 ? <p className="empty">None yet.</p> : c.shared.map((s) => <div className="li" key={s.parent_id}>
        <div className="t"><b>{s.name}</b><span>{s.child_first_name}’s parent · {s.class_name} · <a href={`mailto:${s.email}`}>{s.email}</a></span></div></div>)}</section>
    </div>
  </>;
}
