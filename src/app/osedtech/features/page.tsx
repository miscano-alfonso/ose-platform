import { cms } from "@/app/osedtech/cms";
import Link from "next/link";
import { Shot, TrialCta, RecordingVisual, GoogleDots } from "../bits";

export const metadata = { title: "Features", description: "What OH-SO EdTech does: your website and bookings, card payments, classes and 1:1s, lessons in Google Meet, Zoom or any video tool, attendance, recordings to Classroom, reports, teacher logins, payroll and marketing." };

type Row = { id: string; eyebrow: string; title: string; text: string; points: string[]; shot: string; alt: string; url: string; plan: string; visual?: "recordings" };
const ROWS: Row[] = [
  { id: "website", eyebrow: "Your website", title: "A proper school website, kept up to date for you", plan: "All plans",
    text: "Your courses, timetable, term dates and prices come straight from your dashboard, so the website is never out of date. Families can see what’s on, check prices for their child and book.",
    points: ["Course pages by subject and level, with your teachers", "Timetable, term dates and a price calculator", "Labels like “Few spaces left” and “Almost full”, set from the numbers or chosen by you", "Your logo, colours and fonts throughout"],
    shot: "/osedtech/shots/site.png", alt: "OH-SO ED’s own website, built on the platform", url: "ohsoed.co.uk" },
  { id: "payments", eyebrow: "Bookings and payments", title: "Families book and pay without you chasing", plan: "All plans",
    text: "Card payments go straight to your own Stripe account, in full or in instalments. Prices, discount codes and multi-course offers are worked out for you, and failed payments are followed up automatically.",
    points: ["Instalments across the year, charged on the dates you set", "Multi-course discounts that count every child in the family, and discount codes", "Failed-payment emails and a list of who to chase", "Parents see what’s paid, what’s next and what’s left for the whole course", "Payments already in your Stripe account matched to each family’s terms, read only"],
    shot: "/osedtech/shots/payments.png", alt: "Payments in Demo Academy’s dashboard", url: "admin.demoacademy.co.uk/payments" },
  { id: "tasters", eyebrow: "Tasters", title: "Tasters that follow themselves up", plan: "All plans",
    text: "A family books a free taster lesson on your website and everything after that happens on its own. You see each taster’s journey, and whether it turned into a booking.",
    points: ["Confirmation for the parent, and the lesson and Classroom links for the child", "A reminder before the lesson, and attendance read from the Meet", "Afterwards, an invitation to book, or to choose another date if they missed it", "A last reminder a week later if the family hasn’t replied", "Booked, came, enrolled: the numbers on your dashboard"],
    shot: "/osedtech/shots/tasters.png", alt: "Taster journeys at Demo Academy", url: "admin.demoacademy.co.uk/tasters" },
  { id: "lessons", eyebrow: "Classes, 1:1s and workshops", title: "Your whole timetable in one place", plan: "All plans",
    text: "Weekly classes run across your terms and skip the holidays. Set the week on a grid: press where a lesson goes, and it warns you if a teacher or a student would be in two places at once. Private 1:1s and one-off workshops sit alongside.",
    points: ["Terms and holidays set once for the year", "A timetable grid with clash warnings, filtered by level or teacher", "Connect a class’s Google Classroom in one click: its link, invitation link and Meet link come with it", "A lesson link for every class: Google Meet, Zoom, Teams or any video tool", "Students invited to the right Google Classroom when they book, and taken out if they leave", "1:1s booked in the hours each teacher offers"],
    shot: "/osedtech/shots/timetable.png", alt: "Demo Academy’s weekly timetable", url: "admin.demoacademy.co.uk/timetable" },
  { id: "attendance", eyebrow: "Attendance", title: "Registers that take themselves", plan: "All plans",
    text: "Attendance comes from who actually joined each Google Meet or Zoom lesson, matched to the right student, even when they join from a parent’s account. Teaching on Teams or another tool? It comes from each student’s Join check-in instead.",
    points: ["See who’s in the lesson while it runs: 5/8 on the timetable", "Present, late and absent, per lesson and per term", "Parents report absences from their timetable", "Students below 50% flagged on the dashboard"],
    shot: "/osedtech/shots/attendance.png", alt: "Attendance for a class at Demo Academy", url: "admin.demoacademy.co.uk/attendance" },
  { id: "recordings", eyebrow: "Lesson recordings", title: "Recordings that file and post themselves", plan: "All plans", visual: "recordings", shot: "", alt: "", url: "",
    text: "Record the lesson in Google Meet and that’s it. The recording is renamed, filed in the right subject folder and posted to the class’s Google Classroom under the same topic as the teacher’s lesson.",
    points: ["Named by class, term and lesson number, e.g. “GCSE Biology - T1 Lesson 12”", "A title card at the start: subject roundel, lesson title, teacher and date", "Posted to Google Classroom once the teacher has posted the lesson, never twice", "Accidental short recordings and duplicates set aside for you to check", "Chat transcripts archived; 1:1 lessons filed in their own folders"] },
  { id: "email", eyebrow: "Messages and email", title: "Every conversation with families in one place", plan: "All plans",
    text: "Parents and teachers message each other and the office in one Messages page. When a family answers by email instead, the reply lands in the same conversation. Reminders, payment emails and reports go out on their own, in your school’s colours.",
    points: ["One Messages page for parents, teachers and the office", "Email replies filed into the right conversation", "Automatic emails with a live preview on computer and phone", "Test mode: see every email that would have gone, before families get anything"],
    shot: "/osedtech/shots/email.png", alt: "Email design at Demo Academy", url: "admin.demoacademy.co.uk/email" },
  { id: "families", eyebrow: "Families and students", title: "Everything about a family on one page", plan: "All plans; student accounts from Growth",
    text: "Parents have their own account for their children’s timetable, work, payments, reports and messages. From Growth, students get theirs too, with class chats and reward points.",
    points: ["A month timetable for each child: who came, and absences reported in a tap", "Home education information and exam dates for where the family lives, with reminders to book exams", "Parents, children, courses and payments together for you", "Data protection tools for exports and deletions"],
    shot: "/osedtech/shots/parent.png", alt: "A parent’s home page at Demo Academy", url: "demoacademy.co.uk/parent" },
  { id: "reports", eyebrow: "Teachers, marking and reports", title: "A login for every teacher", plan: "Growth and School",
    text: "Each teacher sees their own day, timetable, classes, marking and messages. Reports start from the term’s Google Classroom marks; you approve them or send them back, and parents get them on their dashboard and by email as a PDF.",
    points: ["Marking on a 7-day turnaround, with overdue work flagged", "Progress worked out from Classroom marks, and teachers write the comment", "Approve or send back, then publish and email every family", "Report lists keep up with students who join or leave", "Reward points that students can see"],
    shot: "/osedtech/shots/reports.png", alt: "Reports being written at Demo Academy", url: "admin.demoacademy.co.uk/reports" },
  { id: "payroll", eyebrow: "Payroll", title: "Teachers paid from the lessons they taught", plan: "School",
    text: "Pay is worked out from the timetable and attendance, so you’re not adding up lessons in a spreadsheet at the end of the month. Teachers can see what they’re owed.",
    points: ["Pay per lesson, per teacher", "A teacher’s own rate at any level", "A file ready for your payroll or bank", "Teachers see the same figures, term by term"],
    shot: "/osedtech/shots/payroll.png", alt: "Payroll at Demo Academy", url: "admin.demoacademy.co.uk/payroll" },
  { id: "marketing", eyebrow: "Marketing", title: "Fill your classes, in your style", plan: "Growth and School",
    text: "When a class is low on numbers, “Fill a class” finds the families who could take it (current students at that level who don’t do the subject, and the waiting list) and invites them to a free taster in one email, then shows what came of it. Newsletters and social posts that Claude drafts and illustrates sit alongside.",
    points: ["Fill a class: the emptiest classes first, with families ready to invite", "Newsletters, subscribers and email stats", "Post pictures in your template, in every size", "Claude drafts and illustrations, Canva pictures, duotone effects"],
    shot: "/osedtech/shots/fill-class.png", alt: "Fill a class at Demo Academy", url: "admin.demoacademy.co.uk/fill-classes" },
  { id: "dashboards", eyebrow: "Your dashboards", title: "Arranged the way you work", plan: "All plans",
    text: "Every dashboard is made of boxes you can move and resize, for you, your teachers and your families. Each page has a short “How it works” guide, and on the School plan an Assistant answers questions about your school in plain English.",
    points: ["Move, resize and hide the boxes; set a layout for all teachers or all parents", "A welcome guide and “How it works” tips on every page", "On the School plan, the Assistant: “who has attendance under 75%?”, and it drafts the email (with your own Claude key)", "Visitors to your website, by page and place"],
    shot: "/osedtech/shots/dashboard.png", alt: "Demo Academy’s dashboard", url: "admin.demoacademy.co.uk" },
];

export default async function Features() {
  return cms("features", <>
    <section className="edt-sec tight"><div className="edt-wrap">
      <p className="edt-eyebrow">Features</p>
      <h1 className="edt-h1">How it works</h1>
      <p className="edt-lead">The admin side runs your school; the website side brings families in. They’re one system, so a booking on your website is instantly a place on a register, a payment plan and a reminder email.</p>
      <p className="edt-google"><GoogleDots /> <span>Built around Google Classroom and Drive, with live lessons in Google Meet, Zoom, Teams or any video tool. Your school will need Google Workspace: <Link href="/osedtech#google" style={{ color: "var(--teal-d)" }}>what you’ll need</Link>.</span></p>
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
  </>);
}
