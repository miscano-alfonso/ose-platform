import Link from "next/link";
import { getGroups, pendingInvites } from "@/lib/admin-data";
import { classFormOptions } from "@/lib/rules";
import { updateGroupAction, addClassAction, remindInviteAction, runInvitesAction, saveInviteCfgAction } from "../../actions";
import { invitePlan, inviteStatus } from "@/lib/classroom-invites";
import { yearLabel } from "@/lib/format";

const MODE: Record<string, string> = { auto: "Close when full", keep_open: "Keep open past capacity", full: "Mark as full now" };
const LABEL: Record<string, string> = { auto: "Automatic", off: "No label", few_spaces: "Few spaces left", almost_full: "Almost full", new_group: "New Group!", launching_soon: "New Group Launching Soon!" };
const STATUS: Record<string, string> = { open: "Open", waitlist: "Waiting list", priority: "Waiting-list priority", closed: "Closed", hidden: "Hidden" };
const HOME: Record<string, string> = { auto: "Automatic (when places are free)", show: "Always show", hide: "Never show" };
const onHome = (g: { homepage: string; bookable: boolean; status: string }) => g.status !== "hidden" && g.status !== "closed" && (g.homepage === "show" || (g.homepage === "auto" && g.bookable));
const statusPill = (s: string, full: boolean) => full && (s === "open" || s === "priority") ? <span className="pill warn">Full</span>
  : s === "open" ? <span className="pill good">Open</span> : s === "waitlist" || s === "priority" ? <span className="pill info">{STATUS[s]}</span> : <span className="pill mute">{STATUS[s]}</span>;

