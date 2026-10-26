"use client";
import { useState } from "react";

const MAX = 3 * 1024 * 1024, TOTAL = 4 * 1024 * 1024;
const Ref = ({ n, required }: { n: number; required: boolean }) => <fieldset className="ref">
  <legend>Referee {n}{n === 1 ? " (current or most recent employer)" : required ? "" : " (optional)"}</legend>
  <div className="row2">
    <label>Full name<input name={`ref${n}_name`} required={required} maxLength={120} /></label>
    <label>Job title<input name={`ref${n}_job_title`} required={required} maxLength={120} /></label>
    <label>Organisation<input name={`ref${n}_organisation`} required={required} maxLength={160} /></label>
    <label>How do they know you?<input name={`ref${n}_relationship`} required={required} maxLength={160} placeholder="e.g. Head of department" /></label>
    <label>Email<input name={`ref${n}_email`} type="email" required={required} maxLength={200} /></label>
    <label>Phone<input name={`ref${n}_phone`} type="tel" required={required} maxLength={40} /></label>
  </div>
</fieldset>;

export function ApplyForm({ action, slug, dbs }: { action: (f: FormData) => Promise<void>; slug: string; dbs: [string, string][] }) {
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const check = (e: React.FormEvent<HTMLFormElement>) => {
    const f = e.currentTarget, pgce = (f.elements.namedItem("pgce_file") as HTMLInputElement).files?.[0], cv = (f.elements.namedItem("cv_file") as HTMLInputElement).files?.[0];
    const msg = !pgce ? "Please upload evidence of your PGCE." : pgce.size > MAX ? "Your PGCE file is over 3 MB. Please upload a smaller scan or photo."
      : cv && cv.size > MAX ? "Your CV is over 3 MB. Please upload a smaller file." : (pgce.size + (cv?.size ?? 0)) > TOTAL ? "Together your files are over 4 MB. Please upload smaller files." : "";
    if (msg) { e.preventDefault(); setErr(msg); return; }
    setErr(""); setBusy(true);
  };
  return <form className="cform apply" action={action} onSubmit={check}>
    <input type="hidden" name="slug" value={slug} />
    <fieldset><legend>About you</legend>
      <div className="row2">
        <label>Full name<input name="name" required autoComplete="name" maxLength={120} /></label>
        <label>Email address<input name="email" type="email" required autoComplete="email" maxLength={200} /></label>
        <label>Phone<input name="phone" type="tel" required autoComplete="tel" maxLength={40} /></label>
        <label>Where are you based?<input name="location" required maxLength={120} placeholder="Town or city" /></label>
      </div>
      <label>Subjects and levels you can teach<input name="subjects" required maxLength={300} placeholder="e.g. GCSE Maths, KS3 Science" /></label>
    </fieldset>
    <fieldset><legend>Your PGCE</legend>
      <div className="row2">
        <label>PGCE subject<input name="pgce_subject" required maxLength={200} /></label>
        <label>Year awarded<input name="pgce_year" required maxLength={10} inputMode="numeric" placeholder="e.g. 2015" /></label>
      </div>
      <label>Evidence of your PGCE (PDF, JPG or PNG, up to 3 MB)<input name="pgce_file" type="file" required accept="application/pdf,image/jpeg,image/png" /></label>
      <label>Your CV (optional: PDF or Word, up to 3 MB)<input name="cv_file" type="file" accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" /></label>
    </fieldset>
    <fieldset><legend>Why you’d like to teach with us</legend>
      <label>Supporting statement<textarea name="cover_letter" required rows={8} maxLength={8000} placeholder="Tell us about your teaching experience, the subjects and levels you teach, and any experience of online teaching or home-educated students." /></label>
    </fieldset>
    <fieldset><legend>Checks</legend>
      <div className="row2">
        <label>Do you have the right to work in the UK?<select name="right_to_work" required defaultValue=""><option value="" disabled>Choose one</option><option value="yes">Yes</option><option value="no">No</option></select></label>
        <label>DBS check<select name="dbs" required defaultValue=""><option value="" disabled>Choose one</option>{dbs.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      </div>
    </fieldset>
    <fieldset><legend>References</legend>
      <p className="note">Give at least two referees. We won’t contact them without telling you first. References from friends or relatives can’t be accepted.</p>
      <Ref n={1} required /><Ref n={2} required />
      <details className="ref3"><summary>Add a third referee</summary><Ref n={3} required={false} /></details>
    </fieldset>
    <label className="decl"><input type="checkbox" name="declaration" required /> <span>The information in this application is true and complete. I understand OH-SO ED will check my qualifications, contact my referees and carry out an enhanced DBS check before any appointment.</span></label>
    <label className="hp" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
    <p className="note">We only use these details to consider your application.</p>
    {err && <p className="notice err" role="alert">{err}</p>}
    <button className="btn btn-brand" type="submit" disabled={busy}>{busy ? "Sending…" : "Send my application"}</button>
  </form>;
}
