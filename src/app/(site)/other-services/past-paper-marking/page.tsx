import type { Metadata } from "next";
import Link from "@/app/(site)/HoverLink";
import { money } from "@/lib/format";
import { sendPaper } from "./actions";
import { MARKING_SUBJECTS, MARKING_PRICE_PENCE } from "./subjects";
import { siteText } from "@/lib/site-content";

export const metadata: Metadata = { title: "Past paper marking", description: "Send us an iGCSE English past paper: marked within 48 hours with written feedback and targets." };

export default async function PastPaperMarking({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string; subject?: string }> }) {
  const [sp, txt] = await Promise.all([searchParams, siteText()]);
  const pay = /^https:\/\//.test(txt.marking_pay_url ?? "") ? txt.marking_pay_url : null;
  const payBtn = pay && <a className="wk-go pp-pay" href={pay} target="_blank" rel="noopener noreferrer">Pay now · {money(MARKING_PRICE_PENCE)}</a>;
  return (<>
    <section className="s-phead"><div className="wrap"><h1>Past Paper Marking</h1>
      <p>{money(MARKING_PRICE_PENCE)} a paper. Marked within 48 hours of receipt, with detailed feedback in line with the mark scheme and targets for improvement.</p>
      <div className="cd-hbtns"><Link href="/other-services">← Back to More</Link><a href="#send">Send a paper</a></div></div></section>
    <section className="s-sec"><div className="wrap pp-wrap" id="send">
      {sp.sent ? <div className="bk-tile bk-done" role="status"><p className="ab-k">Paper received</p><h2>Thank you, we’ve got your paper</h2>
        <p>{pay ? "Pay below and we’ll return it marked within 48 hours of payment." : "We’ll email you to confirm and send a payment link, then return it marked within 48 hours of payment."}</p>
        {payBtn}</div> :
      <form action={sendPaper} className="cform ct-form pp-form" encType="multipart/form-data">
        <p className="ab-k">Send a paper</p>
        {sp.error && <p className="notice err" role="alert">{sp.error}</p>}
        <div className="row2"><label>Parent first name<input name="first" autoComplete="given-name" required maxLength={80} /></label>
          <label>Parent last name<input name="last" autoComplete="family-name" required maxLength={80} /></label></div>
        <div className="row2"><label>Parent email<input name="email" type="email" autoComplete="email" required maxLength={200} /></label>
          <label>Child’s name<input name="child" maxLength={120} /></label></div>
        <label>Subject<select name="subject" required defaultValue={MARKING_SUBJECTS.includes(sp.subject ?? "") ? sp.subject : ""}>
          <option value="" disabled>Choose a subject</option>{MARKING_SUBJECTS.map((s) => <option key={s}>{s}</option>)}</select></label>
        <label>The paper <small className="note">PDF, Word or photos (JPG, PNG), under 3.5 MB</small><input name="paper" type="file" required accept=".pdf,.doc,.docx,image/jpeg,image/png,image/webp" /></label>
        <label>Message <small className="note">optional: exam board, paper number, anything we should know</small><textarea name="message" rows={4} maxLength={3000} /></label>
        <label className="hp" aria-hidden="true">Leave this empty<input name="website" tabIndex={-1} autoComplete="off" /></label>
        <p className="note">{pay ? `Send the paper, then pay ${money(MARKING_PRICE_PENCE)} with Pay now. Marking starts once it’s paid.` : `After you send it we’ll email a payment link for ${money(MARKING_PRICE_PENCE)}. Marking starts once it’s paid.`}</p>
        <div className="pp-btns"><button className="wk-go pp-send" type="submit">Send the paper</button>{payBtn}</div>
      </form>}
    </div></section>
  </>);
}
