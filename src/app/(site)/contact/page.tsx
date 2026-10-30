import type { Metadata } from "next";
import Link from "@/app/(site)/HoverLink";
import { sendMessage } from "./actions";

export const metadata: Metadata = { title: "Contact", description: "Register your interest in OH-SO ED courses, or send us a question." };

const PRESET: Record<string, string> = { "past-paper-marking": "Past Paper Marking: I'd like a past paper marked. Paper, exam board and year: " };

export default async function Contact({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string; about?: string }> }) {
  const sp = await searchParams;
  return (<>
    <section className="s-phead"><div className="wrap"><h1>Contact Us</h1><p>Register your interest here and let us know if you have any questions.</p></div></section>
    <section className="s-sec"><div className="wrap ct-grid">
      <div className="ct-main">
      {sp.sent ? <div className="notice ok" role="status"><h2>Thank you</h2><p>Your message has been sent. We’ll reply by email, usually within two working days.</p><p><Link href="/courses">Browse our courses</Link></p></div> :
      <form className="cform ct-form" action={sendMessage}>
        <h2>Send us a message</h2>
        {sp.error && <p className="notice err" role="alert">Please give your name and a valid email address.</p>}
        <div className="row2">
          <label>Your name<input name="name" required autoComplete="name" maxLength={120} /></label>
          <label>Email address<input name="email" type="email" required autoComplete="email" maxLength={200} /></label>
        </div>
        <div className="row2">
          <fieldset><legend>Which levels are you interested in?</legend>
            <div className="ct-pills">{["KS3", "Pre-GCSE", "iGCSE", "A-Level"].map((l) => <label key={l}><input type="checkbox" name="levels" value={l} /><span>{l}</span></label>)}</div>
          </fieldset>
          <label>How did you hear about us?<select name="heard" defaultValue=""><option value="">Choose one</option><option>Word of Mouth</option><option>Google Search</option><option>Facebook Group</option></select></label>
        </div>
        <label>Message<textarea name="message" rows={7} maxLength={4000} defaultValue={PRESET[sp.about ?? ""] ?? ""} /></label>
        <label className="hp" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
        <div className="ct-send"><button className="btn btn-brand" type="submit">Send a message →</button>
          <p className="note">We reply by email, usually within two working days. We’ll only use your details to reply to you: see our <Link href="/privacy">privacy notice</Link>.</p></div>
      </form>}
      </div>
      <aside className="ct-side">
        <Link className="ct-tile ct-pop" href="/taster"><p className="k">Free taster</p><b>Try a real lesson before you book →</b></Link>
        <Link className="ct-tile" href="/faq"><p className="k">Quick answers</p><b>Lessons, payments, exams and Google Classroom: see the FAQs →</b></Link>
        <Link className="ct-tile" href="/other-services/past-paper-marking"><p className="k">Past paper marking</p><b>Send an iGCSE English paper for marking →</b></Link>
        <div className="ct-tile"><p className="k">Follow us</p><p className="ct-soc"><a href="https://www.facebook.com/ohsoedonline" target="_blank" rel="noopener noreferrer">Facebook /ohsoedonline</a>
          <a href="https://www.linkedin.com/company/ohsoed" target="_blank" rel="noopener noreferrer">LinkedIn /ohsoed</a></p></div>
      </aside>
    </div></section>
  </>);
}
