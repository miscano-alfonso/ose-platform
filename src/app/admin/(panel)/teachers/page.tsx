import Link from "next/link";
import { listTeachers } from "@/lib/teachers-admin";
import { addTeacherAction } from "../../actions";
import { TeacherInvite } from "../../TeacherInvite";

const when = (iso: string) => { const d = new Date(iso), days = Math.floor((Date.now() - d.getTime()) / 864e5);
  const t = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  return days < 1 && d.toDateString() === new Date().toDateString() ? `today, ${t}` : days < 2 ? `yesterday, ${t}` : `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" })}, ${t}`; };

export default async function TeachersAdmin({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const sp = await searchParams;
  const ts = await listTeachers();
  return <>
    <div className="top"><div><h1>Teachers</h1><div className="sub">Profiles shown on the website’s Teachers pages. Press Invite to email a teacher their sign-in link.</div></div></div>
    {sp.err && <p className="note msg bad">{sp.err}</p>}
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
  </>;
}
