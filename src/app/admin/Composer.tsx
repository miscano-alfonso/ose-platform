import { sendEmailAction, sendTestEmailAction } from "./actions";
import { RecipientPicker } from "./RecipientPicker";
import { EmailPreview } from "./EmailPreview";
import type { EmailDesign } from "@/lib/email-layout";

// The email form used by Email (families, classes, teachers) and Marketing (opted-in list only).
export function Composer({ kind, options, ready, draft, design, from }: { kind: "message" | "marketing"; options: { value: string; label: string; count: number; group?: string; people?: { name: string; email: string }[] }[]; ready: boolean; draft?: { audience?: string; subject?: string; body?: string }; design: EmailDesign; from: string }) {
  return <form action={sendEmailAction} className="card cmp" id="compose"><div className="cmp-main">
    {draft?.subject && <p className="note msg">Drafted by the Assistant. Check the wording and who it goes to before sending.</p>}
    <h2>{kind === "marketing" ? "Write a newsletter" : "Write an email"}</h2>
    <input type="hidden" name="kind" value={kind} />
    <RecipientPicker options={options} initial={draft?.audience} />
    <label className="fld">Subject<input name="subject" required maxLength={200} defaultValue={draft?.subject} style={{ maxWidth: 560 }} /></label>
    <label className="fld">Message (leave a blank line between paragraphs)<textarea name="body" required rows={10} maxLength={20000} defaultValue={draft?.body} className="mini" style={{ width: "100%" }} /></label>
    <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" name="confirm" required /> I’ve checked the message and who it goes to</label>
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <button className="abtn pri" type="submit" disabled={!ready}>Send</button>
      <button className="abtn" type="submit" formAction={sendTestEmailAction} formNoValidate disabled={!ready}>Send a test to me</button>
    </div>
    <p className="cs">Each person gets their own copy, so nobody sees anyone else’s address. The logo and footer come from <a href="/admin/email?tab=design">Email design</a>.</p>
  </div><EmailPreview design={design} from={from} marketing={kind === "marketing"} /></form>;
}

export function NotConnected() {
  return <section className="card"><h2>Connect Brevo to send emails</h2>
    <p className="cs">In Brevo: SMTP &amp; API → API keys → create a key, and under Senders add and verify the address emails come from (e.g. hello@ohsoed.co.uk).
      Then connect it under <b>Newsletter → Sending with Brevo</b> (paste the key and choose the sender), or add <b>BREVO_API_KEY</b> and <b>BREVO_SENDER_EMAIL</b> in Vercel.
      For the best delivery, also add the DNS records Brevo shows for ohsoed.co.uk.</p></section>;
}