export default async function Classes({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; level?: string }> }) {
  const sp = await searchParams;
  const [all, opts, pend, plan, inv] = await Promise.all([getGroups(), classFormOptions(), pendingInvites(), invitePlan(), inviteStatus()]);
  const levels = [...new Set(all.map((g) => g.level))];
  const level = levels.includes(sp.level ?? "") ? sp.level! : "All";
  const groups = all.filter((g) => level === "All" || g.level === level);
  const years = [...new Set(groups.map((g) => g.year_label))];
  return <>
    <div className="top"><div><h1>Classes</h1><div className="sub">{groups.length} classes. Edit a row to change its capacity, override, website label, status or whether it shows under Space Available on the homepage.</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    <section className="card"><h2>Google Classroom invitations</h2>
      <p className="cs">When a place is confirmed, the student is invited to the class’s Google Classroom at the Google account the parent gave for them, and Google emails them the invitation. When a place is cancelled, moved to another class, or a taster doesn’t go on to book, they’re taken out of the Classroom. Students who finish a course keep their work. Invitations come from ose@.</p>
      {inv.ready !== "ok" && <p className="note msg bad">{inv.ready === "none" ? "Connect the recordings account (ose@) first" : "Connect ose@ again so the site may send Classroom invitations (Google will ask for one more permission)"}: <Link href="/admin/recordings?tab=settings">Recordings → Settings</Link>.</p>}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", margin: "6px 0 10px" }}>
        <form action={runInvitesAction}><button className="abtn pri" type="submit" disabled={inv.ready !== "ok" || (plan.invite.length + plan.remove.length === 0)}>Send now{plan.invite.length + plan.remove.length ? ` (${plan.invite.length} to invite, ${plan.remove.length} to take out)` : ""}</button></form>
        <form action={saveInviteCfgAction} style={{ display: "flex", gap: 8, alignItems: "center" }}><label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" name="auto" defaultChecked={inv.cfg.auto} /> Do this automatically, about every hour</label><button className="abtn sm" type="submit">Save</button></form>
      </div>
      {inv.last.at && <p className="muted" style={{ fontSize: 14, margin: "0 0 8px" }}>Last run {new Date(inv.last.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })}{inv.last.by && inv.last.by !== "auto" ? ` by ${inv.last.by}` : " (automatic)"}: {inv.last.error ?? `${inv.last.invited ?? 0} invited, ${inv.last.removed ?? 0} taken out.`}</p>}
      {!!inv.last.problems?.length && <ul className="note" style={{ margin: "0 0 10px", paddingLeft: 18 }}>{inv.last.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
      {(plan.invite.length > 0 || plan.remove.length > 0) && <div className="tw" style={{ border: 0, marginBottom: 0 }}><table><thead><tr><th>Student</th><th>Class</th><th>What happens</th></tr></thead><tbody>
        {plan.invite.map((x) => <tr key={"i" + x.student_id + x.group_id}><td><b>{x.student}</b><br /><span className="muted">{x.email}</span></td><td>{x.class}<div className="muted" style={{ fontSize: 13 }}>{x.code}</div></td><td><span className="pill good">Invite</span>{x.old_invite || x.membership_id ? <span className="muted" style={{ fontSize: 13 }}> {x.old_invite ? "new address" : "again"}</span> : null}</td></tr>)}
        {plan.remove.map((x) => <tr key={"r" + x.membership_id}><td><b>{x.student}</b><br /><span className="muted">{x.email ?? "no Google account"}</span></td><td>{x.class}<div className="muted" style={{ fontSize: 13 }}>{x.code}</div></td><td><span className="pill warn">{x.state === "joined" ? "Take out" : "Withdraw invitation"}</span> <span className="muted" style={{ fontSize: 13 }}>{x.why}</span></td></tr>)}
      </tbody></table></div>}
      {plan.invite.length + plan.remove.length === 0 && <p className="muted" style={{ margin: 0 }}>Nothing to send: everyone with a confirmed place has been invited.</p>}
      {plan.noEmail.length > 0 && <p className="note" style={{ marginTop: 10 }}><b>No Google account given yet ({plan.noEmail.length}):</b> {plan.noEmail.map((x) => `${x.student} (${x.class}, parent ${x.parent})`).join("; ")}. Parents add it under Your details.</p>}
      {plan.noClassroom.length > 0 && <p className="note" style={{ marginTop: 6 }}><b>Booked classes not linked to a Classroom:</b> {plan.noClassroom.join(", ")}. Add the Classroom link with Edit below.</p>}
    </section>
    {pend.length > 0 && <section className="card"><h2>Google Classroom invitations not accepted ({pend.length})</h2>
      <p className="cs">Students join a class’s Google Classroom by accepting the invitation sent to their school account. Until they do, they can’t join the lesson’s Google Meet.</p>
      <div className="tw" style={{ border: 0, marginBottom: 0 }}><table><thead><tr><th>Student</th><th>Class</th><th>Invited</th><th>Next lesson</th><th /></tr></thead><tbody>
        {pend.map((p) => <tr key={p.id}><td><b>{p.student}</b><br /><span className="muted">{p.email ?? "no Google account yet"}</span></td><td>{p.class}</td>
          <td>{new Date(p.invited_at + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}{p.reminded ? ` · reminded ${new Date(p.reminded + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}</td>
          <td>{p.next ?? "—"}</td><td><form action={remindInviteAction}><input type="hidden" name="id" value={p.id} /><button className="abtn sm" type="submit">Send a reminder</button></form></td></tr>)}
      </tbody></table></div></section>}
    <div className="segl" role="group" aria-label="Level" style={{ marginBottom: 12 }}>{["All", ...levels].map((l) => <Link key={l} href={l === "All" ? "/admin/classes" : `/admin/classes?level=${encodeURIComponent(l)}`} aria-current={l === level ? "true" : undefined}>{l}</Link>)}</div>
    <details className="card" open={!!sp.err}><summary style={{ cursor: "pointer", fontWeight: 600 }}>Add a class</summary>
      <form action={addClassAction} className="eform" style={{ marginTop: 12 }}>
        <label className="fld">Course<select name="course" required defaultValue=""><option value="" disabled>Choose</option>
          {opts.years.map((y) => <optgroup key={y.id} label={y.label}>{opts.rules.filter((r) => r.year_id === y.id).map((r) => <option key={r.level_id + r.subject_id} value={`${y.id}|${r.level_id}|${r.subject_id}`}>{r.level} {r.subject}</option>)}</optgroup>)}</select></label>
        <label className="fld">Places<input name="capacity" type="number" min={1} max={200} defaultValue={12} style={{ width: 90 }} /></label>
        <label className="fld">Status<select name="status" defaultValue="hidden"><option value="hidden">Hidden (add times first)</option><option value="open">Open</option><option value="waitlist">Waiting list</option></select></label>
        <button className="abtn pri" type="submit">Add class</button></form>
      <p className="cs" style={{ marginTop: 8 }}>The list shows the subjects set up in Prices &amp; rules, which also sets the price. Then add lesson times and the teacher under Timetable.</p></details>
    {years.map((y) => <div key={y}>
      {years.length > 1 && <h2 style={{ font: "600 20px Jost", margin: "8px 0 10px" }}>{yearLabel(y)}</h2>}
      <div className="tw"><table>
        <thead><tr><th>Class</th><th>Teacher</th><th>Lessons</th><th>Places</th><th>Status</th><th>Website label</th><th>Homepage</th><th>Google Classroom</th></tr></thead>
        {groups.filter((g) => g.year_label === y).map((g) => {
          const pct = g.capacity ? Math.min(100, Math.round((g.taken / g.capacity) * 100)) : 0;
          return <tbody key={g.id}>
            <tr>
              <td><span className="dot" style={{ background: g.colour }} /><b>{g.level} {g.subject}</b><div className="muted" style={{ fontSize: 15.5, marginLeft: 18 }}>{g.code}</div></td>
              <td>{g.teacher ?? <span className="muted">Not set</span>}</td>
              <td>{g.slots ?? <span className="muted">No lessons yet</span>}</td>
              <td><div className="fill"><div className="track"><i className={g.is_full ? "full" : ""} style={{ width: `${pct}%` }} /></div><span>{g.taken}/{g.capacity ?? "∞"}</span></div>
                {g.capacity_mode !== "auto" && <div className="muted" style={{ fontSize: 13.5 }}>{MODE[g.capacity_mode]}</div>}
                {g.waiting > 0 && <div className="muted" style={{ fontSize: 13.5 }}>{g.waiting} waiting</div>}</td>
              <td>{statusPill(g.status, g.is_full)}</td>
              <td>{g.label ?? <span className="muted">None</span>}{g.sticky_label !== "auto" && <div className="muted" style={{ fontSize: 13.5 }}>set by hand</div>}</td>
              <td>{onHome(g) ? <span className="pill good">Space Available</span> : <span className="muted">Not shown</span>}
                {g.homepage !== "auto" && <div className="muted" style={{ fontSize: 13.5 }}>set by hand{g.homepage_order ? ` · position ${g.homepage_order}` : ""}</div>}</td>
              <td>{g.classroom ? <span className="pill good">Linked</span> : <span className="pill mute">Not linked</span>}{g.meet_url ? <div className="muted" style={{ fontSize: 13.5 }}>Meet link set</div> : <div className="muted" style={{ fontSize: 13.5 }}>No Meet link</div>}</td>
            </tr>
            <tr className="editrow"><td colSpan={8} style={{ paddingTop: 6, paddingBottom: 8 }}>
              <details className="edit"><summary className="abtn sm">Edit {g.code}</summary>
                <form action={updateGroupAction} className="eform" style={{ marginTop: 10 }}>
                  <input type="hidden" name="id" value={g.id} />
                  <label className="fld">Capacity<input type="number" name="capacity" min={1} max={200} defaultValue={g.capacity ?? ""} style={{ width: 90 }} /></label>
                  <label className="fld">When full<select name="capacity_mode" defaultValue={g.capacity_mode}>{Object.entries(MODE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                  <label className="fld">Website label<select name="sticky_label" defaultValue={g.sticky_label}>{Object.entries(LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                  <label className="fld">Status<select name="status" defaultValue={g.status}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                  <label className="fld">Space Available on homepage<select name="homepage" defaultValue={g.homepage}>{Object.entries(HOME).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                  <label className="fld">Position<input type="number" name="homepage_order" min={1} max={99} placeholder="Auto" defaultValue={g.homepage_order ?? ""} style={{ width: 80 }} /></label>
                  <label className="fld">Google Meet link<input type="url" name="meet_url" placeholder="https://meet.google.com/abc-defg-hij" defaultValue={g.meet_url ?? ""} style={{ width: 300 }} /></label>
                  <button className="abtn pri" type="submit">Save</button>
                </form></details></td></tr>
          </tbody>;
        })}
      </table></div>
    </div>)}
    <p className="note">“Keep open past capacity” lets families keep booking a full class. “Mark as full now” closes booking and shows the waiting list. “Space Available” on the homepage shows open classes with places left automatically; choose “Always show” or “Never show” to set it by hand, and a position to change the order (1 comes first). Every change is recorded in the audit log.</p>
  </>;
}
