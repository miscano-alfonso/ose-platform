import type { Metadata } from "next";
import Link from "next/link";
import { sendMessage } from "./actions";

export const metadata: Metadata = { title: "Contact", description: "Register your interest in OH-SO ED courses, or send us a question." };

const PRESET: Record<string, string> = { "past-paper-marking": "Past Paper Marking: I'd like a past paper marked. Paper, exam board and year: " };

export default async function Contact({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string; about?: string }> }) {
  const sp = await searchParams;
  return (<>
    <section className="s-phead"><div className="wrap"><h1>Contact Us</h1><p>Register your interest here and let us know if you have any questions.</p></div></section>
    <section className="s-sec"><div className="wrap">
      {sp.sent ? <div className="notice ok" role="status"><h2>Thank you</h2><p>Your message has been sent. We’ll reply by email, usually within two working days.</p><p><Link href="/courses">Browse our courses</Link></p></div> :
      <form className="cform" action={sendMessage}>
        {sp.error && <p className="notice err" role="alert">Please give your name and a valid email address.</p>}
        <div className="row2">
          <label>Your name<input name="name" required autoComplete="name" maxLength={120} /></label>
          <label>Email address<input name="email" type="email" required autoComplete="email" maxLength={200} /></label>
        </div>
        <fieldset><legend>Which levels are you interested in?</legend>
          <div className="checks">{["KS3", "Pre-GCSE", "iGCSE", "A-Level"].map((l) => <label key={l}><input type="checkbox" name="levels" value={l} /> {l}</label>)}</div>
        </fieldset>
        <label>How did you hear about us?<select name="heard" defaultValue=""><option value="">Choose one</option><option>Word of Mouth</option><option>Google Search</option><option>Facebook Group</option></select></label>
        <label>Message<textarea name="message" rows={6} maxLength={4000} defaultValue={PRESET[sp.about ?? ""] ?? ""} /></label>
        <label className="hp" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
        <p className="note">We’ll only use your details to reply to you.</p>
        <button className="btn btn-brand" type="submit">Send a message</button>
      </form>}
    </div></section>
  </>);
}
