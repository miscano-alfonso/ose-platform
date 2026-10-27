import Link from "next/link";
import { startTrial } from "./actions";
import { PLANS, TRIAL_DAYS, gbp } from "../plans";
import { TEACHERS, STUDENTS } from "@/lib/edtech";

export const metadata = { title: "Start a free trial", description: "Try OH-SO EdTech free for 30 days, with your own school name, logo and colours. No card needed." };

export default async function Trial({ searchParams }: { searchParams: Promise<{ plan?: string; sent?: string; error?: string }> }) {
  const sp = await searchParams; const plan = PLANS.some((p) => p.id === sp.plan) ? sp.plan! : "";
  if (sp.sent) return <section className="edt-sec"><div className="edt-wrap" style={{ maxWidth: 720 }}>
    <p className="edt-eyebrow">Thank you</p>
    <h1 className="edt-h2">We’ve got your request</h1>
    <p className="edt-lead">We’ll be in touch within one working day to set up your trial school with your name, logo and colours. Your {TRIAL_DAYS} days start once it’s ready, and there’s nothing to pay unless you choose a plan.</p>
    <div className="edt-btns"><Link href="/osedtech/features" className="edt-btn line">Look around the features</Link><Link href="/osedtech" className="edt-btn">Back to the home page</Link></div>
  </div></section>;
  return <section className="edt-sec tight"><div className="edt-wrap" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 28 }}>
    <div style={{ maxWidth: 760 }}>
      <p className="edt-eyebrow">Free for {TRIAL_DAYS} days</p>
      <h1 className="edt-h1">Start your free trial</h1>
      <p className="edt-lead">Tell us a little about your teaching. We’ll set up your own school on the platform with your name, logo and colours, and show you round if you’d like. No card needed.</p>
    </div>
    <div className="edt-hero-grid" style={{ alignItems: "start" }}>
      <form action={startTrial} className="edt-form">
        {sp.error && <p className="edt-msg bad" role="alert">{sp.error}</p>}
        <div className="edt-two"><label>Your name<input name="name" autoComplete="name" required maxLength={120} /></label>
          <label>Email<input name="email" type="email" autoComplete="email" required maxLength={200} /></label></div>
        <div className="edt-two"><label>School or business name <small>a working name is fine</small><input name="business" autoComplete="organization" required maxLength={160} /></label>
          <label>Website <small>optional</small><input name="site" inputMode="url" placeholder="yourschool.co.uk" maxLength={200} /></label></div>
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 8 }}><legend style={{ fontWeight: 500, fontSize: 15.5, marginBottom: 6 }}>How many teachers?</legend>
          <div className="edt-choice">{TEACHERS.map((t) => <label key={t}><input type="radio" name="teachers" value={t} />{t}</label>)}</div></fieldset>
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 8 }}><legend style={{ fontWeight: 500, fontSize: 15.5, marginBottom: 6 }}>Roughly how many students?</legend>
          <div className="edt-choice">{STUDENTS.map((t) => <label key={t}><input type="radio" name="students" value={t} />{t}</label>)}</div></fieldset>
        <label>Which plan are you thinking of?<select name="plan" defaultValue={plan}><option value="">Not sure yet</option>{PLANS.map((p) => <option key={p.id} value={p.id}>{p.name} · {gbp(p.monthly)} a month · {p.teachers.toLowerCase()}</option>)}</select></label>
        <label>What do you teach? <small>optional</small><input name="subjects" placeholder="e.g. GCSE maths and physics" maxLength={300} /></label>
        <label>What do you use now? <small>optional</small><input name="tools" placeholder="e.g. spreadsheets, PayPal links, Google Classroom" maxLength={300} /></label>
        <label>Anything else? <small>optional</small><textarea name="message" maxLength={3000} /></label>
        <label className="edt-hp" aria-hidden="true">Leave this empty<input name="website_url" tabIndex={-1} autoComplete="off" /></label>
        <label className="edt-check"><input type="checkbox" name="agree" value="1" required /> <span>You can contact me about my trial. We won’t add you to any mailing list.</span></label>
        <div><button className="edt-btn" type="submit">Start my free trial</button></div>
      </form>
      <aside className="edt-side">
        <div className="edt-card"><h3>What happens next</h3><p>We email you within one working day, set up your school with your branding, and add your first courses with you. Your {TRIAL_DAYS} days start when it’s ready.</p></div>
        <div className="edt-card"><h3>Nothing to pay</h3><p>No card needed. At the end of the trial, choose a plan to carry on, or we delete your trial school.</p></div>
        <div className="edt-card"><h3>Every feature included</h3><p>Try everything in the School plan during your trial, then pick the plan that fits. <Link href="/osedtech/pricing" style={{ color: "var(--teal-d)" }}>Compare plans</Link></p></div>
      </aside>
    </div>
  </div></section>;
}
