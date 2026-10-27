import Link from "next/link";
import { Shot, Ico, TrialCta } from "./bits";
import { PLANS, TRIAL_DAYS, gbp } from "./plans";

export const metadata = { title: { absolute: "OH-SO EdTech | Run your online school under your own name" } };

const FAQ: [string, string][] = [
  ["What does “under your own name” actually cover?", "Your families and students only ever see your school: your name, logo and colours on your website, your parent and student accounts, and your emails. On Growth and School it’s on your own web address too, with no OH-SO EdTech name on show. On Solo there’s a small “Powered by OH-SO EdTech” mark and a web address like yourname.ohsoedtech.com."],
  ["How is this related to OH-SO ED?", "OH-SO ED is an online school for home-educated students. We built this platform to run it, and OH-SO EdTech offers the same platform to other teachers. You don’t join OH-SO ED or teach for it: you run your own business, under your own name, and your families are yours."],
  ["Who owns my families’ data?", "You do. We look after it for you and only use it to run your school. You can export your families, students, bookings and payments whenever you like, and if you leave we’ll hand everything over and then delete it."],
  ["How do I get paid?", "Families pay by card through your own Stripe account, so the money goes straight to you. We don’t take a commission; Stripe charges its usual card fees. Instalments, discounts and failed-payment follow-ups are built in."],
  ["Do I need Google Workspace?", "Lessons run on Google Meet, and recordings and class work can go through Google Classroom, so a Google Workspace account works best (including the free Workspace for Education if you qualify). Your website, bookings and payments work without it."],
  ["Can you move my existing families across?", "Yes. Send us your spreadsheet and we’ll import families, students and classes. On the School plan we do it for you as part of a guided set-up."],
  [`What happens after the ${TRIAL_DAYS}-day trial?`, "Nothing is charged unless you choose a plan. If you carry on, everything you set up during the trial stays as it is. If you don’t, your trial school is deleted."],
  ["What if I have more students than my plan includes?", "Each plan includes a number of students: 30 on Solo, 250 on Growth and 600 on School. Above that it’s £2 a month for each extra student, so your bill grows with your school. When the extras add up, moving to the next plan is usually cheaper."],
  ["Is there a contract?", "No. Plans are monthly, or yearly with two months free. You can change plan or cancel at any time."],
];

