import Link from "next/link";
import { startTrial } from "./actions";
import { PLANS, TRIAL_DAYS, gbp } from "../plans";
import { TEACHERS, STUDENTS, GOOGLE } from "@/lib/edtech";
import { VIDEO_TOOLS } from "@/lib/video";

export const metadata = { title: "Start a free trial", description: "Open your own school on OH-SO EdTech in a few minutes and try it free for 30 days. No card needed." };

type Sp = { plan?: string; sent?: string; check?: string; to?: string; error?: string };
export default async function Trial({ searchParams }: { searchParams: Promise<Sp> }) {
  const sp = await searchParams;
  const plan = (["solo", "growth", "school"].includes(sp.plan ?? "") ? sp.plan : "solo") as "solo" | "growth" | "school";
  const p = PLANS.find((x) => x.id === plan)!;
  if (sp.sent) return <Done eyebrow="Thank you" title="We’ve got your request">
    <p className="edt-lead">We’ll be in touch within one working day to set up your School plan trial with your name, logo and colours, and to move your data across with you. Your {TRIAL_DAYS} days start once it’s ready.</p></Done>;
  if (sp.check) return <Done eyebrow="Nearly there" title="Check your email">
    <p className="edt-lead">We’ve sent a link to <b>{(sp.to ?? "your inbox").slice(0, 200)}</b>. Open it to choose a password, and your {p.name} school opens straight away.</p>
    <p className="edt-note">The link works for 48 hours. Nothing there? Check your junk folder, or <Link href={`/osedtech/trial?plan=${plan}`} style={{ color: "var(--teal-d)" }}>try again</Link>.</p></Done>;
  const self = plan !== "school";
  return <section className="edt-sec tight"><div className="edt-wrap" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 28 }}>
    <div style={{ maxWidth: 760 }}>
      <p className="edt-eyebrow">Free for {TRIAL_DAYS} days · no card needed</p>
      <h1 className="edt-h1">Start your free trial</h1>
      <p className="edt-lead">{self ? "Open your own school in a few minutes: confirm your email, choose a password and you’re in. Add your courses, timetable and families, and see how it runs." : "The School plan is set up with you: we add your branding, move your data across and show your team round."}</p>
    </div>
    <nav className="edt-pick" aria-label="Choose a plan">{PLANS.map((x) => <Link key={x.id} href={`/osedtech/trial?plan=${x.id}`} aria-current={x.id === plan ? "true" : undefined}>
      <b>{x.name}</b><span>{gbp(x.monthly)} a month · {x.teachers.toLowerCase()}</span><em>{x.id === "school" ? "On request" : "Start now"}</em></Link>)}</nav>
    <div className="edt-hero-grid" style={{ alignItems: "start" }}>
      <form action={startTrial} className="edt-form">
        <input type="hidden" name="plan" value={plan} />
        {sp.error && <p className="edt-msg bad" role="alert">{sp.error}</p>}
        <div className="edt-two"><label>Your name<input name="name" autoComplete="name" required maxLength={120} /></label>
          <label>Email<input name="email" type="email" autoComplete="email" required maxLength={200} /></label></div>
        <div className="edt-two"><label>School or business name <small>shown on your dashboard; change it any time</small><input name="business" autoComplete="organization" required maxLength={160} /></label>
          {self ? <label>What do you teach? <small>optional</small><input name="subjects" placeholder="e.g. GCSE maths and physics" maxLength={300} /></label>
            : <label>Website <small>optional</small><input name="site" inputMode="url" placeholder="yourschool.co.uk" maxLength={200} /></label>}</div>
        {plan !== "solo" && <fieldset className="edt-fs"><legend>How many teachers?</legend>
          <div className="edt-choice">{TEACHERS.map((t) => <label key={t}><input type="radio" name="teachers" value={t} />{t}</label>)}</div></fieldset>}
        <fieldset className="edt-fs"><legend>Roughly how many students?</legend>
          <div className="edt-choice">{STUDENTS.map((t) => <label key={t}><input type="radio" name="students" value={t} />{t}</label>)}</div></fieldset>
        <fieldset className="edt-fs"><legend>Which video tool do you teach live lessons in? <small>Any tool works: each class gets its own lesson link. You can change it later.</small></legend>
          <div className="edt-choice">{VIDEO_TOOLS.map((t) => <label key={t.id}><input type="radio" name="video" value={t.id} defaultChecked={t.id === "meet"} />{t.id === "other" ? "Something else" : t.name}</label>)}</div></fieldset>
        <fieldset className="edt-fs"><legend>Do you use Google Workspace? <small>Your classes live in Google Classroom and Drive. Not on it yet? We’ll help.</small></legend>
          <div className="edt-choice">{GOOGLE.map((t) => <label key={t}><input type="radio" name="google" value={t} />{t}</label>)}</div></fieldset>
        {!self && <>
          <label>What do you teach? <small>optional</small><input name="subjects" placeholder="e.g. KS3 to A-Level, eight subjects" maxLength={300} /></label>
          <label>What do you use now? <small>optional</small><input name="tools" placeholder="e.g. spreadsheets, PayPal links, Google Classroom" maxLength={300} /></label>
          <label>Anything else? <small>optional</small><textarea name="message" maxLength={3000} /></label></>}
        <label className="edt-hp" aria-hidden="true">Leave this empty<input name="website_url" tabIndex={-1} autoComplete="off" /></label>
        {self ? <label className="edt-check"><input type="checkbox" name="agree" value="1" required /> <span>I’m trying OH-SO EdTech for my own teaching. After {TRIAL_DAYS} days my school pauses until I choose a plan, and it’s deleted if I don’t. We’ll only email you about your trial.</span></label>
          : <label className="edt-check"><input type="checkbox" name="agree" value="1" required /> <span>You can contact me about my trial. We won’t add you to any mailing list.</span></label>}
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}><button className="edt-btn" type="submit">{self ? `Start my ${p.name} trial` : "Ask about the School plan"}</button>
          {self && <span className="edt-note">Already started? <Link href="/osedtech/login" style={{ color: "var(--teal-d)" }}>Sign in</Link></span>}</div>
      </form>
      <aside className="edt-side">
        {self ? <>
          <div className="edt-card"><h3>Your {p.name} trial</h3><p>{p.teachers}, {p.students.replace(" included", "")}, and everything in the {p.name} plan for {TRIAL_DAYS} days. No card needed.</p></div>
          <div className="edt-card"><h3>Safe to try</h3><p>While you try it, nothing is emailed to families or charged. Your own website and family sign-ins switch on when you choose a plan.</p></div>
          <div className="edt-card"><h3>Made for Google classrooms</h3><p>Classes live in Google Classroom, so your school will need Google Workspace. Teach live in Google Meet, Zoom, Teams or any video tool. <Link href="/osedtech#google" style={{ color: "var(--teal-d)" }}>What you’ll need</Link></p></div>
          <div className="edt-card"><h3>Running a bigger school?</h3><p>Payroll, staff roles and guided set-up come with the School plan. <Link href="/osedtech/trial?plan=school" style={{ color: "var(--teal-d)" }}>Ask about School</Link></p></div>
        </> : <>
          <div className="edt-card"><h3>What happens next</h3><p>We email you within one working day, set up your school with your branding, and add your first courses with you. Your {TRIAL_DAYS} days start when it’s ready.</p></div>
          <div className="edt-card"><h3>Nothing to pay</h3><p>No card needed. At the end of the trial, choose a plan to carry on, or we delete your trial school.</p></div>
          <div className="edt-card"><h3>Just you, or a small team?</h3><p>Solo and Growth trials open straight away. <Link href="/osedtech/trial?plan=solo" style={{ color: "var(--teal-d)" }}>Start one now</Link></p></div>
        </>}
      </aside>
    </div>
  </div></section>;
}

function Done({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return <section className="edt-sec"><div className="edt-wrap" style={{ maxWidth: 720 }}>
    <p className="edt-eyebrow">{eyebrow}</p><h1 className="edt-h2">{title}</h1>{children}
    <div className="edt-btns"><Link href="/osedtech/features" className="edt-btn line">Look around the features</Link><Link href="/osedtech" className="edt-btn">Back to the home page</Link></div>
  </div></section>;
}
