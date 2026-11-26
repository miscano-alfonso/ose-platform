import Link from "next/link";
import { getWorkshopsAdmin } from "@/lib/admin-data";
import { setWorkshopStatusAction } from "../../actions";
import { money } from "@/lib/format";
import { siteText } from "@/lib/site-content";
import { listTeachers } from "@/lib/teachers-admin";
import { markingSubjects } from "@/app/(site)/other-services/past-paper-marking/subjects";
import * as P from "@/lib/past-papers";
import { savePaperSettingsAction, paperPaidAction, paperUnpaidAction, paperTeacherAction, paperEmailTeacherAction, paperCloseAction, paperCheckStripeAction } from "../../papers-actions";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const PILL: Record<string, string> = { published: "good", draft: "mute", cancelled: "bad", completed: "info" };

export const dynamic = "force-dynamic";

export default async function Workshops({ searchParams }: { searchParams: Promise<{ tab?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const papers = sp.tab === "papers";
  if (papers) await P.paperPaymentsBackground().catch(() => null);   // payments made since the last look
  const [ws, jobs] = await Promise.all([papers ? Promise.resolve([]) : getWorkshopsAdmin(), P.adminPapers().catch(() => [] as P.PaperJob[])]);
  const todo = jobs.filter((j) => j.paid_at && !j.returned_at).length + jobs.filter((j) => !j.paid_at && !j.handled_at).length;
  const tabs = <div className="segl" style={{ marginBottom: 16 }}><Link href="/admin/workshops" aria-current={!papers ? "true" : undefined}>Workshops</Link>
    <Link href="/admin/workshops?tab=papers" aria-current={papers ? "true" : undefined}>Past paper marking{todo ? ` (${todo})` : ""}</Link></div>;
  if (papers) return <>
    <div className="top"><div><h1>Workshops</h1><div className="sub">Past papers sent from the website’s Workshops page: paid papers go to the subject’s teacher, who has {P.TURNAROUND_HOURS} hours to send them back marked.</div></div></div>
    {tabs}
    {sp.ok && <p className="note msg" role="status">{sp.ok}</p>}{sp.err && <p className="note msg bad" role="alert">{sp.err}</p>}
    <PaperList jobs={jobs} />
    <PaperSettings />
  </>;
  return <>
    <div className="top"><div><h1>Workshops</h1><div className="sub">Published workshops show on the website’s Workshops page.</div></div><span className="grow" /><Link className="abtn pri" href="/admin/workshops/new">Add a workshop</Link></div>
    {tabs}
    <div className="tw"><table>
      <thead><tr><th>Workshop</th><th>When</th><th>Teacher</th><th className="n">Price</th><th className="n">Booked</th><th>Status</th><th></th></tr></thead>
      <tbody>{ws.length === 0 ? <tr><td colSpan={7} className="empty">No workshops yet.</td></tr> : ws.map((w) => <tr key={w.id}>
        <td><Link href={`/admin/workshops/${w.id}`}><b>{w.title}</b></Link></td><td>{when(w.starts_at)}<div className="muted" style={{ fontSize: 13.5 }}>{w.minutes} minutes</div></td>
        <td>{w.teacher ?? <span className="muted">Not set</span>}</td><td className="n">{w.price_pence ? money(w.price_pence) : "Free"}</td>
        <td className="n">{w.booked}{w.capacity ? ` / ${w.capacity}` : ""}</td>
        <td><span className={`pill ${PILL[w.status]}`}>{w.status[0].toUpperCase() + w.status.slice(1)}</span></td>
        <td><div className="acts">
          {w.status !== "published" && <WBtn id={w.id} status="published" label="Publish" />}
          {w.status === "published" && <WBtn id={w.id} status="draft" label="Unpublish" />}
          {w.status !== "cancelled" && <WBtn id={w.id} status="cancelled" label="Cancel" />}
          <Link className="abtn sm" href={`/admin/workshops/${w.id}`}>Edit</Link>
        </div></td></tr>)}</tbody>
    </table></div>
    <p className="note">Workshops can’t clash with the teacher’s lessons or 1:1s. Draft workshops stay off the website until you publish them.</p>
  </>;
}

function WBtn({ id, status, label }: { id: string; status: string; label: string }) {
  return <form action={setWorkshopStatusAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value={status} /><button className="abtn sm" type="submit">{label}</button></form>;
}

const pillFor = (j: P.PaperJob): [string, string] => {
  if (j.returned_at) return ["good", `Sent back ${P.when(j.returned_at)}`];
  if (!j.paid_at) return j.handled_at ? ["mute", "Closed"] : ["warn", "Waiting for payment"];
  const due = P.backBy(j)!, h = P.hoursLeft(due);
  return [h < 0 ? "bad" : j.delay_until ? "warn" : h < 12 ? "warn" : "info", `${j.delay_until ? "Delayed · " : ""}${P.countdownHours(h)}`];
};
function Hidden({ id }: { id: string }) { return <input type="hidden" name="id" value={id} />; }

async function PaperList({ jobs }: { jobs: P.PaperJob[] }) {
  const teachers = (await listTeachers()).filter((t) => !t.archived);
  return <section className="card"><div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}><h2 style={{ margin: 0 }}>Papers</h2><span className="grow" />
      <form action={paperCheckStripeAction}><button className="abtn sm" type="submit">Check Stripe for payments</button></form></div>
    <p className="cs">A paper becomes <b>paid</b> when a {money(P.MARKING_PRICE)} Stripe payment from the same email arrives (checked when you open this page, and daily), or when you press Paid. Paying emails the teacher with the time it’s due back.</p>
    {jobs.length === 0 ? <p className="empty">No papers yet.</p> : <div className="tw"><table>
      <thead><tr><th>Paper</th><th>From</th><th>Teacher</th><th>Status</th><th></th></tr></thead>
      <tbody>{jobs.map((j) => { const [tone, label] = pillFor(j); return <tr key={j.id} id={`p-${j.id}`}>
        <td style={{ minWidth: 200 }}><b>{j.subject ?? "Past paper"}</b>{j.child && <div>for {j.child}</div>}<div className="muted" style={{ fontSize: 13.5 }}>Sent {P.when(j.created_at)}</div>
          {j.file_name && <a href={`/admin/paper-file/${j.id}`} style={{ fontSize: 14 }}>Download the paper</a>}
          {j.returned_at && <div><a href={`/admin/paper-file/${j.id}?marked=1`} style={{ fontSize: 14 }}>Download the marked paper</a></div>}
          {j.message && <div className="muted" style={{ fontSize: 13.5, maxWidth: 320 }}>“{j.message}”</div>}</td>
        <td>{j.parent}<div className="muted" style={{ fontSize: 13.5 }}><a href={`mailto:${j.email}`}>{j.email}</a></div></td>
        <td>{j.returned_at ? (j.teacher ?? "—") : <form action={paperTeacherAction} className="pp-set" style={{ display: "flex", gap: 6, alignItems: "center" }}><Hidden id={j.id} />
            <select name="teacher" defaultValue={j.teacher_id ?? ""} aria-label="Teacher"><option value="">Not set</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
            <button className="abtn sm" type="submit">Change</button></form>}
          {j.paid_at && !j.returned_at && <div className="muted" style={{ fontSize: 13 }}>{j.teacher_emailed_at ? `Emailed ${P.when(j.teacher_emailed_at)}` : j.teacher_id ? "Email not sent yet" : "No teacher: choose one"}</div>}</td>
        <td><span className={`pill ${tone}`}>{label}</span>
          {j.paid_at && <div className="muted" style={{ fontSize: 13 }}>Paid {P.when(j.paid_at)} ({j.paid_how === "stripe" ? "Stripe" : "marked by the office"}){!j.returned_at && <> · back by {P.when(P.backBy(j)!)}</>}</div>}
          {j.delay_until && !j.returned_at && <div style={{ fontSize: 13.5 }}><b>Delay:</b> {j.delay_reason} <span className="muted">(was due {P.when(j.due_at!)}; parent told)</span></div>}
          {j.return_note && <div className="muted" style={{ fontSize: 13 }}>Note to the parent: {j.return_note}</div>}</td>
        <td><div className="acts">
          {!j.paid_at && !j.handled_at && <form action={paperPaidAction}><Hidden id={j.id} /><button className="abtn sm pri" type="submit">Paid</button></form>}
          {j.paid_at && !j.returned_at && <form action={paperEmailTeacherAction}><Hidden id={j.id} /><button className="abtn sm" type="submit">Email the teacher again</button></form>}
          {j.paid_at && !j.returned_at && <form action={paperUnpaidAction}><Hidden id={j.id} /><button className="abtn sm" type="submit">Not paid</button></form>}
          {!j.paid_at && <form action={paperCloseAction}><Hidden id={j.id} />{j.handled_at && <input type="hidden" name="open" value="1" />}<button className="abtn sm" type="submit">{j.handled_at ? "Open again" : "Close"}</button></form>}
        </div></td></tr>; })}</tbody>
    </table></div>}
    <p className="note">Teachers see their paid papers on Teacher → Marking, where they download the paper, warn of a delay (the parent is emailed the new time) and send the marked paper back (emailed to the parent). While test mode is on these emails are held.</p>
  </section>;
}

async function PaperSettings() {
  const [txt, map, teachers] = await Promise.all([siteText(), P.subjectTeachers(), listTeachers()]);
  const subjects = markingSubjects(txt.marking_subjects), live = teachers.filter((t) => !t.archived);
  const rows = [...subjects, "", "", ""];
  return <form action={savePaperSettingsAction} className="card" id="settings" style={{ display: "grid", gap: 12 }}>
    <h2>Subjects and teachers</h2>
    <p className="cs">The subjects parents can choose on the website’s form, in this order, and the teacher who marks each one. Leave a row blank to add nothing; tick Remove to take a subject off.</p>
    <div className="tw pp-set"><table><thead><tr><th>Subject</th><th>Teacher</th><th>Remove</th></tr></thead><tbody>
      {rows.map((sub, i) => <tr key={i}><td><input name={`subject_${i}`} defaultValue={sub} maxLength={80} placeholder={sub ? undefined : "Add a subject, e.g. GCSE History"} style={{ width: "100%", minWidth: 240 }} aria-label="Subject" /></td>
        <td><select name={`teacher_${i}`} defaultValue={map[sub] ?? ""} aria-label="Teacher"><option value="">Not set (the office chooses)</option>{live.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></td>
        <td>{sub && <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><input type="checkbox" name={`remove_${i}`} /> Remove</label>}</td></tr>)}
    </tbody></table></div>
    <label className="fld">“Pay now” link <span className="muted">(a Stripe Payment Link, buy.stripe.com/…, for {money(P.MARKING_PRICE)}: a checkout.stripe.com page link stops working after a day)</span><input name="marking_pay_url" type="url" maxLength={1200} defaultValue={txt.marking_pay_url} style={{ width: "100%" }} /></label>
    <div><button className="abtn pri" type="submit">Save</button></div>
  </form>;
}
