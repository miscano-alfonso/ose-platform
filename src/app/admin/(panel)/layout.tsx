import type { Metadata } from "next";
import { after } from "next/server";
import { socialBackground } from "@/lib/social";
import { meetBackground } from "@/lib/meet";
import { automationsBackground } from "@/lib/automations";
import { classroomBackground } from "@/lib/classroom";
import { inboxBackground, unreadInbox } from "@/lib/inbox";
import { recordingsBackground } from "@/lib/recordings";
import { requireStaff } from "@/lib/auth";
import { withSchool } from "@/lib/db";
import { signOutAction } from "../actions";
import { AdminNav } from "../AdminNav";
import "../admin.css";
import { DashStyles } from "../DashStyles";
import { brandSrc } from "@/lib/brand";
import { cookies } from "next/headers";
import { schoolsFor, siteSchool, SCHOOL_COOKIE } from "@/lib/db";
import { Switchers } from "../Switchers";
import { Assistant } from "../Assistant";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const me = await requireStaff();
  after(() => socialBackground());
  after(() => meetBackground());
  after(() => classroomBackground()); // class work and marks from Google Classroom, every 6 hours
  after(() => inboxBackground());
  after(() => recordingsBackground()); // lesson recordings: renamed, filed, posted to Classroom, title cards // families' emails from the school inbox, every 15 minutes
  after(() => automationsBackground()); // lesson reminders, taster emails, payment reminders… // reads new Google Meet joins every few hours, and sends Friday's attendance alert // scheduled Instagram posts and the weekly moments report, after the page is sent
  const { logo } = await brandSrc();
  const [x] = await withSchool((q) => q<{ rep: number; msg: number; joins: number }>(`select
    (select count(*)::int from report_entries e join report_cycles c on c.id = e.cycle_id where e.status = 'submitted' and c.status <> 'published') as rep,
    (select count(*)::int from message_threads th where th.status = 'open' and th.last_message_at < now() - interval '2 days'
      and (select m.sender from messages m where m.thread_id = th.id order by m.created_at desc limit 1) = 'parent') as msg,
    coalesce((select coalesce(value->>'people', value->>'unmatched')::int from meet_kv where key = 'sync'), 0) as joins`)).catch(() => [{ rep: 0, msg: 0, joins: 0 }]);
  const [c] = await withSchool((q) => q<{ enq: number; jobs: number; failed: number; tasters: number }>(`select (select count(*)::int from enquiries where handled_at is null) as enq,
    (select count(*)::int from job_applications where status = 'new') as jobs, (select count(*)::int from instalments where status = 'failed') as failed,
    (select count(*)::int from taster_bookings b join lesson_events ev on ev.id = b.lesson_event_id where b.status = 'booked' and ev.lesson_date between current_date and current_date + 7) as tasters`)).catch(async () =>
    withSchool((q) => q<{ enq: number; jobs: number; failed: number; tasters: number }>(`select (select count(*)::int from enquiries where handled_at is null) as enq, (select count(*)::int from job_applications where status = 'new') as jobs,
      (select count(*)::int from instalments where status = 'failed') as failed, 0 as tasters`)));
  const inboxUnread = await unreadInbox();
  const jar = await cookies();
  const brand = (await withSchool((q) => q<{ brand: { primary?: string; accent?: string } }>(`select brand from schools where id = current_school()`)))[0]?.brand ?? {};
  const hex = (v: unknown, d: string) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : d;
  const [schools, teachers] = await Promise.all([schoolsFor(me.email), withSchool((q) => q<{ id: string; name: string }>(`select u.id, u.name from teachers t join users u on u.id = t.user_id where t.archived_at is null and u.disabled_at is null order by u.name`))]);
  const school = jar.get(SCHOOL_COOKIE)?.value || siteSchool();
  const views = [{ value: "admin", label: "Admin" }, ...teachers.map((t) => ({ value: `t:${t.id}`, label: `Teacher: ${t.name}` })),
    { value: "p", label: "Parent…" }, { value: "s", label: "Student…" }];
  return <div className="adm" style={{ ["--brand" as string]: hex(brand.primary, "#0f1747"), ["--brand-accent" as string]: hex(brand.accent, "#e3cd4b") }}><DashStyles /><div className="app">
    <aside className="side">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <a className="logo" href="/admin" title="Dashboard"><img src={logo} alt="OH-SO ED: go to the dashboard" width={773} height={224} /></a>
      <Switchers schools={schools.map((x) => ({ value: x.slug, label: x.name }))} school={school} views={views} view="admin" />
      <AdminNav counts={{ "/admin/enquiries": c.enq, "/admin/jobs": c.jobs, "/admin/payments": c.failed, "/admin/tasters": c.tasters, "/admin/reports": x.rep, "/admin/messages": x.msg, "/admin/attendance": x.joins, "/admin/email": inboxUnread }} />
      <div className="who"><span>Signed in as<br /><b>{me.name}</b></span>
        <form action={signOutAction}><button className="abtn sm side-btn" type="submit">Sign out</button></form>
        <a href="/" style={{ color: "#c9cde4", fontSize: 15.5 }}>View the website</a></div>
    </aside>
    <main className="main">{children}</main>
    <Assistant />
  </div></div>;
}
