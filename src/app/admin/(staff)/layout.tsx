import { NotifyCenter } from "../../NotifyCenter";
import { MenuSearch } from "../MenuSearch";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { requireViewer } from "@/lib/auth";
import { withSchool } from "@/lib/db";
import { signOutAction, stopViewingAction } from "../actions";
import "../admin.css";
import { DashStyles } from "../DashStyles";
import { brandSrc } from "@/lib/brand";
import { TeacherNav } from "../AdminNav";
import { LessonWindow } from "../../LessonWindow";
import { menuFor } from "@/lib/menu-config";
import { after } from "next/server";
import { checkinsBackground } from "@/lib/checkins";
import { TopBar, SideFoot } from "../TopBar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Staff", robots: { index: false, follow: false } };

// The teacher's area (My day, 1:1s, messages, chats, points, reports, timetable, pay), laid out like the admin with its own menu.
// Admins reach these pages too: while "Viewing as" a teacher they see that teacher's menu; otherwise (opening a register
// or a report sheet from the admin) they get a slim bar back to the admin.
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const tv = (await cookies()).get("ose_theme")?.value, theme = tv === "light" || tv === "dark" ? tv : undefined;
  const me = await requireViewer();
  after(() => checkinsBackground()); // a school without Meet may only ever have teachers signed in
  const { logo } = await brandSrc();
  const sch = (await withSchool((q) => q<{ brand: { primary?: string; accent?: string }; is_demo: boolean; name: string }>(`select brand, is_demo, name from schools where id = current_school()`)))[0];
  const brand = sch?.brand ?? {}, palette = sch?.is_demo ? "demo" : undefined;
  const inkOn = (h: string) => { const n = parseInt(h.slice(1), 16), l = (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255; return l < 0.6 ? "#ffffff" : "#0f1747"; };
  const hex = (v: unknown, d: string) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : d;
  const style = { ["--brand" as string]: hex(brand.primary, "#0f1747"), ["--brand-accent" as string]: hex(brand.accent, "#e3cd4b"), ["--brand-accent-ink" as string]: inkOn(hex(brand.accent, "#e3cd4b")) };

  // 27 Nov: an admin who also teaches, in Teacher mode (and not Viewing as someone), gets her own full teacher dashboard
  const { staffMode, teachesSelf } = await import("@/lib/staff-mode");
  const ownTeacher = me.role === "school_admin" && !me.viewing && !(await headers()).get("x-ose-preview") && await staffMode() === "teacher" && await teachesSelf(me.id);
  if (me.role === "school_admin" && !ownTeacher) return <div className="adm" data-theme={theme} data-palette={palette} style={style}><DashStyles who="teacher" />
    <LessonWindow /><NotifyCenter api="/admin/notify-api" role="admin" /><div className="staffbar">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <a href="/admin"><img src={logo} alt="OH-SO ED" width={773} height={224} /></a>
      <span className="grow" /><a className="abtn sm side-btn" href="/admin">Back to the admin</a>
    </div><main className="main staffmain">{children}</main></div>;

  // Admin → Visitors: a teacher using their dashboard (not an admin, not "Viewing as")
  if (me.role === "school_admin") await import("@/lib/visitors").then((v) => v.noteStaffBrowser(me.id)).catch(() => null);   // 27 Nov: e.g. Leanne in Teacher mode
  if (!me.viewing && me.role === "teacher") await import("@/lib/visitors").then((v) => v.logDashboard("teacher", me.id)).catch(() => null);
  const [c] = await withSchool((q) => q<{ msgs: number; reports: number; marking: number }>(`select
    -- 26 Nov: unread conversations in the Messages inbox (families, messages from the office, replies from the school)
    ((select count(*)::int from message_threads th join teachers t on t.id = th.teacher_id where t.user_id = $1
        and exists (select 1 from messages m where m.thread_id = th.id and m.sender = 'parent' and m.read_by_teacher_at is null))
     + (select count(*)::int from office_threads th join teachers t on t.id = th.teacher_id where t.user_id = $1 and th.to_kind = 'teacher'
        and exists (select 1 from office_messages m where m.thread_id = th.id and m.sender = 'office' and m.read_at is null))
     + (select count(distinct im.thread_id)::int from inbox_messages im where im.kind = 'staff' and lower(im.from_email::text) = (select lower(email::text) from users where id = $1)
        and im.replied_at > coalesce((select ts.seen_at from teacher_seen ts where ts.user_id = $1 and ts.key = 'school:' || im.thread_id), '2026-11-26T12:00:00Z'::timestamptz))) as msgs,
    (select count(*)::int from report_entries e join report_cycles cy on cy.id = e.cycle_id join course_groups g on g.id = e.group_id join teachers t on t.id = g.teacher_id
      where t.user_id = $1 and cy.status <> 'published' and e.status in ('todo','draft','returned')) as reports,
    (select count(*)::int from classroom_submissions s join classroom_coursework cw on cw.id = s.coursework_id join course_groups g on g.id = cw.group_id join teachers t on t.id = g.teacher_id
      where t.user_id = $1 and s.state = 'turned_in' and cw.resolved_at is null and not coursework_earlier_term(cw.title, coalesce(cw.due_at, cw.created_at))
        and exists (select 1 from enrolments e where e.group_id = g.id and e.student_id = s.student_id and e.status in ('active', 'pending')))
    -- 26 Nov: past papers paid for and not sent back yet
    + (select count(*)::int from marking_jobs j join teachers t on t.id = j.teacher_id where t.user_id = $1 and j.paid_at is not null and j.returned_at is null) as marking`, [me.id]));

  return <div className="adm" data-theme={theme} data-palette={palette} style={style}><DashStyles who="teacher" />
    {me.viewing && !(await headers()).get("x-ose-preview") && <form action={stopViewingAction} className="viewbar"><span>Viewing as <b>{me.name}</b> (teacher). You see exactly what they see; anything you change is recorded as you, {me.realName}.</span>
      <button className="abtn sm" type="submit">Back to the admin</button></form>}
    <LessonWindow /><NotifyCenter api="/admin/notify-api" role="teacher" /><div className="app">
      <aside className="side">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {sch?.is_demo ? <a className="logo" href="/admin/teacher" title="My day" style={{ font: "600 24px/1.1 Jost, sans-serif", letterSpacing: ".06em", textTransform: "uppercase", textDecoration: "none" }}>{sch.name}<br /><span style={{ fontSize: 12, letterSpacing: ".2em", opacity: .8 }}>Demo school</span></a>
        : <a className="logo" href="/admin/teacher" title="My day"><img src={logo} alt="OH-SO ED: go to My day" width={773} height={224} /></a>}
        <MenuSearch area="teacher" page="/admin/teacher/search" />
        <TeacherNav counts={{ "/admin/teacher/messages": c.msgs, "/admin/teacher/reports": c.reports, "/admin/teacher/marking": c.marking }} groups={await teacherMenu()} />
        <SideFoot theme={theme} signOut={signOutAction} inline toggle settings="/admin/teacher/notifications" mode={ownTeacher ? "teacher" : undefined} home={{ href: "/admin/teacher", label: "My day" }} />
      </aside>
      <main className="main"><TopBar />{await import("@/lib/test-mode").then(async (t) => await t.betaOn() ? <p className="note beta-strip" role="note">{t.BETA.stripTeacher}</p> : null)}{children}</main>
    </div></div>;
}

/** The teacher menu, with Class chats greyed when messaging families is switched off. */
async function teacherMenu() {
  const [groups, on] = await Promise.all([menuFor("teacher"), import("@/lib/teacher-area").then((t) => t.familyMsgsOn())]);
  const marked = on ? groups : groups.map((g) => ({ ...g, items: g.items.map((i) => i.href === "/admin/teacher/chats" ? { ...i, off: true } : i) }));
  // 26 Nov (Alfonso): Calendar sync, Google Drive and Notifications left the menu; the cog beside Sign out opens them as Settings tabs
  const { SETTINGS_HREFS } = await import("@/app/SettingsTabs");
  return marked.map((g) => ({ ...g, items: g.items.filter((i) => !SETTINGS_HREFS.has(i.href)) })).filter((g) => g.items.length);
}
