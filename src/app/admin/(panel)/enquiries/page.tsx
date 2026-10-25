import { getEnquiries } from "@/lib/admin-data";
import { setEnquiryHandledAction } from "../../actions";

const d = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });

export default async function Enquiries() {
  const { enquiries, waiting } = await getEnquiries();
  const open = enquiries.filter((e) => !e.handled_at).length;
  return <>
    <div className="top"><div><h1>Waiting list &amp; enquiries</h1><div className="sub">{open} enquir{open === 1 ? "y" : "ies"} to answer · {waiting.length} on waiting lists</div></div></div>
    <section className="card"><h2>Enquiries</h2><p className="cs">From the website’s contact form. Reply by email, then mark it answered.</p>
      {enquiries.length === 0 ? <p className="empty">No enquiries yet.</p> : enquiries.map((e) => <div className="li" key={e.id} style={{ alignItems: "flex-start" }}>
        <span className={`pill ${e.handled_at ? "mute" : "info"}`}>{e.handled_at ? "Answered" : "New"}</span>
        <div className="t"><b>{e.name} · <a href={`mailto:${e.email}`}>{e.email}</a></b>
          <span>{d(e.created_at)}{e.levels.length ? ` · ${e.levels.join(", ")}` : ""}{e.heard_about ? ` · heard via ${e.heard_about}` : ""}</span>
          {e.message && <p className="msg" style={{ margin: "6px 0 0" }}>{e.message}</p>}</div>
        <form action={setEnquiryHandledAction}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="handled" value={e.handled_at ? "0" : "1"} />
          <button className="abtn sm" type="submit">{e.handled_at ? "Reopen" : "Mark answered"}</button></form></div>)}
    </section>
    <section className="card"><h2>Waiting lists</h2><p className="cs">When a class reaches its threshold, everyone on its list is invited to book first.</p>
      {waiting.length === 0 ? <p className="empty">Nobody is waiting.</p> : <div className="tw" style={{ margin: 0 }}><table>
        <thead><tr><th>Class</th><th>Parent</th><th>Child</th><th>Email</th><th>Joined</th><th>Invited</th></tr></thead>
        <tbody>{waiting.map((w) => <tr key={w.id}><td>{w.class}</td><td>{w.parent_name}</td><td>{w.child_name}</td><td><a href={`mailto:${w.email}`}>{w.email}</a></td>
          <td>{d(w.created_at)}</td><td>{w.emailed_at ? d(w.emailed_at) : <span className="muted">Not yet</span>}</td></tr>)}</tbody></table></div>}
    </section>
  </>;
}
