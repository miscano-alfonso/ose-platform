import Link from "next/link";
import { withSchool } from "@/lib/db";
import { emailReady } from "@/lib/email";
import { saveSchoolAction, resetDemoAction } from "../../actions";

// School settings (as in the prototype): branding used on this admin, the school's payments and its team.
export default async function SchoolSettings({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const [s, team] = await withSchool(async (q) => [
    (await q<{ name: string; legal_name: string | null; brand: { primary?: string; accent?: string }; stripe_account_id: string | null; is_demo: boolean }>(`select name, legal_name, brand, stripe_account_id, is_demo from schools where id = current_school()`))[0],
    await q<{ name: string; email: string; role: string; last: string | null }>(`select name, email::text, role::text, to_char(last_sign_in_at,'DD Mon YYYY') as last from users where role in ('school_admin','teacher') and disabled_at is null order by role, name`),
  ]);
  const mail = await emailReady(), stripe = !!(s.stripe_account_id || process.env.STRIPE_SECRET_KEY);
  return <>
    <div className="top"><div><h1>School settings</h1><div className="sub">Each school on the platform has its own branding, payments and team.</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    <section className="card"><h2>Demo school</h2><p className="cs">“Demo Academy” has this school’s courses, prices and timetable, with made-up teachers, families, payments, attendance, reports and messages. Use it to show the system to people, or to try things safely. Choose it in the School menu at the top left: no separate sign-in is needed.</p>
      {s.is_demo ? <p className="note">You’re in the demo school now. To make it again, switch back to your own school first.</p> : <form action={resetDemoAction}><button className="abtn" type="submit">Make the demo school (again)</button></form>}
      <p className="note" style={{ marginTop: 8 }}>This wipes the demo school and builds it fresh. It never touches OH-SO ED’s own data, and nothing in it is ever emailed or charged.</p></section>
    <div className="pgrid">
      <section className="card"><h2>Branding</h2><p className="cs">Used on this admin, and for this school’s emails. The website’s logo is under Website.</p>
        <form action={saveSchoolAction} style={{ display: "grid", gap: 12 }}>
          <label className="fld">School name<input name="name" defaultValue={s.name} maxLength={80} required /></label>
          <label className="fld">Legal name (for invoices and emails)<input name="legal" defaultValue={s.legal_name ?? ""} maxLength={120} /></label>
          <div className="eform"><label className="fld">Main colour<input name="primary" type="color" defaultValue={s.brand?.primary ?? "#0f1747"} style={{ width: 90, height: 40, padding: 3 }} /></label>
            <label className="fld">Highlight colour<input name="accent" type="color" defaultValue={s.brand?.accent ?? "#e3cd4b"} style={{ width: 90, height: 40, padding: 3 }} /></label></div>
          <div><button className="abtn pri" type="submit">Save</button></div></form></section>
      <section className="card"><h2>Payments and email</h2><p className="cs">Each school is paid into its own Stripe account and sends from its own Brevo account.</p>
        <div className="li"><div className="t"><b>Stripe</b><span>Card payments, termly instalments, refunds</span></div><span className={`pill ${stripe ? "good" : "warn"}`}>{stripe ? "Connected" : "Not connected yet"}</span></div>
        <div className="li"><div className="t"><b>Brevo</b><span>Emails to families, newsletters and notices</span></div>{mail ? <span className="pill good">Connected</span> : <Link className="pill warn" href="/admin/newsletter">Connect under Newsletter</Link>}</div></section>
      <section className="card"><h2>Team</h2><p className="cs">Teachers see only their own classes. <Link href="/admin/staff">Invite someone</Link></p>
        {team.map((u) => <div className="li" key={u.email}><div className="t"><b>{u.name}</b><span>{u.email}{u.last ? ` · last signed in ${u.last}` : " · not signed in yet"}</span></div><span className="pill mute">{u.role === "school_admin" ? "Admin" : "Teacher"}</span></div>)}</section>
    </div>
  </>;
}
