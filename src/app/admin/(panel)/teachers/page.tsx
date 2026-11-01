import Link from "next/link";
import { listTeachers } from "@/lib/teachers-admin";
import { addTeacherAction, savePersonAction, removePersonAction } from "../../actions";
import { allSitePeople, type SitePerson } from "@/lib/people";
import { TeacherInvite } from "../../TeacherInvite";

const when = (iso: string) => { const d = new Date(iso), days = Math.floor((Date.now() - d.getTime()) / 864e5);
  const t = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  return days < 1 && d.toDateString() === new Date().toDateString() ? `today, ${t}` : days < 2 ? `yesterday, ${t}` : `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" })}, ${t}`; };

export default async function TeachersAdmin({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string }> }) {
  const sp = await searchParams;
  const [ts, people] = await Promise.all([listTeachers(), allSitePeople().catch(() => [] as SitePerson[])]);
  return <>
    <div className="top"><div><h1>Teachers</h1><div className="sub">Profiles shown on the website’s People page. Press Invite to email a teacher their sign-in link.</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    <div className="tw"><table><thead><tr><th></th><th>Teacher</th><th>Role on the website</th><th>Classes</th><th>Sign-in</th><th></th></tr></thead>
      <tbody>{ts.map((t) => <tr key={t.id} style={t.archived ? { opacity: .55 } : undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <td style={{ width: 56 }}>{t.photo ? <img src={t.photo} alt="" width={44} height={44} style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover" }} /> : <span className="avatar">{t.name[0]}</span>}</td>
        <td><b>{t.name}</b><div className="muted" style={{ fontSize: 14.5 }}>{t.email}</div></td>
        <td>{t.designation ?? <span className="muted">Not set</span>}{t.archived && <div><span className="pill mute">Hidden from the website</span></div>}</td>
        <td>{t.classes}</td><td>{t.can_sign_in ? <><span className="pill good">{t.is_admin ? "Admin · can sign in" : "Invite accepted"}</span>
          <div className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>{t.last_sign_in_at ? <>Last signed in {when(t.last_sign_in_at)}</> : t.accepted_at ? <>Accepted {when(t.accepted_at)} · not signed in since</> : "Not signed in yet"}</div></>
          : <TeacherInvite id={t.id} email={t.email} invited={t.invited} />}</td>
        <td><div className="acts"><Link className="abtn sm" href={`/admin/teachers/${t.id}`}>Edit profile</Link>{t.slug && !t.archived && <a className="abtn sm" href={`/teachers/${t.slug}`} target="_blank" rel="noreferrer">View</a>}</div></td></tr>)}</tbody></table></div>
    <section className="card"><h2>Add a teacher</h2>
      <form action={addTeacherAction} className="eform">
        <label className="fld">Full name<input name="name" required maxLength={80} /></label>
        <label className="fld">Email<input name="email" type="email" required maxLength={120} /></label>
        <button className="abtn pri" type="submit">Add and edit profile</button></form>
      <p className="cs" style={{ marginTop: 8 }}>Then fill in their profile and photo. To let them sign in to take registers and write reports, press Invite next to their name. If they’re already an admin (like the principal), invite them with their admin email and the profile joins their account.</p></section>
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
