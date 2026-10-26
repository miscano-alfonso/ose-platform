import Link from "next/link";
import { getEnquiries, waitingGroups } from "@/lib/admin-data";
import { setEnquiryHandledAction } from "../../actions";

export const dynamic = "force-dynamic";
const d = (iso: string) => new Date(iso.length === 10 ? iso + "T12:00:00Z" : iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

export default async function Enquiries() {
  const [{ enquiries }, groups] = await Promise.all([getEnquiries(), waitingGroups()]);
  const open = enquiries.filter((e) => !e.handled_at).length;
  const need = groups[0]?.threshold ?? 5, hours = groups[0]?.priority_hours ?? 48;
  return <>
    <div className="top"><div><h1>Waiting list &amp; enquiries</h1><div className="sub">A course opens when {need} families have joined its waiting list. They get {hours} hours to book first · {open} enquir{open === 1 ? "y" : "ies"} to answer</div></div></div>
    {groups.length === 0 && <p className="empty">No courses on a waiting list.</p>}
    {groups.map((g) => { const waiting = g.entries.filter((e) => !e.booked), n = waiting.length;
      const left = g.priority_until ? Math.max(0, Math.round((Date.parse(g.priority_until) - Date.now()) / 3600e3)) : 0;
      return <section className="card" key={g.id ?? g.name}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}><span className="dot" style={{ background: g.colour }} /><h2 style={{ margin: 0 }}>{g.name}</h2>
          {g.status === "waitlist" ? <span className="pill warn">Collecting sign-ups</span> : g.status === "priority" ? <span className="pill info">Priority booking until {when(g.priority_until!)}</span>
            : g.status === "interest" ? <span className="pill mute">Interest, no class yet</span> : <span className="pill good">Open to everyone</span>}</div>
        {g.status === "waitlist" && <><div className="brow" style={{ gridTemplateColumns: "150px minmax(0,1fr) 70px", marginTop: 12 }}><span className="lbl">Sign-ups</span>
          <div className="track" style={{ height: 14 }}><i style={{ width: `${Math.min(100, n / g.threshold * 100)}%` }} /></div><span className="num">{n} of {g.threshold}</span></div>
          <p className="note" style={{ margin: "6px 0 0" }}>The website shows this course without days or times. At {g.threshold} sign-ups everyone listed is emailed and gets {g.priority_hours} hours to book before it opens to the public.</p></>}
        {g.status === "priority" && <p className="note" style={{ margin: "8px 0 0" }}>All {g.entries.length} families were invited. {left} hours left · {g.entries.filter((e) => e.booked).length} booked so far. Days and times are now on the website, but only these families can book until the window ends.</p>}
        <div className="tw" style={{ marginTop: 12, border: 0, marginBottom: 0 }}><table><thead><tr><th>Joined</th><th>Parent</th><th>Child</th><th>Status</th></tr></thead><tbody>
          {g.entries.length === 0 ? <tr><td colSpan={4} className="muted">No sign-ups yet.</td></tr> : g.entries.map((w) => <tr key={w.id}><td>{d(w.joined)}</td>
            <td><b>{w.parent}</b><br /><a className="muted" href={`mailto:${w.email}`}>{w.email}</a></td><td>{w.child}</td>
            <td>{w.booked ? <span className="pill good">Booked</span> : w.emailed ? <span className="pill info">Invited {d(w.emailed)}</span> : <span className="muted">Waiting</span>}</td></tr>)}
        </tbody></table></div></section>; })}
    <section className="card"><h2>Taster lessons</h2><p className="cs">They have their own page.</p><Link className="abtn sm" href="/admin/tasters">Open Tasters</Link></section>
    <section className="card"><h2>Enquiries</h2><p className="cs">Messages from the contact form. Reply by email, then mark it replied.</p>
      {enquiries.length === 0 ? <p className="empty">No enquiries.</p> : enquiries.map((e) => <div className="li" key={e.id} style={{ alignItems: "flex-start" }}>
        <span className={`pill ${e.handled_at ? "mute" : "info"}`}>{e.handled_at ? "Replied" : e.kind}</span>
        <div className="t"><b>{e.name}{e.levels.length ? ` · ${e.levels.join(", ")}` : ""} · <a href={`mailto:${e.email}`}>{e.email}</a></b>
          <span>{e.message ? `${e.message} · ` : ""}{d(e.created_at)}{e.heard_about ? ` · heard via ${e.heard_about}` : ""}</span></div>
        <form action={setEnquiryHandledAction}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="handled" value={e.handled_at ? "0" : "1"} />
          <button className="abtn sm" type="submit">{e.handled_at ? "Reopen" : "Mark replied"}</button></form></div>)}
    </section>
  </>;
}
