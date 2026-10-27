import type { Metadata } from "next";
import Link from "next/link";
import { withSchool, siteInfo } from "@/lib/db";

export const metadata: Metadata = { title: "Privacy notice", description: "How we collect, use and look after personal information about families, students and visitors." };

// Edit these when they change. UPDATED is shown at the top of the notice.
const UPDATED = "28 October 2026";
const COMPANY = "Oh-so Educate Ltd";
const CONTACT_EMAIL = "ose@ohsoed.co.uk";
const ICO_NUMBER = "ZB985734";   // ICO registration reference

const KEPT: Record<string, string> = { enquiry: "Enquiries", waitlist: "Waiting-list sign-ups", taster: "Taster bookings", meet_session: "Google Meet join records",
  student_chat: "Student chat messages", parent_message: "Parent–teacher messages", send_details: "SEND details", access_log: "Records of who viewed sensitive information",
  student_record: "Student records (attendance and reports)", financial: "Payment records" };
const months = (m: number) => m % 12 === 0 ? `${m / 12} year${m === 12 ? "" : "s"}` : `${m} months`;

export default async function Privacy() {
  const [site, kept] = await Promise.all([siteInfo(), withSchool((q) => q<{ data_kind: string; keep_months: number; after_event: string }>(`select data_kind, keep_months, after_event from retention_policies where keep_months > 0 order by keep_months, data_kind`)).catch(() => [])]);
  const us = site.demo ? site.name : "OH-SO ED";
  const company = site.demo ? `${site.name} (a made-up school)` : COMPANY;
  return (<>
    <section className="s-phead"><div className="wrap"><h1>Privacy Notice</h1><p>How we look after personal information about families, students and visitors. Last updated {UPDATED}.</p></div></section>
    <section className="s-sec"><div className="wrap legal">
      <nav className="legal-toc" aria-label="On this page"><a href="#who">Who we are</a><a href="#what">What we collect</a><a href="#why">Why we use it</a><a href="#children">Children and students</a><a href="#share">Who we share it with</a><a href="#keep">How long we keep it</a><a href="#rights">Your rights</a><a href="#contact">Contact and complaints</a></nav>

      <h2 id="who">Who we are</h2>
      <p>{us} is an online school run by {company}. We decide how and why your personal information is used, which makes us the “controller” under UK data protection law (the UK GDPR and the Data Protection Act 2018). We’re registered with the Information Commissioner’s Office (ICO){ICO_NUMBER ? <>, registration number <b>{ICO_NUMBER}</b></> : null}.</p>
      <p>Questions about your information? Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>

      <h2 id="what">What we collect</h2>
      <ul>
        <li><b>Parents and guardians:</b> name, email address, phone number if you give it, address for invoices, your bookings and payment history. Card details are taken and held by Stripe, our payment provider; we never see or store your full card number.</li>
        <li><b>Students:</b> first and last name, date of birth, year group, the courses they take, their Google account email (for Classroom and Meet), attendance, classwork marks from Google Classroom, reports, reward points and messages in class chats.</li>
        <li><b>SEND details:</b> if you choose to tell us about a child’s special educational needs or disabilities, we record what you share, and only if you agree.</li>
        <li><b>Lessons:</b> lessons take place in Google Meet. Some lessons are recorded and shared with that class in its Google Classroom so students can catch up. Google Meet tells us who joined and when, which is how registers are taken.</li>
        <li><b>Tasters, enquiries and the waiting list:</b> the details you give on our forms, including your child’s Google account for a taster.</li>
        <li><b>Newsletters:</b> your email address, if you sign up, and whether you open our emails.</li>
        <li><b>Teachers and job applicants:</b> the details needed to employ or consider you, including CVs sent with applications.</li>
        <li><b>Website visitors:</b> our website only uses the cookies it needs to work. See our <Link href="/cookies">cookie notice</Link>.</li>
      </ul>

      <h2 id="why">Why we use it, and our lawful basis</h2>
      <div className="legal-tw"><table><thead><tr><th>What we do</th><th>Lawful basis</th></tr></thead><tbody>
        <tr><td>Take bookings and payments, run lessons, invite students to Google Classroom, send lesson reminders and receipts</td><td>Contract: we need it to provide the lessons you book</td></tr>
        <tr><td>Take registers from Google Meet, write reports, mark progress, share recordings with the class</td><td>Contract, and our legitimate interest in running a good school</td></tr>
        <tr><td>Keep payment and accounting records</td><td>Legal obligation (HMRC requires six years)</td></tr>
        <tr><td>Follow up tasters and enquiries, keep the waiting list, keep class chats safe (blocked words, reporting and moderation)</td><td>Legitimate interests</td></tr>
        <tr><td>Record and share SEND details with your child’s teachers</td><td>Your explicit consent, which you can withdraw at any time</td></tr>
        <tr><td>Send our newsletter</td><td>Your consent. Every newsletter has an unsubscribe link</td></tr>
        <tr><td>Show a student’s first name and initial on the rewards leaderboard</td><td>Your choice in your account settings (you can hide it)</td></tr>
      </tbody></table></div>
      <p>We use an AI assistant (Claude, by Anthropic) to help teachers draft report comments and to help our office with writing. A teacher always reads, edits and approves anything sent to families. We don’t make decisions about students by automated means alone.</p>

      <h2 id="children">Children and students</h2>
      <p>Most of our students are under 18, so we take extra care. We collect only what we need to teach them, we never use their information for advertising, and we never sell it to anyone. Parents and guardians book and manage everything for their children.</p>
      <p><b>If you’re a student:</b> we use your name and Google account so you can join your classes, see your work and get reminders. Your teachers can see your work, attendance and reward points. Your parent or guardian can see your timetable, attendance, work and reports. Messages in class chats can be seen by the school so we can keep everyone safe. If you’re worried about anything, or want to know what we keep about you, ask your parent or email us.</p>
      <p><b>Tasters:</b> a child booked for a taster lesson is invited to that class’s Google Classroom and taken out 3 days after the lesson, unless the family books the course.</p>

      <h2 id="share">Who we share it with</h2>
      <p>We only share information with companies that help us run the school, under contracts that require them to protect it and use it only for us:</p>
      <ul>
        <li><b>Google</b> (Workspace for Education: Classroom, Meet, Drive and email): lessons, classwork and recordings.</li>
        <li><b>Stripe:</b> card payments and refunds.</li>
        <li><b>Brevo:</b> sending our emails and newsletters.</li>
        <li><b>Vercel</b> and <b>Neon:</b> hosting our website and database, in London.</li>
        <li><b>Anthropic</b> (Claude): drafting help as described above.</li>
      </ul>
      <p>Some of these companies may handle information outside the UK, mainly in the EU and the USA. Where they do, it’s protected by the UK’s approved safeguards (the UK–US data bridge or the UK International Data Transfer Agreement/Addendum). We may also share information if the law requires it, for example with the police or local authority to protect a child.</p>

      <h2 id="keep">How long we keep it</h2>
      <p>We keep information only as long as we need it, and delete it automatically after that:</p>
      {kept.length > 0 ? <div className="legal-tw"><table><thead><tr><th>Information</th><th>Kept for</th><th>Counted from</th></tr></thead><tbody>
        {kept.map((k) => <tr key={k.data_kind}><td>{KEPT[k.data_kind] ?? k.data_kind}</td><td>{months(k.keep_months)}</td><td>{k.after_event}</td></tr>)}
      </tbody></table></div> : <p>Student records are kept for 3 years after a student’s last course, payment records for 6 years, and enquiries and tasters for 12 months if you don’t book.</p>}
      <p>Lesson recordings are kept in the class’s Google Classroom and Drive for the length of the course.</p>

      <h2 id="rights">Your rights</h2>
      <p>You can ask us to: give you a copy of the information we hold about you or your child; correct anything that’s wrong; delete information we no longer need; restrict or object to how we use it; and send it to you in a format you can take elsewhere. Where we rely on your consent, you can withdraw it at any time. We’ll reply within one month. There’s no charge.</p>
      <p>Parents can make requests for their children. Students aged 13 or over can usually make requests themselves.</p>

      <h2 id="contact">Contact and complaints</h2>
      <p>Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> with any question or request about your information. If you’re unhappy with how we’ve handled it, please tell us first so we can put it right. You can also complain to the Information Commissioner’s Office at <a href="https://ico.org.uk/make-a-complaint/" target="_blank" rel="noopener">ico.org.uk/make-a-complaint</a>.</p>
      <p className="legal-small">We’ll update this notice when anything changes and show the date at the top.</p>
    </div></section>
  </>);
}
