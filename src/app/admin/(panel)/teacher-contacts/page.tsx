import { requireStaff } from "@/lib/auth";
import { withSchool } from "@/lib/db";
import { teacherContacts, officeInfo } from "@/lib/teacher-area";
import { teacherContactsAction } from "./actions";

export const dynamic = "force-dynamic";

// Who teachers can email from their Email page (besides the office), and how each is described ("Principal", "IT support").
export default async function TeacherContacts({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const [sp] = await Promise.all([searchParams, requireStaff()]);
  const [admins, list] = await Promise.all([
    withSchool((q) => q<{ id: string; name: string; email: string }>(`select id, name, email::text from users where role = 'school_admin' and disabled_at is null order by name`)),
    teacherContacts()]);
  const office = await officeInfo();
  const on = new Map(list.map((c) => [c.user_id, c.label]));
  return <>
    <div className="top"><div><h1>Who teachers can email</h1><div className="sub">On their Email page, teachers can write to the office (the school inbox) or to the people ticked here. Each email shows in Admin → Email → Inbox, tagged with who it’s for, and that person also gets it by email.</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}
    <form action={teacherContactsAction} className="card" style={{ display: "grid", gap: 10 }}>
      <label className="fld">The school inbox{office.mailbox ? ` (${office.mailbox})` : ""} is shown to teachers as<input name="office_label" defaultValue={office.label === "the office" ? "" : office.label} placeholder="e.g. Leanne" maxLength={60} /></label>
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>Teachers can also email these people directly:</p>
      {admins.filter((a) => a.email.toLowerCase() !== (office.mailbox ?? "")).map((a) => <div key={a.id} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "8px 0", borderTop: "1px solid var(--line)" }}>
        <label style={{ display: "flex", gap: 10, alignItems: "center", flex: "1 1 260px", cursor: "pointer" }}>
          <input type="checkbox" name="on" value={a.id} defaultChecked={on.has(a.id)} style={{ width: 20, height: 20 }} />
          <span><b>{a.name}</b><br /><span className="muted" style={{ fontSize: 14 }}>{a.email}</span></span></label>
        <label className="fld" style={{ flex: "1 1 220px" }}>Shown to teachers as<input name={`label_${a.id}`} defaultValue={on.get(a.id) ?? ""} placeholder="e.g. Principal, IT support" maxLength={60} /></label>
      </div>)}
      <div><button className="abtn pri" type="submit">Save</button></div>
    </form>
  </>;
}
