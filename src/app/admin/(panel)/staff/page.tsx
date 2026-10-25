import { getStaff } from "@/lib/admin-data";
import { requireStaff } from "@/lib/auth";
import { revokeInviteAction, setStaffAccessAction } from "../../actions";
import { InviteForm } from "../../forms";

const d = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" }) : "Never";
const ROLE: Record<string, string> = { school_admin: "Admin", teacher: "Teacher" };

export default async function Staff() {
  const me = await requireStaff();
  const { staff, invites, teachers } = await getStaff();
  return <>
    <div className="top"><div><h1>Staff &amp; access</h1><div className="sub">Invite admins and teachers to sign in, and remove access when someone leaves.</div></div></div>
    <section className="card"><h2>Invite someone</h2>
      <p className="cs">Admins see and change everything. Teachers will see their own classes, registers and reports (their dashboard is being built; until then they see their classes).</p>
      <InviteForm teachers={teachers} /></section>
    {invites.length > 0 && <section className="card"><h2>Waiting to accept</h2>
      {invites.map((i) => <div className="li" key={i.id}><span className={`pill ${i.expired ? "bad" : "info"}`}>{i.expired ? "Expired" : ROLE[i.role]}</span>
        <div className="t"><b>{i.name} · {i.email}</b><span>Invited {d(i.created_at)}{i.invited_by ? ` by ${i.invited_by}` : ""} · {i.expired ? "expired" : `link works until ${d(i.expires_at)}`}</span></div>
        <form action={revokeInviteAction}><input type="hidden" name="id" value={i.id} /><button className="abtn sm" type="submit">Cancel invite</button></form></div>)}
      <p className="note">Lost a link? Invite them again: the old link stops working and you get a new one.</p></section>}
    <section className="card"><h2>People with access</h2>
      {staff.map((u) => <div className="li" key={u.id}><span className={`pill ${u.disabled ? "mute" : u.role === "school_admin" ? "good" : "info"}`}>{u.disabled ? "No access" : ROLE[u.role]}</span>
        <div className="t"><b>{u.name}{u.id === me.id ? " (you)" : ""} · {u.email}</b><span>Last signed in: {d(u.last_sign_in_at)}{u.teaches ? ` · teaches ${u.teaches}` : ""}</span></div>
        {u.id !== me.id && <form action={setStaffAccessAction}><input type="hidden" name="id" value={u.id} /><input type="hidden" name="on" value={u.disabled ? "1" : "0"} />
          <button className="abtn sm" type="submit">{u.disabled ? "Restore access" : "Remove access"}</button></form>}</div>)}
    </section>
  </>;
}
