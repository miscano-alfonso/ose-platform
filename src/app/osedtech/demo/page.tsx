import Link from "next/link";
import { openDemo } from "./actions";
import { Shot } from "../bits";

export const metadata = { title: "Try the demo", description: "Look round a working OH-SO EdTech school with made-up families, teachers and payments. No sign-up needed." };

export default async function Demo({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  return <section className="edt-sec tight"><div className="edt-wrap edt-hero-grid" style={{ alignItems: "start" }}>
    <div>
      <p className="edt-eyebrow">No sign-up needed</p>
      <h1 className="edt-h1">Look round a demo school</h1>
      <p className="edt-lead">Demo Academy is a made-up online school running on OH-SO EdTech: invented families, students, teachers, classes and payments, so you can click anything.</p>
      <ul className="edt-ticks">
        <li>See the dashboard, timetable, attendance, payments, reports and payroll</li>
        <li>Switch to “Viewing as” a teacher, a parent or a student to see what they see</li>
        <li>Try Social and the newsletter builder</li>
      </ul>
      {sp.error && <p className="edt-msg bad" role="alert" style={{ marginTop: 22 }}>{sp.error}</p>}
      <form action={openDemo} className="edt-btns"><button className="edt-btn" type="submit">Open the demo</button><Link href="/osedtech/trial" className="edt-btn line">Start a free trial</Link></form>
      <p className="edt-note" style={{ marginTop: 14 }}>Everything is made up, and nothing is ever emailed, charged or posted from the demo. Other visitors may be looking round at the same time, and the demo is made fresh every day. The first visit of the day can take up to a minute while it’s prepared.</p>
    </div>
    <Shot src="/osedtech/shots/dashboard.png" alt="Demo Academy’s dashboard" url="admin.demoacademy.co.uk" />
  </div></section>;
}
