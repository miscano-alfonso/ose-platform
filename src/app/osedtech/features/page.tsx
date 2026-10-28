import Link from "next/link";
import { Shot, TrialCta, RecordingVisual, GoogleDots } from "../bits";

export const metadata = { title: "Features", description: "What OH-SO EdTech does: your website and bookings, card payments, classes and 1:1s, Google Meet attendance, recordings to Classroom, reports, teacher logins, payroll and marketing." };

type Row = { id: string; eyebrow: string; title: string; text: string; points: string[]; shot: string; alt: string; url: string; plan: string; visual?: "recordings" };
const ROWS: Row[] = [
  { id: "website", eyebrow: "Your website", title: "A proper school website, kept up to date for you", plan: "All plans",
    text: "Your courses, timetable, term dates and prices come straight from your dashboard, so the website is never out of date. Families can see what’s on, check prices for their child and book.",
    points: ["Course pages by subject and level, with your teachers", "Timetable, term dates and a price calculator", "Free taster lessons and a waiting list for full classes", "Your logo, colours and fonts throughout"],
    shot: "/osedtech/shots/site.png", alt: "OH-SO ED’s own website, built on the platform", url: "ohsoed.co.uk" },
  { id: "payments", eyebrow: "Bookings and payments", title: "Families book and pay without you chasing", plan: "All plans",
    text: "Card payments go straight to your own Stripe account, in full or in instalments. Prices, discount codes and multi-course offers are worked out for you, and failed payments are followed up automatically.",
    points: ["Instalments across the year, charged on the dates you set", "Discount codes and multi-course offers", "Failed-payment emails and a list of who to chase", "Parents see every payment in their account"],
    shot: "/osedtech/shots/payments.png", alt: "Payments in Demo Academy’s dashboard", url: "admin.demoacademy.co.uk/payments" },
  { id: "lessons", eyebrow: "Classes, 1:1s and workshops", title: "Your whole timetable in one place", plan: "All plans",
    text: "Weekly classes run across your terms and skip the holidays. Private 1:1 lessons and one-off workshops sit alongside them, each with its own booking page.",
    points: ["Terms and holidays set once for the year", "A lesson link for every class: Google Meet, Zoom, Teams or any video tool", "Students invited to the right Google Classroom when they book, and taken out if they leave", "Class lists that update themselves as families book or leave", "Tasters that turn into bookings"],
    shot: "/osedtech/shots/timetable.png", alt: "Demo Academy’s weekly timetable", url: "admin.demoacademy.co.uk/timetable" },
  { id: "attendance", eyebrow: "Attendance", title: "Registers that take themselves", plan: "All plans",
    text: "Attendance comes from who actually joined each Google Meet, matched to the right student, even when they join from a parent’s account. Teaching on Zoom, Teams or another tool? It comes from each student’s Join check-in instead. You see who’s slipping before it becomes a problem.",
    points: ["Present, late and absent, per lesson and per term", "Students below 50% flagged on the dashboard", "A weekly email listing who’s slipping"],
    shot: "/osedtech/shots/attendance.png", alt: "Attendance for a class at Demo Academy", url: "admin.demoacademy.co.uk/attendance" },
  { id: "recordings", eyebrow: "Lesson recordings", title: "Recordings that file and post themselves", plan: "All plans", visual: "recordings", shot: "", alt: "", url: "",
    text: "Record the lesson in Google Meet and that’s it. The recording is renamed, filed in the right subject folder and posted to the class’s Google Classroom under the same topic as the teacher’s lesson post, with a title card added to the start of the video.",
    points: ["Named by class, term and lesson number, e.g. “GCSE Biology - T1 Lesson 12”", "A title card at the start: subject roundel, lesson title, teacher and date", "Posted to Google Classroom once the teacher has posted the lesson, never twice", "Accidental short recordings and duplicates set aside for you to check", "Chat transcripts archived; 1:1 lessons filed in their own folders"] },
  { id: "families", eyebrow: "Families and students", title: "Everything about a family on one page", plan: "All plans; student accounts from Growth",
    text: "Parents have their own account for bookings, payments and messages. From Growth, students get theirs too, with class chats and reward points.",
    points: ["Parents, children, courses and payments together", "Messages with families, kept in one place", "Data protection tools for exports and deletions"],
    shot: "/osedtech/shots/parent.png", alt: "A parent’s home page at Demo Academy", url: "demoacademy.co.uk/parent" },
  { id: "reports", eyebrow: "Teachers and reports", title: "A login for every teacher", plan: "Growth and School",
    text: "Each teacher sees their own day, timetable, classes and messages. Reports are written in the dashboard and sent to families, with a check that the term’s assessment has been marked in Google Classroom.",
    points: ["My day, my timetable, my classes", "Reports to families, written once and sent", "Reward points that students can see"],
    shot: "/osedtech/shots/reports.png", alt: "Reports being written at Demo Academy", url: "admin.demoacademy.co.uk/reports" },
  { id: "payroll", eyebrow: "Payroll", title: "Teachers paid from the lessons they taught", plan: "School",
    text: "Pay is worked out from the timetable and attendance, so you’re not adding up lessons in a spreadsheet at the end of the month. Teachers can see what they’re owed.",
    points: ["Pay per lesson, per teacher", "A file ready for your payroll or bank", "Teachers see their own pay"],
    shot: "/osedtech/shots/payroll.png", alt: "Payroll at Demo Academy", url: "admin.demoacademy.co.uk/payroll" },
  { id: "marketing", eyebrow: "Marketing", title: "Newsletters and social posts in your style", plan: "Growth and School",
    text: "Build newsletters from your courses in a few clicks and see who opened them. For social media, pick what the post is for and Claude drafts the words and can draw a picture to go with it, in your colours, ready to post to Facebook and Instagram.",
    points: ["Newsletters, subscribers and email stats", "Post pictures in your template, in every size", "Claude drafts and illustrations, Canva pictures, duotone effects"],
    shot: "/osedtech/shots/social.png", alt: "Building a social post at Demo Academy", url: "admin.demoacademy.co.uk/social" },
];