export default function EdTechHome() {
  return <>
    <section className="edt-hero"><div className="edt-wrap edt-hero-grid">
      <div>
        <p className="edt-eyebrow">From the team behind OH-SO ED</p>
        <h1 className="edt-h1">Run your online school <span className="edt-hl">under your own name</span>.</h1>
        <p className="edt-lead">Your website, bookings and payments, Google Meet lessons, attendance, reports and marketing: the platform built for a real online school, ready for yours.</p>
        <ul className="edt-ticks">
          <li>Families book and pay on your own website</li>
          <li>Reminders, attendance and lesson recordings run themselves</li>
          <li>Start on your own, grow into a team, no switching systems</li>
        </ul>
        <div className="edt-btns"><Link href="/osedtech/trial" className="edt-btn">Start a free trial</Link><Link href="/osedtech/demo" className="edt-btn line">Look round the demo</Link></div>
        <p className="edt-note" style={{ marginTop: 12 }}>{TRIAL_DAYS} days free. No card needed. Or <Link href="/osedtech/features" style={{ color: "var(--teal-d)" }}>see how it works</Link>.</p>
      </div>
      <div className="edt-stack">
        <Shot src="/osedtech/shots/dashboard.png" alt="The dashboard of a made-up school, Demo Academy: students enrolled, places filled, payments and attendance" url="admin.demoacademy.co.uk" />
        <Shot className="back" src="/osedtech/shots/payments.png" alt="Payments at Demo Academy: failed payments to follow up and the instalments due next" url="admin.demoacademy.co.uk/payments" />
      </div>
    </div></section>

    <section className="edt-sec white tight"><div className="edt-wrap edt-center">
      <p className="edt-eyebrow">White label</p>
      <h2 className="edt-h2">Your brand at the front. Ours stays behind the scenes.</h2>
      <p className="edt-lead">Families see your school’s name, logo and colours everywhere: your website, their account, every email. Here are three made-up examples on the same platform.</p>
      <div className="edt-brands">
        <div className="edt-brand" style={{ background: "#3b2a6b" }}><span className="pill">Solo</span><div><b>Bright Maths Tuition</b><br /><small>One teacher · GCSE and A-level Maths</small></div></div>
        <div className="edt-brand" style={{ background: "#0f5d57" }}><span className="pill">Growth</span><div><b>The Latin Room</b><br /><small>Four teachers · Latin, Greek and Classics</small></div></div>
        <div className="edt-brand" style={{ background: "#9a3b1f" }}><span className="pill">School</span><div><b>Northbridge Online School</b><br /><small>Fifteen teachers · KS3 to GCSE, full timetable</small></div></div>
      </div>
    </div></section>

    <section className="edt-sec"><div className="edt-wrap">
      <p className="edt-eyebrow">One place for all of it</p>
      <h2 className="edt-h2">Everything a teaching business runs on</h2>
      <p className="edt-lead">Stop stitching together a booking tool, a payment link, a spreadsheet and your inbox. It’s all connected: when a family books, they’re on the register, getting reminders and in the right Google Classroom.</p>
      <div className="edt-grid">
        <div className="edt-card"><Ico n="site" /><h3>Your website</h3><p>Course pages, timetable, term dates and prices, all kept up to date from your dashboard.</p></div>
        <div className="edt-card"><Ico n="card" /><h3>Bookings and payments</h3><p>Families book and pay by card, in full or in instalments. Failed payments are followed up for you.</p></div>
        <div className="edt-card"><Ico n="cal" /><h3>Classes, 1:1s and workshops</h3><p>Weekly classes across your terms, private lessons and one-off workshops, with tasters and a waiting list.</p></div>
        <div className="edt-card"><Ico n="meet" /><h3>Google Meet attendance</h3><p>Every lesson gets its Meet link, and attendance is taken from who actually joined.</p></div>
        <div className="edt-card"><Ico n="mail" /><h3>Emails that send themselves</h3><p>Lesson reminders, receipts and follow-ups, sent at the right time, from your school’s address.</p></div>
        <div className="edt-card"><Ico n="video" /><h3>Recordings that post themselves</h3><p>Every Meet recording renamed, filed and posted to the right Google Classroom, with a title card at the start. <a href="/osedtech/features#recordings" style={{ color: "var(--teal-d)" }}>See how</a></p></div>
        <div className="edt-card"><Ico n="report" /><h3>Reports and portals</h3><p>Reports to families, and accounts for parents and students with chats and reward points.</p></div>
        <div className="edt-card"><Ico n="spark" /><h3>Marketing with Claude</h3><p>Newsletters, and social posts in your style that Claude drafts and illustrates, posted to Facebook and Instagram.</p></div>
      </div>
      <TrialCta />
    </div></section>

    <section className="edt-sec white" id="families"><div className="edt-wrap">
      <p className="edt-eyebrow">What families see</p>
      <h2 className="edt-h2">A proper account for every parent and student</h2>
      <p className="edt-lead">This is where you look like an established school. Parents and students sign in to your school, not a generic app, and find everything in one place instead of in your inbox.</p>
      <div className="edt-row" style={{ marginTop: 40 }}>
        <div><h3>For parents</h3><p>Each child’s classes, lesson times and teachers, with their attendance and assignments.</p>
          <ul><li>Payments: what’s been paid, what’s next, and a saved card</li><li>Reports from teachers, the day they’re published</li><li>Messages with the school, kept together</li><li>Book 1:1 lessons and workshops, and update their details</li></ul></div>
        <Shot src="/osedtech/shots/parent.png" alt="A parent’s home page at Demo Academy: their child’s classes and attendance, assignments, next payment and reports" url="demoacademy.co.uk/parent" />
      </div>
      <div className="edt-row flip">
        <div><h3>For students</h3><p>Their own login, with their classes, the next lesson and a button straight into it.</p>
          <ul><li>A page for each class</li><li>Class chats, which parents switch on</li><li>Reward points from teachers, with a school leaderboard</li></ul></div>
        <Shot src="/osedtech/shots/student-rewards.png" alt="A student’s rewards page at Demo Academy: their points and the school leaderboard" url="demoacademy.co.uk/student/rewards" />
      </div>
      <p className="edt-note" style={{ marginTop: 22 }}>Parent accounts come with every plan; student accounts, chats and rewards from Growth. <Link href="/osedtech/demo" style={{ color: "var(--teal-d)" }}>See them in the demo</Link> using “Viewing as”.</p>
    </div></section>

    <section className="edt-sec ink"><div className="edt-wrap">
      <p className="edt-eyebrow">Built for a real school</p>
      <h2 className="edt-h2">Not a guess at what teachers need</h2>
      <p className="edt-quote">We built this to run <a href="/" style={{ color: "var(--sun)" }}>OH-SO ED</a>, an online school for home-educated students, so it’s shaped around how a school actually works: terms and holidays, families with more than one child, teachers who are paid by the lesson, and lessons that live in Google Meet and Classroom.</p>
      <div className="edt-stats">
        <div className="edt-stat"><b>18</b><span>weekly group classes, plus 1:1s and workshops</span></div>
        <div className="edt-stat"><b>KS3 to GCSE</b><span>across English, maths, the sciences and humanities</span></div>
        <div className="edt-stat"><b>6 terms</b><span>of timetable, reminders and billing a year</span></div>
        <div className="edt-stat"><b>1 system</b><span>for the website, families, teachers and money</span></div>
      </div>
      <p className="edt-note" style={{ marginTop: 28 }}>Choosing OH-SO EdTech doesn’t make you part of OH-SO ED. Your school, your name, your families.</p>
    </div></section>

    <section className="edt-sec"><div className="edt-wrap">
      <p className="edt-eyebrow">Getting started</p>
      <h2 className="edt-h2">Up and running in a few days</h2>
      <div className="edt-grid">
        <div className="edt-card"><h3>1. Start your free trial</h3><p>Tell us about your teaching and we’ll set up your school with your name, logo and colours.</p></div>
        <div className="edt-card"><h3>2. Add your courses and families</h3><p>Add your classes, term dates and prices, or send us your spreadsheet and we’ll bring everything across.</p></div>
        <div className="edt-card"><h3>3. Share your website</h3><p>Families book and pay online. From then on, reminders, registers and receipts look after themselves.</p></div>
      </div>
    </div></section>

    <section className="edt-sec white" id="who"><div className="edt-wrap">
      <p className="edt-eyebrow">Who it’s for</p>
      <h2 className="edt-h2">From one teacher to a whole online school</h2>
      <p className="edt-lead">Start with what you need today. When you take on another teacher, or start paying staff, move up a plan and everything comes with you.</p>
      <div className="edt-grid">
        {PLANS.map((p) => <div key={p.id} className="edt-card">
          <h3>{p.name}</h3><p>{p.for}. {p.teachers}, {p.students.toLowerCase()}.</p>
          <p style={{ marginTop: 12, color: "var(--ink)" }}><b style={{ fontSize: 26, fontWeight: 500 }}>{gbp(p.monthly)}</b> a month</p>
          <ul style={{ margin: "12px 0 0", paddingLeft: 18, color: "var(--muted)", fontSize: 15.5 }}>{p.features.slice(0, 3).map((f) => <li key={f}>{f}</li>)}</ul>
          <p style={{ marginTop: 14 }}><Link href={`/osedtech/pricing#${p.id}`} style={{ color: "var(--teal-d)", fontWeight: 500 }}>Everything in {p.name} →</Link></p>
        </div>)}
      </div>
      <p style={{ marginTop: 22 }}><Link href="/osedtech/pricing#compare" style={{ color: "var(--teal-d)", fontWeight: 500 }}>How we compare with other tools →</Link></p>
    </div></section>

    <section className="edt-sec" id="faq"><div className="edt-wrap edt-center">
      <p className="edt-eyebrow">Questions</p>
      <h2 className="edt-h2">Good questions to ask</h2>
      <div className="edt-faq" style={{ textAlign: "left" }}>{FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
    </div></section>

    <section className="edt-sec ink"><div className="edt-wrap edt-center">
      <h2 className="edt-h2">Look like an established school from day one</h2>
      <p className="edt-lead">Try the whole platform free for {TRIAL_DAYS} days, with your own name on it.</p>
      <TrialCta dark />
    </div></section>
  </>;
}
