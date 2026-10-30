import { NotifyCenter } from "../../NotifyCenter";
import type { Metadata } from "next";
import { after } from "next/server";
import { socialBackground } from "@/lib/social";
import { meetBackground } from "@/lib/meet";
import { automationsBackground } from "@/lib/automations";
import { classroomBackground } from "@/lib/classroom";
import { invitesBackground } from "@/lib/classroom-invites";
import { inboxBackground, unreadInbox } from "@/lib/inbox";
import { recordingsBackground } from "@/lib/recordings";
import { checkinsBackground } from "@/lib/checkins";
import { zoomBackground } from "@/lib/zoom";
import { requireStaff, isDemoVisitor } from "@/lib/auth";
import { withSchool } from "@/lib/db";
import { signOutAction } from "../actions";
import { AdminNav } from "../AdminNav";
import { LessonWindow } from "../../LessonWindow";
import { menuFor } from "@/lib/menu-config";
import "../admin.css";
import { DashStyles } from "../DashStyles";
import { brandSrc } from "@/lib/brand";
import { cookies, headers } from "next/headers";
import { schoolPlan, notInPlan, PLAN_NAME, STUDENTS_INCLUDED } from "@/lib/plan";
import { schoolsFor, siteSchool, SCHOOL_COOKIE } from "@/lib/db";
import { Switchers } from "../Switchers";
import { Assistant } from "../Assistant";
import { TopBar, SideFoot } from "../TopBar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const tv = (await cookies()).get("ose_theme")?.value, theme = tv === "light" || tv === "dark" ? tv : undefined;
  const me = await requireStaff();
  after(() => socialBackground());
  after(() => meetBackground());
  after(() => checkinsBackground()); // Join-button check-ins become marks once each lesson ends
  after(() => zoomBackground()); // who joined each Zoom lesson (every 3 hours), and new Zoom recordings to Classroom
  after(() => invitesBackground());   // Classroom invitations for new places, removals for ended ones (if switched on)
  after(() => classroomBackground()); // class work and marks from Google Classroom, every 6 hours
  after(() => inboxBackground());
  after(() => recordingsBackground()); // lesson recordings: renamed, filed, posted to Classroom, title cards // families' emails from the school inbox, every 15 minutes
  after(() => automationsBackground()); // lesson reminders, taster emails, payment reminders… // reads new Google Meet joins every few hours, and sends Friday's attendance alert // scheduled Instagram posts and the weekly moments report, after the page is sent
  const { logo, custom } = await brandSrc();
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
  const chatAlerts = (await withSchool((q) => q<{ n: number }>(`select (select count(*)::int from student_chat_flags where status = 'open') + (select count(*)::int from student_chat_reports where status = 'open') as n`)).catch(() => [{ n: 0 }]))[0]?.n ?? 0;
  const pl = await schoolPlan();
  const menu = (await menuFor("admin")).map((g) => ({ ...g, items: g.items.filter((i) => !notInPlan(pl.plan, i.href)) })).filter((g) => g.items.length);
  const path = (await headers()).get("x-ose-path") ?? "";
  const testOn = await import("@/lib/test-mode").then((t) => t.isTestMode()).catch(() => false);
  const jar = await cookies();
  const sch = (await withSchool((q) => q<{ brand: { primary?: string; accent?: string }; is_demo: boolean; name: string }>(`select brand, is_demo, name from schools where id = current_school()`)))[0];
  const brand = sch?.brand ?? {}, demo = !!sch?.is_demo;
  const inkOn = (h: string) => { const n = parseInt(h.slice(1), 16), l = (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255; return l < 0.6 ? "#ffffff" : "#0f1747"; };
  const hex = (v: unknown, d: string) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : d;
  const [schools, teachers] = await Promise.all([schoolsFor(me.email), withSchool((q) => q<{ id: string; name: string }>(`select u.id, u.name from teachers t join users u on u.id = t.user_id where t.archived_at is null and u.disabled_at is null order by u.name`))]);
  const school = jar.get(SCHOOL_COOKIE)?.value || siteSchool();
  const views = [{ value: "admin", label: "Admin" }, ...teachers.map((t) => ({ value: `t:${t.id}`, label: `Teacher: ${t.name}` })),
    { value: "p", label: "Parent…" }, { value: "s", label: "Student…" }];
  return <div className="adm" data-theme={theme} style={{ ["--brand" as string]: hex(brand.primary, "#0f1747"), ["--brand-accent" as string]: hex(brand.accent, "#e3cd4b"), ["--brand-accent-ink" as string]: inkOn(hex(brand.accent, "#e3cd4b")) }}><DashStyles /><LessonWindow /><NotifyCenter api="/admin/notify-api" role="admin" /><div className="app">
    <aside className="side">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {demo || (pl.plan && !custom.logo) ? <a className="logo" href="/admin" title="Dashboard" style={{ color: "#fff", font: "600 24px/1.1 Jost, sans-serif", letterSpacing: ".06em", textTransform: "uppercase", textDecoration: "none" }}>{sch.name}<br /><span style={{ fontSize: 12, letterSpacing: ".2em", opacity: .8 }}>{demo ? "Demo school" : `${PLAN_NAME[pl.plan!]} plan`}</span></a>
      : <a className="logo" href="/admin" title="Dashboard"><img src={logo} alt="OH-SO ED: go to the dashboard" width={773} height={224} /></a>}
      <AdminNav counts={{ "/admin/enquiries": c.enq, "/admin/jobs": c.jobs, "/admin/payments": c.failed, "/admin/tasters": c.tasters, "/admin/reports": x.rep, "/admin/messages": x.msg, "/admin/attendance": x.joins, "/admin/email": inboxUnread, "/admin/student-chat": chatAlerts }} groups={menu} />
      <SideFoot theme={theme} signOut={signOutAction} switchers={<Switchers schools={schools.filter((x) => !isDemoVisitor(me.email) || x.slug === school).map((x) => ({ value: x.slug, label: x.name }))} school={school} views={views} view="admin" />}
        site={pl.plan ? [{ href: "/osedtech", label: "OH-SO EdTech" }] : isDemoVisitor(me.email) ? [{ href: "/osedtech/demo/site", label: "View the school’s website" }, { href: "/osedtech", label: "Back to OH-SO EdTech" }] : [{ href: "/", label: "View the website" }]} />
    </aside>
    <main className="main"><TopBar>{!demo && !pl.plan && testOn ? <><b>Test mode is on:</b> real data is read as normal, but nothing goes to families, students or teachers. <a href="/admin/test-mode">See what’s held</a></> : null}</TopBar>{demo && (isDemoVisitor(me.email) ? <p className="note msg" style={{ marginTop: 0 }}><b>Demo school.</b> Everything here is made up, so click anything: nothing is ever emailed, charged or posted, and the demo is made fresh every day. Try <b>Viewing as</b> (bottom left) to see a teacher’s, parent’s or student’s view. <a href="/osedtech/trial">Start a free trial</a> to get your own school.</p> : <p className="note msg" style={{ marginTop: 0 }}><b>Demo school.</b> Everything here is made up (families, children, payments and messages), so you can click anything safely. Nothing is ever emailed or charged. Switch back with the School menu.</p>)}{pl.plan && <TrialBar plan={PLAN_NAME[pl.plan]} days={pl.daysLeft} ended={pl.ended} students={pl.students} included={STUDENTS_INCLUDED[pl.plan]} />}{pl.ended ? <TrialEnded /> : notInPlan(pl.plan, path) ? <NotInPlan plan={PLAN_NAME[pl.plan!]} /> : <>{pl.plan && path === "/admin" && pl.classes === 0 && <GettingStarted name={sch.name} />}{children}</>}</main>
    {!pl.plan || pl.plan === "school" ? <Assistant /> : null}
  </div></div>;
}

