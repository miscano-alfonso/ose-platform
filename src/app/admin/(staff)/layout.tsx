import { NotifyCenter } from "../../NotifyCenter";
import type { Metadata } from "next";
import { cookies } from "next/headers";
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

  if (me.role === "school_admin") return <div className="adm" data-theme={theme} data-palette={palette} style={style}><DashStyles />
    <LessonWindow /><NotifyCenter api="/admin/notify-api" role="admin" /><div className="staffbar">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <a href="/admin"><img src={logo} alt="OH-SO ED" width={773} height={224} /></a>
      <span className="grow" /><a className="abtn sm side-btn" href="/admin">Back to the admin</a>
    </div><main className="main staffmain">{children}</main></div>;

  const [c] = await withSchool((q) => q<{ msgs: number; reports: number }>(`select
    (select count(*)::int from message_threads th join teachers t on t.id = th.teacher_id where t.user_id = $1 and th.status = 'open'
      and (select m.sender from messages m where m.thread_id = th.id order by m.created_at desc limit 1) = 'parent') as msgs,
    (select count(*)::int from report_entries e join report_cycles cy on cy.id = e.cycle_id join course_groups g on g.id = e.group_id join teachers t on t.id = g.teacher_id
      where t.user_id = $1 and cy.status <> 'published' and e.status in ('todo','draft','returned')) as reports`, [me.id]));

  return <div className="adm" data-theme={theme} data-palette={palette} style={style}><DashStyles />
    {me.viewing && <form action={stopViewingAction} className="viewbar"><span>Viewing as <b>{me.name}</b> (teacher). You see exactly what they see; anything you change is recorded as you, {me.realName}.</span>
      <button className="abtn sm" type="submit">Back to the admin</button></form>}
    <LessonWindow /><NotifyCenter api="/admin/notify-api" role="teacher" /><div className="app">
      <aside className="side">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {sch?.is_demo ? <a className="logo" href="/admin/teacher" title="My day" style={{ font: "600 24px/1.1 Jost, sans-serif", letterSpacing: ".06em", textTransform: "uppercase", textDecoration: "none" }}>{sch.name}<br /><span style={{ fontSize: 12, letterSpacing: ".2em", opacity: .8 }}>Demo school</span></a>
        : <a className="logo" href="/admin/teacher" title="My day"><img src={logo} alt="OH-SO ED: go to My day" width={773} height={224} /></a>}
        <TeacherNav counts={{ "/admin/teacher/messages": c.msgs, "/admin/teacher/reports": c.reports }} groups={await menuFor("teacher")} />
        <SideFoot theme={theme} signOut={signOutAction} inline toggle />
      </aside>
      <main className="main"><TopBar />{children}</main>
    </div></div>;
}
