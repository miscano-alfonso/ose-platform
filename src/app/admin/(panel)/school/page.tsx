import Link from "next/link";
import { withSchool } from "@/lib/db";
import { emailReady } from "@/lib/email";
import { saveSchoolAction, resetDemoAction, saveVideoAction, saveZoomAppAction, zoomOptionsAction } from "../../actions";
import { zoomStatus, zoomRedirect } from "@/lib/zoom";
import { siteBase } from "@/lib/social";
import { videoSettings } from "@/lib/checkins";
import { VIDEO_TOOLS, toolById } from "@/lib/video";

// School settings (as in the prototype): branding used on this admin, the school's payments and its team.
export default async function SchoolSettings({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const [s, team] = await withSchool(async (q) => [
    (await q<{ name: string; legal_name: string | null; brand: { primary?: string; accent?: string }; stripe_account_id: string | null; is_demo: boolean }>(`select name, legal_name, brand, stripe_account_id, is_demo from schools where id = current_school()`))[0],
    await q<{ name: string; email: string; role: string; last: string | null }>(`select name, email::text, role::text, to_char(last_sign_in_at,'DD Mon YYYY') as last from users where role in ('school_admin','teacher') and disabled_at is null order by role, name`),
  ]);
  const vid = await videoSettings(), tool = toolById(vid.tool), z = await zoomStatus(), base = await siteBase();
  const when = (iso?: string) => iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }) : "";
  const mail = await emailReady(), stripe = !!(s.stripe_account_id || process.env.STRIPE_SECRET_KEY);
  return <>
    <div className="top"><div><h1>School settings</h1><div className="sub">Each school on the platform has its own branding, payments and team.</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    <section className="card"><h2>Demo school</h2><p className="cs">“Demo Academy” has this school’s courses, prices and timetable, with made-up teachers, families, payments, attendance, reports and messages. Use it to show the system to people, or to try things safely. Choose it in the School menu at the top left: no separate sign-in is needed.</p>
      {s.is_demo ? <p className="note">You’re in the demo school now. To make it again, switch back to your own school first.</p> : <form action={resetDemoAction}><button className="abtn" type="submit">Make the demo school (again)</button></form>}
      <p className="note" style={{ marginTop: 8 }}>This wipes the demo school and builds it fresh. It never touches OH-SO ED’s own data, and nothing in it is ever emailed or charged.</p></section>
    <section className="card" id="live"><h2>Live lessons</h2>
      <p className="cs">Classes always use Google Classroom. Live lessons can run in any video tool: put each class’s link under Classes → Edit. Join buttons and lesson reminders send students to that link.</p>
      <form action={saveVideoAction} style={{ display: "grid", gap: 12, maxWidth: 640 }}>
        <label className="fld">Video tool your teachers use<select name="tool" defaultValue={vid.tool}>{VIDEO_TOOLS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 16 }}><input type="checkbox" name="checkins" defaultChecked={vid.checkins} style={{ width: 20, height: 20, marginTop: 2 }} />
          <span><b>Take attendance from Join clicks (check-ins)</b><br /><span className="muted" style={{ fontSize: 15 }}>When a student presses Join (on their dashboard or in their reminder email) from 30 minutes before a lesson until it ends, they’re marked as joining at that moment. After the lesson: on time → present, late → late, no click → absent. It shows who turned up, not how long they stayed. Teachers can still change any mark in the register.</span></span></label>
        <p className="note" style={{ margin: 0 }}>Attendance with {tool.name}: {tool.auto}.{tool.id !== "meet" && !vid.checkins && !(tool.id === "zoom" && z.connected) ? " Turn check-ins on, or teachers take the register by hand." : ""}</p>
        <div><button className="abtn pri" type="submit">Save live lesson settings</button></div>
      </form></section>
    {(vid.tool === "zoom" || z.connected) && <section className="card" id="zoom"><h2>Zoom</h2>
      <p className="cs">Connect the Zoom account that hosts your lessons. Every few hours the site reads who joined each lesson (Zoom’s list of participants), matches them to students by email or by name, and marks attendance when the lesson ends: present, late or left early, like Google Meet. It can also post each new cloud recording to the class’s Google Classroom. Needs a paid Zoom plan (Pro or above) and lesson links with a meeting number (zoom.us/j/…).</p>
      {z.connected ? <>
        <p className="note msg" style={{ marginTop: 0 }}>Connected{z.account ? <> to <b>{z.account}</b></> : ""}{z.by ? ` by ${z.by}` : ""}{z.at ? ` on ${when(z.at)}` : ""}.
          {z.sync.at ? ` Last sync ${when(z.sync.at)}${z.sync.error ? `: ${z.sync.error}` : `: ${z.sync.joins ?? 0} join${z.sync.joins === 1 ? "" : "s"} in ${z.sync.lessons ?? 0} lesson${z.sync.lessons === 1 ? "" : "s"}${z.sync.posted ? `, ${z.sync.posted} recordings posted` : ""}`}.` : " Not synced yet."}</p>
        {z.sync.notes?.map((n, i) => <p key={i} className="note" style={{ margin: "4px 0" }}>{n}</p>)}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
          <form action={zoomOptionsAction}><input type="hidden" name="what" value="sync" /><button className="abtn pri" type="submit">Sync Zoom now</button></form>
          <form action={zoomOptionsAction} style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="hidden" name="what" value="recordings" />
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 15.5 }}><input type="checkbox" name="on" defaultChecked={z.recordings} style={{ width: 18, height: 18 }} />Post cloud recordings to Google Classroom</label>
            <button className="abtn sm" type="submit">Save</button></form>
          <form action={zoomOptionsAction}><input type="hidden" name="what" value="disconnect" /><button className="abtn sm" type="submit">Disconnect</button></form>
        </div>
        {z.recordings && <p className="note" style={{ marginTop: 8 }}>Recordings are posted as a link to the recording in Zoom’s cloud (with its passcode, if it has one), from the recordings account set up under Recordings → Settings.</p>}
      </> : <>
        {!z.platformApp && <>
          <ol style={{ margin: "0 0 12px", paddingLeft: 20, fontSize: 15.5, lineHeight: 1.6 }}>
            <li>Signed in to Zoom as the account that hosts the lessons, go to the <a href="https://marketplace.zoom.us/" target="_blank" rel="noopener">Zoom App Marketplace</a> → Develop → Build App → <b>General App</b>, managed by the user.</li>
            <li>Under OAuth, set the redirect URL and add it to the allow list: <code style={{ userSelect: "all" }}>{zoomRedirect(base)}</code></li>
            <li>Under Scopes, add: <b>view past meeting instances</b>, <b>view past meeting participants</b>, <b>view cloud recordings</b> and <b>view user information</b>.</li>
            <li>Copy the Client ID and Client Secret from App Credentials into the boxes below, then press Connect Zoom.</li>
          </ol>
          <form action={saveZoomAppAction} className="eform" style={{ marginBottom: 12 }}>
            <label className="fld">Client ID<input name="client_id" defaultValue={z.clientId ?? ""} autoComplete="off" style={{ width: 260 }} /></label>
            <label className="fld">Client Secret<input name="client_secret" type="password" placeholder={z.hasApp ? "saved (leave blank to keep)" : ""} autoComplete="new-password" style={{ width: 260 }} /></label>
            <button className="abtn" type="submit">Save</button></form></>}
        {z.hasApp ? <a className="abtn pri" href="/admin/zoom/login">Connect Zoom</a> : <p className="note" style={{ margin: 0 }}>Save the Client ID and Secret first.</p>}
      </>}
    </section>}
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
