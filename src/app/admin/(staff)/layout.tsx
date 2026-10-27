import type { Metadata } from "next";
import { cookies } from "next/headers";
import { requireViewer } from "@/lib/auth";
import { withSchool, schoolsFor, siteSchool, SCHOOL_COOKIE } from "@/lib/db";
import { signOutAction, stopViewingAction } from "../actions";
import "../admin.css";
import { DashStyles } from "../DashStyles";
import { brandSrc } from "@/lib/brand";
import { TeacherNav } from "../AdminNav";
import { Switchers } from "../Switchers";
import { SideToggle } from "../SideToggle";
import { ThemeToggle } from "../ThemeToggle";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Staff", robots: { index: false, follow: false } };

// The teacher's area (My day, 1:1s, messages, chats, points, reports, timetable, pay), laid out like the admin with its own menu.
// Admins reach these pages too: while "Viewing as" a teacher they see that teacher's menu; otherwise (opening a register
// or a report sheet from the admin) they get a slim bar back to the admin.
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const tv = (await cookies()).get("ose_theme")?.value, theme = tv === "light" || tv === "dark" ? tv : undefined;
  const me = await requireViewer();
  const { logo } = await brandSrc();
  const brand = (await withSchool((q) => q<{ brand: { primary?: string; accent?: string } }>(`select brand from schools where id = current_school()`)))[0]?.brand ?? {};
  const inkOn = (h: string) => { const n = parseInt(h.slice(1), 16), l = (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255; return l < 0.6 ? "#ffffff" : "#0f1747"; };
  const hex = (v: unknown, d: string) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : d;
  const style = { ["--brand" as string]: hex(brand.primary, "#0f1747"), ["--brand-accent" as string]: hex(brand.accent, "#e3cd4b"), ["--brand-accent-ink" as string]: inkOn(hex(brand.accent, "#e3cd4b")) };

  if (me.role === "school_admin") return <div className="adm" data-theme={theme} style={style}><DashStyles />
    <div className="staffbar">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <a href="/admin"><img src={logo} alt="OH-SO ED" width={773} height={224} /></a>
      <span className="grow" /><a className="abtn sm side-btn" href="/admin">Back to the admin</a>
    </div><main className="main staffmain">{children}</main></div>;

  const [c] = await withSchool((q) => q<{ msgs: number; reports: number }>(`select
    (select count(*)::int from message_threads th join teachers t on t.id = th.teacher_id where t.user_id = $1 and th.status = 'open'
      and (select m.sender from messages m where m.thread_id = th.id order by m.created_at desc limit 1) = 'parent') as msgs,
    (select count(*)::int from report_entries e join report_cycles cy on cy.id = e.cycle_id join course_groups g on g.id = e.group_id join teachers t on t.id = g.teacher_id
      where t.user_id = $1 and cy.status <> 'published' and e.status in ('todo','draft','returned')) as reports`, [me.id]));
  let switchers = null;
  if (me.viewing) {
    const jar = await cookies();
    const [schools, teachers] = await Promise.all([schoolsFor(me.realEmail ?? ""), withSchool((q) => q<{ id: string; name: string }>(`select u.id, u.name from teachers t join users u on u.id = t.user_id
      where t.archived_at is null and u.disabled_at is null order by u.name`))]);
    const views = [{ value: "admin", label: "Admin" }, ...teachers.map((t) => ({ value: `t:${t.id}`, label: `Teacher: ${t.name}` })),
      { value: "p", label: "Parent…" }, { value: "s", label: "Student…" }];
    switchers = <Switchers schools={schools.map((x) => ({ value: x.slug, label: x.name }))} school={jar.get(SCHOOL_COOKIE)?.value || siteSchool()} views={views} view={`t:${me.id}`} />;
  }
  return <div className="adm" data-theme={theme} style={style}><DashStyles />
    {me.viewing && <form action={stopViewingAction} className="viewbar"><span>Viewing as <b>{me.name}</b> (teacher). You see exactly what they see; anything you change is recorded as you, {me.realName}.</span>
      <button className="abtn sm" type="submit">Back to the admin</button></form>}
    <div className="app">
      <aside className="side"><SideToggle />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <a className="logo" href="/admin/teacher" title="My day"><img src={logo} alt="OH-SO ED: go to My day" width={773} height={224} /></a>
        {switchers}
        <TeacherNav counts={{ "/admin/teacher/messages": c.msgs, "/admin/teacher/reports": c.reports }} />
        <div className="who"><span>Signed in as<br /><b>{me.viewing ? me.realName : me.name}</b></span>
          <form action={signOutAction}><button className="abtn sm side-btn" type="submit">Sign out</button></form><ThemeToggle initial={theme ?? "auto"} />
          <a href="/" style={{ color: "#c9cde4", fontSize: 15.5 }}>View the website</a></div>
      </aside>
      <main className="main">{children}</main>
    </div></div>;
}