export default function Features() {
  return <>
    <section className="edt-sec tight"><div className="edt-wrap">
      <p className="edt-eyebrow">Features</p>
      <h1 className="edt-h1">How it works</h1>
      <p className="edt-lead">The admin side runs your school; the website side brings families in. They’re one system, so a booking on your website is instantly a place on a register, a payment plan and a reminder email.</p>
      <p className="edt-google"><GoogleDots /> Built around Google Meet, Classroom and Drive. Your school will need Google Workspace: <Link href="/osedtech#google" style={{ color: "var(--teal-d)" }}>what you’ll need</Link>.</p>
      <p className="edt-note" style={{ marginTop: 14 }}>Pictures show Demo Academy, a made-up school we use for training, so no real families appear here.</p>
      <nav aria-label="On this page" className="edt-btns" style={{ marginTop: 22 }}>{ROWS.map((r) => <a key={r.id} href={`#${r.id}`} className="edt-btn line sm">{r.eyebrow}</a>)}</nav>
      {ROWS.map((r, i) => <div key={r.id} id={r.id} className={`edt-row${i % 2 ? " flip" : ""}`} style={{ scrollMarginTop: 90 }}>
        <div>
          <p className="edt-eyebrow">{r.eyebrow} · <span style={{ color: "var(--muted)", letterSpacing: ".08em" }}>{r.plan}</span></p>
          <h3>{r.title}</h3><p>{r.text}</p>
          <ul>{r.points.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
        {r.visual === "recordings" ? <RecordingVisual /> : <Shot src={r.shot} alt={r.alt} url={r.url} />}
      </div>)}
    </div></section>
    <section className="edt-sec ink"><div className="edt-wrap edt-center">
      <h2 className="edt-h2">See it with your own name on it</h2>
      <p className="edt-lead">Start a free trial and we’ll set up your school with your logo and colours. <Link href="/osedtech/pricing" style={{ color: "var(--sun)" }}>Compare the plans</Link>.</p>
      <TrialCta dark />
    </div></section>
  </>;
}
