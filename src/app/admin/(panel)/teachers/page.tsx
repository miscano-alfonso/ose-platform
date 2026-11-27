import Link from "next/link";
import { listTeachers } from "@/lib/teachers-admin";
import { savePersonAction, removePersonAction, setStaffRoleAction, setStaffAccessAction, revokeInviteAction } from "../../actions";
import { allSitePeople, type SitePerson } from "@/lib/people";
import { StaffLinkButton } from "../../StaffLinkButton";
import { AddPerson } from "../../AddPerson";
import { getStaff } from "@/lib/admin-data";
import { requireStaff } from "@/lib/auth";
import { withSchool } from "@/lib/db";

// 27 Nov: Teachers and Staff & access are one page (Alfonso): website profiles, access and signing in together. /admin/staff opens it.
export const dynamic = "force-dynamic";
const d = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" }) : "Never";

const when = (iso: string) => { const d = new Date(iso), days = Math.floor((Date.now() - d.getTime()) / 864e5);
  const t = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  return days < 1 && d.toDateString() === new Date().toDateString() ? `today, ${t}` : days < 2 ? `yesterday, ${t}` : `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" })}, ${t}`; };

export default async function TeachersAdmin({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string }> }) {
  const sp = await searchParams;
  const me = await requireStaff();
  const [ts, people, { staff, invites, teachers }] = await Promise.all([listTeachers(), allSitePeople().catch(() => [] as SitePerson[]), getStaff()]);
  // the last sign-in email each person asked for (or the office sent), and whether it went
  const mails = await withSchool((q) => q<{ email: string; at: string; ok: boolean; held: boolean; error: string | null }>(`select distinct on (lower(detail->>'email')) lower(detail->>'email') as email,
      created_at::text as at, coalesce((detail->>'ok')::boolean, false) as ok, coalesce((detail->>'held')::boolean, false) as held, detail->>'error' as error
    from audit_log where action = 'staff_link_email' and created_at > now() - interval '30 days' order by lower(detail->>'email'), created_at desc`)).catch(() => []);
  const mailOf = (e: string) => mails.find((m) => m.email === e.toLowerCase());
  const teacherUsers = new Set(ts.map((t) => t.user_id));
  const office = staff.filter((u) => !teacherUsers.has(u.id));
  const real = (e: string) => !/\.example$/.test(e);
  return <>
    <div className="top"><div><h1>Staff &amp; teachers</h1><div className="sub">Everyone who works at the school: their website profile, their access, and how they sign in.</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    <section className="card"><h2>Teachers</h2>
    <div className="tw" style={{ border: 0, marginBottom: 0 }}><table className="st-staff"><thead><tr><th></th><th>Teacher</th><th>Role on the website</th><th>Classes</th><th>Signing in</th><th></th></tr></thead>
      <tbody>{ts.map((t) => { const m = mailOf(t.email); return <tr key={t.id} style={t.archived ? { opacity: .6 } : undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <td style={{ width: 56 }}>{t.photo ? <img src={t.photo} alt="" width={44} height={44} style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover" }} /> : <span className="avatar">{t.name[0]}</span>}</td>
        <td><b>{t.name}{t.user_id === me.id ? " (you)" : ""}</b><div className="muted" style={{ fontSize: 14.5 }}>{t.email}</div>
          <span className={`pill ${t.disabled ? "mute" : t.is_admin ? "good" : "info"}`} style={{ marginTop: 4 }}>{t.disabled ? "No access" : t.is_admin ? "Admin and teacher" : "Teacher"}</span></td>
        <td>{t.designation ?? <span className="muted">Not set</span>}{t.archived && <div><span className="pill mute">Hidden from the website</span></div>}</td>
        <td>{t.classes}</td>
        <td><div className="muted" style={{ fontSize: 13.5 }}>{t.last_sign_in_at ? <>Last signed in {when(t.last_sign_in_at)}</> : "Not signed in yet"}</div>
          {t.is_admin ? <div className="muted" style={{ fontSize: 13.5 }}>Signs in with a password</div>
          : !t.disabled && <>{m && <span className={m.ok ? "sl-st" : "sl-st bad-t"}>Sign-in email {when(m.at)}: {m.held ? "held by test mode" : m.ok ? "sent" : `didn’t send${m.error ? ` (${m.error})` : ""}`}</span>}
            <StaffLinkButton id={t.user_id} name={t.name} email={real(t.email) ? t.email : undefined} /></>}</td>
        <td><div className="acts st-acts"><Link className="abtn sm" href={`/admin/teachers/${t.id}`}>Edit profile</Link>{t.slug && !t.archived && <a className="abtn sm" href={`/teachers/${t.slug}`} target="_blank" rel="noreferrer">View</a>}
          {t.user_id !== me.id && !t.disabled && <form action={setStaffRoleAction}><input type="hidden" name="id" value={t.user_id} /><input type="hidden" name="role" value={t.is_admin ? "teacher" : "school_admin"} />
            <button className="abtn sm" type="submit" title={t.is_admin ? "They keep their classes and dashboard, without the admin" : "Full admin access; they keep their classes (and sign in with a password)"}>{t.is_admin ? "Make teacher only" : "Make admin"}</button></form>}
          {t.user_id !== me.id && <form action={setStaffAccessAction}><input type="hidden" name="id" value={t.user_id} /><input type="hidden" name="on" value={t.disabled ? "1" : "0"} />
            <button className="abtn sm" type="submit">{t.disabled ? "Restore access" : "Remove access"}</button></form>}</div></td></tr>; })}</tbody></table></div></section>
    <section className="card"><h2>Office</h2><p className="cs">Admins who don’t teach. They see and change everything, and sign in with a password.</p>
      {office.map((u) => <div className="li" key={u.id}><span className={`pill ${u.disabled ? "mute" : "good"}`}>{u.disabled ? "No access" : "Admin"}</span>
        <div className="t"><b>{u.name}{u.id === me.id ? " (you)" : ""} · {u.email}</b><span>Last signed in: {d(u.last_sign_in_at)}</span></div>
        {u.id !== me.id && <form action={setStaffAccessAction}><input type="hidden" name="id" value={u.id} /><input type="hidden" name="on" value={u.disabled ? "1" : "0"} />
          <button className="abtn sm" type="submit">{u.disabled ? "Restore access" : "Remove access"}</button></form>}</div>)}
    </section>
    {invites.length > 0 && <section className="card"><h2>Invitations waiting</h2>
      {invites.map((i) => <div className="li" key={i.id}><span className={`pill ${i.expired ? "bad" : "info"}`}>{i.expired ? "Expired" : i.role === "school_admin" ? "Admin" : "Teacher"}</span>
        <div className="t"><b>{i.name} · {i.email}</b><span>Invited {d(i.created_at)}{i.invited_by ? ` by ${i.invited_by}` : ""} · {i.expired ? "expired" : `link works until ${d(i.expires_at)}`}</span></div>
        <form action={revokeInviteAction}><input type="hidden" name="id" value={i.id} /><button className="abtn sm" type="submit">Cancel invite</button></form></div>)}
      <p className="note">Lost a link? Invite them again: the old link stops working and you get a new one.</p></section>}
    <section className="card" id="add"><h2>Add someone</h2><AddPerson teachers={teachers} /></section>
    <section className="card" id="people"><h2>Also on the People page</h2>
      <p className="cs">People at the school who aren’t teachers, such as systems and support. They show with a name, role and photo, and have no profile page. Order: the same numbers as the teachers’ “Order on the website” (on a tie, after the teacher).</p>
      <div className="pp-list">{people.map((p) => <PersonForm key={p.id} p={p} />)}<PersonForm /></div></section>
  </>;
}

function PersonForm({ p }: { p?: SitePerson }) {
  return <form action={savePersonAction} encType="multipart/form-data" className={`pp-row${p?.archived ? " is-hidden" : ""}`}>
    {p && <input type="hidden" name="id" value={p.id} />}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <span className="pp-face">{p?.photo ? <img src={p.photo} alt="" width={56} height={56} /> : <span className="avatar">{p ? p.name[0] : "+"}</span>}</span>
    <div className="pp-fields">
      <label className="fld">Name<input name="name" required maxLength={80} defaultValue={p?.name} /></label>
      <label className="fld">Role<input name="role" maxLength={80} defaultValue={p?.role ?? ""} placeholder="e.g. Systems & Support" /></label>
      <label className="fld pp-n">Order<input name="sort" type="number" min={-1} max={99} defaultValue={p?.sort_order ?? 0} /></label>
      <label className="fld">{p?.photo ? "New photo" : "Photo"} <span className="muted">(JPG, PNG or WebP, under 3 MB)</span><input type="file" name="photo" accept="image/jpeg,image/png,image/webp" /></label>
    </div>
    <div className="pp-acts">
      {p?.photo && <label className="chk"><input type="checkbox" name="remove_photo" /> Remove photo</label>}
      {p && <label className="chk"><input type="checkbox" name="hidden" defaultChecked={p.archived} /> Hide from the website</label>}
      <button className="abtn pri sm" type="submit">{p ? "Save" : "Add"}</button>
      {p && <button className="abtn sm" type="submit" formAction={removePersonAction} formNoValidate>Remove</button>}
    </div>
  </form>;
}