/** OH-SO EdTech trial schools: days left, and what the trial does and doesn't do. */
function TrialBar({ plan, days, ended, students, included }: { plan: string; days: number | null; ended: boolean; students: number; included: number }) {
  if (ended) return null;
  return <p className="note msg" style={{ marginTop: 0 }}><b>{plan} trial{days != null ? ` · ${days} day${days === 1 ? "" : "s"} left` : ""}.</b> {students} of {included} students included.
    {" "}While you try it, nothing is emailed to families or charged, and families can’t sign in yet. <a href="/osedtech/pricing">Compare plans</a> · <a href="mailto:alfonso@ohsoed.co.uk?subject=OH-SO%20EdTech%20trial">Ask us anything</a></p>;
}
function TrialEnded() {
  return <div className="card" style={{ maxWidth: 640 }}><h1 style={{ marginTop: 0 }}>Your free trial has ended</h1>
    <p>Thanks for trying OH-SO EdTech. Everything you added is kept for now. To carry on, choose a plan and we’ll switch your school over, or ask us for a few more days.</p>
    <p style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><a className="abtn pri" href="mailto:alfonso@ohsoed.co.uk?subject=OH-SO%20EdTech%3A%20carry%20on%20after%20my%20trial">Email us to carry on</a><a className="abtn" href="/osedtech/pricing">See the plans</a></p></div>;
}
function NotInPlan({ plan }: { plan: string }) {
  return <div className="card" style={{ maxWidth: 640 }}><h1 style={{ marginTop: 0 }}>Not in the {plan} plan</h1>
    <p>This part of the dashboard comes with a bigger plan.</p><p><a className="abtn" href="/osedtech/pricing">Compare plans</a> <a className="abtn" href="/admin">Back to the dashboard</a></p></div>;
}

/** A new trial school, before its first class: where to start. */
function GettingStarted({ name }: { name: string }) {
  const steps: [string, string, string][] = [
    ["/admin/school", "Your school", "Check the name and pick your colours."],
    ["/admin/website", "Your logo", "Upload your logo and browser icon."],
    ["/admin/term-dates", "Term dates", "UK term dates are in already. Change them to yours."],
    ["/admin/prices", "Prices", "Set your price per lesson for each level."],
    ["/admin/classes", "Classes", "Add your first class, then its weekly time in Timetable setup."],
    ["/admin/families", "Families", "Add families and their children, or import a spreadsheet."],
  ];
  return <div className="card" style={{ marginBottom: 18 }}><h2 style={{ marginTop: 0 }}>Welcome to {name}</h2>
    <p className="muted" style={{ marginTop: -4 }}>Six steps to see your school running. This goes once your first class is added.</p>
    <ol style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 10, padding: 0, margin: 0, listStyle: "none", counterReset: "s" }}>
      {steps.map(([href, t, d], i) => <li key={href}><a href={href} className="gs-step"><b>{i + 1}. {t}</b><span>{d}</span></a></li>)}</ol></div>;
}
